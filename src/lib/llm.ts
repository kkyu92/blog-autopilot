import { spawn } from 'node:child_process';

export interface CallClaudeOptions {
  systemPrompt: string;
  userMessage: string;
  model?: 'sonnet' | 'opus'; // default 'sonnet' (= sonnet-4-6)
  expectJson?: boolean;
}

export async function callClaude(opts: CallClaudeOptions): Promise<string> {
  const model = opts.model ?? 'sonnet';
  return new Promise((resolve, reject) => {
    const fullPrompt = `${opts.systemPrompt}\n\n---\n\n${opts.userMessage}`;
    const child = spawn('claude', ['-p', fullPrompt, '--dangerously-skip-permissions', '--model', model], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`claude CLI exit ${code}: ${stderr}`));
      if (opts.expectJson) {
        try { JSON.parse(stdout); } catch (e) { return reject(new Error(`invalid JSON: ${e}`)); }
      }
      resolve(stdout.trim());
    });
    child.on('error', reject);
  });
}
