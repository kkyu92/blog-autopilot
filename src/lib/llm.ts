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
    const child = spawn(
      'claude',
      [
        '-p', opts.userMessage,
        '--system-prompt', opts.systemPrompt,
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
        try { JSON.parse(stdout); } catch (e) { return reject(new Error(`invalid JSON: ${(e as Error).message}`)); }
      }
      resolve(stdout);
    });
    child.on('error', reject);
  });
}
