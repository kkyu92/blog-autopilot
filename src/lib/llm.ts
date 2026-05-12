import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface CallClaudeOptions {
  systemPrompt: string;
  userMessage: string;
  model?: 'sonnet' | 'opus'; // default 'sonnet' (= sonnet-4-6)
  expectJson?: boolean;
  /**
   * expectJson 모드에서 JSON parse 실패 시 자동 retry 횟수. default 1 (즉 최대 2회 시도).
   * 4/27 cron의 #21 황사 케이스: LLM이 JSON wrapper 통째로 누락하고 content_html 본문만 출력 →
   * 비결정적 drift이므로 1회 retry가 효과적.
   */
  jsonRetries?: number;
  /**
   * spawn된 claude CLI 응답 timeout (ms). default 900_000 (15분).
   * 4/28 cron 25010381167 fact-checker 무한 hang 사고: claude CLI 응답이 안 와도 child가
   * close 이벤트를 영영 안 보내서 await 무한 대기 → runner 점유. 다음 cron 차단.
   * timeout 시 SIGTERM, 5초 후 안 죽으면 SIGKILL.
   *
   * 4/30 cron 25124826827 evidence: niche 병렬 동시 3 호출 환경에서 600s timeout 2건 발생
   * (uptime 34.2min, 42.9min). 동일 패턴이 manual dispatch (89% success)에선 less severe →
   * schedule cron 환경 + concurrent 호출 조합에서 LLM 응답이 600s 넘어 도달하는 케이스 추정.
   * F2-B: 600s → 900s. F1'-b orphan-kill 활성으로 zombie 위험 없음.
   */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 900_000;
const FORCE_KILL_GRACE_MS = 5_000;
// F2-C (5/12 박제 정정): slow LLM (editor.review ~10min) visibility 로그 주기.
// HANG family 3회 박제 (5/11~5/12) = 사실상 0회 진짜 hang, 모두 premature cancel evidence.
// 60초마다 "still waiting" 로그로 사용자가 활성 LLM 호출 진행 중임을 인지 → cancel 방지.
const PROGRESS_LOG_INTERVAL_MS = 60_000;
// F1'-c: spawn-level transient OS error retry. 4/29 cron 25085433470 fail evidence:
// "spawn claude ENOENT", "spawn Unknown system error -8". 호출 누적 후 OS-level transient.
const SPAWN_RETRY_DELAY_MS = 5_000;
const SPAWN_TRANSIENT_PATTERN = /\b(ENOENT|EFAULT|EIO|EAGAIN|EBADF|EMFILE|ENFILE)\b|Unknown system error|spawn [a-z]+ failed/i;
// F1'-a: instrumentation. callClaude 누적 호출 카운트 + 시각 추적.
let _claudeCallCount = 0;
let _claudeFirstCallAt: number | null = null;
export function getClaudeCallStats(): { count: number; firstCallAt: number | null; uptimeMs: number | null } {
  return {
    count: _claudeCallCount,
    firstCallAt: _claudeFirstCallAt,
    uptimeMs: _claudeFirstCallAt ? Date.now() - _claudeFirstCallAt : null,
  };
}

const JSON_GUARD = '\n\n---\n\nCRITICAL: Your response MUST be valid JSON only — no markdown headers, no preamble, no closing remarks, no code fences. Reply with the raw JSON object or array as the entire response. Start your response with `{` or `[` immediately.';

// F2-A 강화 (5/1 evidence): callClaude inner retry에서 invalid JSON 두 번 연속 fail 케이스 대응.
// 5/1 cron 25180460128 WS HPV 슬롯 raw len 15704자, pos 1121에서 parse 실패 → 긴 응답 중 escape 손상.
// retry 시 system prompt에 escape/length 가이드 추가 주입해 LLM이 JSON 무결성에 더 신경쓰도록.
const JSON_RETRY_GUARD = '\n\n---\n\nRETRY (previous response rejected): JSON.parse failed on the prior attempt. Common causes — (1) unescaped " inside string values: use \\" for every internal double-quote, (2) trailing comma before } or ], (3) markdown code fences wrapping the output, (4) explanatory text after the closing brace. Re-emit the COMPLETE JSON object with ALL internal quotes properly escaped. Begin response with `{` immediately. If the JSON is long, double-check that every string value is properly terminated and escaped.';

// stdout이 markdown 등으로 둘러싸여 있을 때 JSON만 추출 (LLM drift 방어).
// content_html 안의 } 또는 ] 가 lastIndexOf로 잘못 잡히지 않도록
// bracket-balanced walk 사용 (string 안 escape 인식).
export function extractJson(stdout: string): string {
  let s = stdout.trim();
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) s = fenceMatch[1].trim();

  const start = s.search(/[{[]/);
  if (start === -1) {
    // No JSON delimiters at all — LLM drift output (e.g., raw content_html). Surface clearly.
    throw new Error('no JSON delimiter found in output');
  }
  s = s.slice(start);

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return s.slice(0, i + 1);
    }
  }
  return s;
}

function dumpBadOutput(stdout: string): string | null {
  try {
    const dumpPath = join(homedir(), 'logs', `llm-bad-json-${Date.now()}.txt`);
    mkdirSync(dirname(dumpPath), { recursive: true });
    writeFileSync(dumpPath, stdout);
    return dumpPath;
  } catch {
    return null;
  }
}

function spawnClaudeOnce(opts: CallClaudeOptions): Promise<{ stdout: string; stderr: string; code: number | null; signal: NodeJS.Signals | null }> {
  const model = opts.model ?? 'sonnet';
  const systemPrompt = opts.expectJson ? opts.systemPrompt + JSON_GUARD : opts.systemPrompt;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(
      'claude',
      [
        '-p', opts.userMessage,
        '--system-prompt', systemPrompt,
        '--dangerously-skip-permissions',
        '--model', model,
        '--tools', '',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    const timeoutTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGTERM'); } catch { /* child already dead */ }
      forceKillTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* dead */ }
      }, FORCE_KILL_GRACE_MS);
      reject(new Error(`claude CLI timeout after ${timeoutMs}ms (SIGTERM sent)`));
    }, timeoutMs);

    const progressTimer = setInterval(() => {
      if (settled) return;
      const elapsedMin = ((Date.now() - startedAt) / 60_000).toFixed(1);
      const timeoutMin = (timeoutMs / 60_000).toFixed(0);
      console.log(`[llm] still waiting for claude CLI (elapsed ${elapsedMin}min / timeout ${timeoutMin}min)`);
    }, PROGRESS_LOG_INTERVAL_MS);
    progressTimer.unref?.();

    const clearTimers = () => {
      clearTimeout(timeoutTimer);
      clearInterval(progressTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    };

    child.stdout.on('data', (chunk: Buffer) => { stdoutChunks.push(chunk); });
    child.stderr.on('data', (chunk: Buffer) => { stderrChunks.push(chunk); });
    child.on('close', (code, signal) => {
      clearTimers();
      if (settled) return;
      settled = true;
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      resolve({ stdout, stderr, code, signal });
    });
    child.on('error', (err) => {
      clearTimers();
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

// F1'-c: spawn-level transient error wrapper. spawnClaudeOnce가 throw하는 ENOENT/EFAULT/-8 같은
// OS-level transient를 5초 sleep 후 1회 retry. timeout은 transient 아니므로 retry 안 함 (10분 hang은
// 진짜 문제 → escalate). JSON parse retry와 별개 layer (callClaude 안 jsonRetries는 그대로).
async function spawnClaudeWithRetry(opts: CallClaudeOptions): Promise<{ stdout: string; stderr: string; code: number | null; signal: NodeJS.Signals | null }> {
  const maxAttempts = 2;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await spawnClaudeOnce(opts);
    } catch (err) {
      lastErr = err as Error;
      const msg = lastErr.message ?? '';
      const isTransient = SPAWN_TRANSIENT_PATTERN.test(msg);
      const isTimeout = /timeout after/.test(msg);
      if (isTransient && !isTimeout && attempt < maxAttempts) {
        console.warn(`[llm] spawn-level transient (attempt ${attempt}/${maxAttempts}): ${msg.slice(0, 160)} — retry in ${SPAWN_RETRY_DELAY_MS}ms`);
        await new Promise((r) => setTimeout(r, SPAWN_RETRY_DELAY_MS));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new Error('spawnClaudeWithRetry: unknown failure');
}

export async function callClaude(opts: CallClaudeOptions): Promise<string> {
  // F1'-a instrumentation: 누적 호출 카운트 + 첫 호출 시각 (5/6 검증 시 H3·H4 root cause 판정용).
  _claudeCallCount += 1;
  if (_claudeFirstCallAt === null) _claudeFirstCallAt = Date.now();
  const callIdx = _claudeCallCount;
  const uptimeMin = _claudeFirstCallAt ? ((Date.now() - _claudeFirstCallAt) / 60_000).toFixed(1) : '0.0';
  console.log(`[llm] call #${callIdx} (uptime ${uptimeMin}min) model=${opts.model ?? 'sonnet'} expectJson=${!!opts.expectJson}`);

  const maxJsonAttempts = opts.expectJson ? 1 + (opts.jsonRetries ?? 1) : 1;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= maxJsonAttempts; attempt++) {
    // F2-A 강화: attempt 2+에서는 system prompt에 JSON_RETRY_GUARD 추가 주입.
    // expectJson=false인 경우 maxJsonAttempts==1이라 이 분기 도달 안 함.
    const attemptOpts = attempt === 1
      ? opts
      : { ...opts, systemPrompt: opts.systemPrompt + JSON_RETRY_GUARD };
    const { stdout, stderr, code, signal } = await spawnClaudeWithRetry(attemptOpts);
    if (code !== 0) {
      throw new Error(`claude CLI exit ${code ?? `signal ${signal}`}: ${stderr}`);
    }
    if (!opts.expectJson) {
      return stdout;
    }
    try {
      const cleaned = extractJson(stdout);
      JSON.parse(cleaned);
      return cleaned;
    } catch (e) {
      const dumpPath = dumpBadOutput(stdout);
      if (dumpPath) console.error(`[llm] raw dumped → ${dumpPath}`);
      lastErr = new Error(
        `invalid JSON (attempt ${attempt}/${maxJsonAttempts}): ${(e as Error).message} (raw head 200: ${stdout.slice(0, 200)} ... raw len: ${stdout.length})`,
      );
      if (attempt < maxJsonAttempts) {
        console.warn(`[llm] JSON parse failed on attempt ${attempt}/${maxJsonAttempts}, retrying...`);
        continue;
      }
    }
  }

  throw lastErr ?? new Error('callClaude: unknown failure');
}
