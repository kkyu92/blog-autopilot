import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('callClaude', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('정상 stdout 반환', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: { on: (e: string, cb: (data: Buffer) => void) => { if (e === 'data') cb(Buffer.from('hello')); } },
      stderr: { on: vi.fn() },
      on: (e: string, cb: (code: number) => void) => { if (e === 'close') cb(0); },
    });
    const result = await callClaude({ systemPrompt: 'sys', userMessage: 'hi' });
    expect(result).toBe('hello');
  });

  it('exit code 1 → throw with stderr in message', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: (e: string, cb: (data: Buffer) => void) => { if (e === 'data') cb(Buffer.from('bad error')); } },
      on: (e: string, cb: (code: number) => void) => { if (e === 'close') cb(1); },
    });
    await expect(callClaude({ systemPrompt: 'sys', userMessage: 'hi' })).rejects.toThrow('claude CLI exit 1');
    await expect(callClaude({ systemPrompt: 'sys', userMessage: 'hi' })).rejects.toThrow('bad error');
  });

  it('expectJson + invalid JSON → throw', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: { on: (e: string, cb: (data: Buffer) => void) => { if (e === 'data') cb(Buffer.from('not json')); } },
      stderr: { on: vi.fn() },
      on: (e: string, cb: (code: number) => void) => { if (e === 'close') cb(0); },
    });
    await expect(callClaude({ systemPrompt: 'sys', userMessage: 'hi', expectJson: true })).rejects.toThrow('invalid JSON');
  });

  it('expectJson + valid JSON → resolve as string', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    const json = '{"ok":true}';
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: { on: (e: string, cb: (data: Buffer) => void) => { if (e === 'data') cb(Buffer.from(json)); } },
      stderr: { on: vi.fn() },
      on: (e: string, cb: (code: number) => void) => { if (e === 'close') cb(0); },
    });
    const result = await callClaude({ systemPrompt: 'sys', userMessage: 'hi', expectJson: true });
    expect(result).toBe(json);
    expect(typeof result).toBe('string');
  });

  it('model defaults to sonnet — --model sonnet in spawn args', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: { on: (e: string, cb: (data: Buffer) => void) => { if (e === 'data') cb(Buffer.from('ok')); } },
      stderr: { on: vi.fn() },
      on: (e: string, cb: (code: number) => void) => { if (e === 'close') cb(0); },
    });
    await callClaude({ systemPrompt: 'sys', userMessage: 'hi' });
    const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(spawnArgs[1]).toContain('--model');
    expect(spawnArgs[1]).toContain('sonnet');
    // --tools '' must be present
    const toolsIdx = spawnArgs[1].indexOf('--tools');
    expect(toolsIdx).toBeGreaterThanOrEqual(0);
    expect(spawnArgs[1][toolsIdx + 1]).toBe('');
  });

  it("model='opus' → '--model opus' in args", async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: { on: (e: string, cb: (data: Buffer) => void) => { if (e === 'data') cb(Buffer.from('ok')); } },
      stderr: { on: vi.fn() },
      on: (e: string, cb: (code: number) => void) => { if (e === 'close') cb(0); },
    });
    await callClaude({ systemPrompt: 'sys', userMessage: 'hi', model: 'opus' });
    const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
    const idx = spawnArgs[1].indexOf('--model');
    expect(spawnArgs[1][idx + 1]).toBe('opus');
  });

  it('child error event → reject', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: (e: string, cb: (errOrCode: unknown) => void) => {
        if (e === 'error') cb(new Error('spawn ENOENT'));
      },
    });
    await expect(callClaude({ systemPrompt: 'sys', userMessage: 'hi' })).rejects.toThrow('spawn ENOENT');
  });

  it('UTF-8 multi-byte chars across chunk boundaries', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    // 안 = EC 95 88 — split as [EC] then [95 88]
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: {
        on: (e: string, cb: any) => {
          if (e === 'data') {
            cb(Buffer.from([0xEC]));
            cb(Buffer.from([0x95, 0x88]));
          }
        },
      },
      stderr: { on: vi.fn() },
      on: (e: string, cb: any) => { if (e === 'close') cb(0, null); },
    });
    const result = await callClaude({ systemPrompt: 's', userMessage: 'u' });
    expect(result).toBe('안');
  });

  it('--tools "" present to disable all tools', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: { on: (e: string, cb: (data: Buffer) => void) => { if (e === 'data') cb(Buffer.from('ok')); } },
      stderr: { on: vi.fn() },
      on: (e: string, cb: (code: number) => void) => { if (e === 'close') cb(0); },
    });
    await callClaude({ systemPrompt: 'sys', userMessage: 'hi' });
    const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
    const argv: string[] = spawnArgs[1];
    const toolsIdx = argv.indexOf('--tools');
    expect(toolsIdx).toBeGreaterThanOrEqual(0);
    expect(argv[toolsIdx + 1]).toBe('');
  });

  it('systemPrompt passed via --system-prompt flag, not concatenated', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: { on: (e: string, cb: (data: Buffer) => void) => { if (e === 'data') cb(Buffer.from('ok')); } },
      stderr: { on: vi.fn() },
      on: (e: string, cb: (code: number) => void) => { if (e === 'close') cb(0); },
    });
    await callClaude({ systemPrompt: 'SYS', userMessage: 'USR' });
    const spawnArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0];
    const argv: string[] = spawnArgs[1];
    // --system-prompt SYS must be present
    const sysIdx = argv.indexOf('--system-prompt');
    expect(sysIdx).toBeGreaterThanOrEqual(0);
    expect(argv[sysIdx + 1]).toBe('SYS');
    // -p USR must be present
    const pIdx = argv.indexOf('-p');
    expect(pIdx).toBeGreaterThanOrEqual(0);
    expect(argv[pIdx + 1]).toBe('USR');
    // userMessage must NOT contain systemPrompt or separator
    expect(argv[pIdx + 1]).not.toContain('SYS');
    expect(argv[pIdx + 1]).not.toContain('---');
  });

  it('signal kill → error mentions signal name', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: (e: string, cb: any) => { if (e === 'close') cb(null, 'SIGTERM'); },
    });
    await expect(callClaude({ systemPrompt: 'sys', userMessage: 'hi' })).rejects.toThrow('signal SIGTERM');
  });
});
