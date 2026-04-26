import { spawn } from 'node:child_process';

export interface CallClaudeOptions {
  systemPrompt: string;
  userMessage: string;
  model?: 'sonnet' | 'opus'; // default 'sonnet' (= sonnet-4-6)
  expectJson?: boolean;
}

const JSON_GUARD = '\n\n---\n\nCRITICAL: Your response MUST be valid JSON only — no markdown headers, no preamble, no closing remarks, no code fences. Reply with the raw JSON object or array as the entire response.';

// stdout이 markdown 등으로 둘러싸여 있을 때 JSON만 추출 (LLM drift 방어).
// content_html 안의 } 또는 ] 가 lastIndexOf로 잘못 잡히지 않도록
// bracket-balanced walk 사용 (string 안 escape 인식).
function extractJson(stdout: string): string {
  let s = stdout.trim();
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) s = fenceMatch[1].trim();

  const start = s.search(/[{[]/);
  if (start === -1) return s;
  s = s.slice(start);

  const open = s[0];
  const close = open === '{' ? '}' : ']';
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

export async function callClaude(opts: CallClaudeOptions): Promise<string> {
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
      if (code !== 0) {
        return reject(new Error(`claude CLI exit ${code ?? `signal ${signal}`}: ${stderr}`));
      }
      if (opts.expectJson) {
        const cleaned = extractJson(stdout);
        try {
          JSON.parse(cleaned);
        } catch (e) {
          // raw 전체를 ~/logs로 dump해서 디버그 가능 (CI 로그는 너무 길어 head만)
          try {
            const fs = require('node:fs') as typeof import('node:fs');
            const path = require('node:path') as typeof import('node:path');
            const os = require('node:os') as typeof import('node:os');
            const dumpPath = path.join(os.homedir(), 'logs', `llm-bad-json-${Date.now()}.txt`);
            fs.mkdirSync(path.dirname(dumpPath), { recursive: true });
            fs.writeFileSync(dumpPath, stdout);
            console.error(`[llm] raw dumped → ${dumpPath}`);
          } catch { /* swallow */ }
          return reject(new Error(`invalid JSON: ${(e as Error).message} (raw head 200: ${stdout.slice(0, 200)} ... raw len: ${stdout.length})`));
        }
        return resolve(cleaned);
      }
      resolve(stdout);
    });
    child.on('error', reject);
  });
}
