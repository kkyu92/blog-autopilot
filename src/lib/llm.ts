import { spawn } from 'node:child_process';

export interface CallClaudeOptions {
  systemPrompt: string;
  userMessage: string;
  model?: 'sonnet' | 'opus'; // default 'sonnet' (= sonnet-4-6)
  expectJson?: boolean;
}

const JSON_GUARD = '\n\n---\n\nCRITICAL: Your response MUST be valid JSON only — no markdown headers, no preamble, no closing remarks, no code fences. Reply with the raw JSON object or array as the entire response.';

// stdout이 markdown 등으로 둘러싸여 있을 때 JSON만 추출 (LLM drift 방어)
function extractJson(stdout: string): string {
  let candidate = stdout.trim();
  const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) candidate = fenceMatch[1].trim();
  const firstBrace = candidate.search(/[{[]/);
  if (firstBrace > 0) candidate = candidate.slice(firstBrace);
  const lastObj = candidate.lastIndexOf('}');
  const lastArr = candidate.lastIndexOf(']');
  const lastIdx = Math.max(lastObj, lastArr);
  if (lastIdx >= 0 && lastIdx < candidate.length - 1) candidate = candidate.slice(0, lastIdx + 1);
  return candidate.trim();
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
          return reject(new Error(`invalid JSON: ${(e as Error).message} (raw head: ${stdout.slice(0, 80)})`));
        }
        return resolve(cleaned);
      }
      resolve(stdout);
    });
    child.on('error', reject);
  });
}
