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
}

const JSON_GUARD = '\n\n---\n\nCRITICAL: Your response MUST be valid JSON only — no markdown headers, no preamble, no closing remarks, no code fences. Reply with the raw JSON object or array as the entire response. Start your response with `{` or `[` immediately.';

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
  return new Promise((resolve, reject) => {
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
    child.stdout.on('data', (chunk: Buffer) => { stdoutChunks.push(chunk); });
    child.stderr.on('data', (chunk: Buffer) => { stderrChunks.push(chunk); });
    child.on('close', (code, signal) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim();
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      resolve({ stdout, stderr, code, signal });
    });
    child.on('error', reject);
  });
}

export async function callClaude(opts: CallClaudeOptions): Promise<string> {
  const maxJsonAttempts = opts.expectJson ? 1 + (opts.jsonRetries ?? 1) : 1;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= maxJsonAttempts; attempt++) {
    const { stdout, stderr, code, signal } = await spawnClaudeOnce(opts);
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
