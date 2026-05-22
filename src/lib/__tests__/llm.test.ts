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

  it('child error event → reject after retry (F1\'-c)', async () => {
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
    // F1'-c: ENOENT는 transient → 5초 후 1회 retry → 두 번째도 fail → 최종 reject
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  }, 15_000);

  it('UTF-8 multi-byte chars across chunk boundaries', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    // 안 = EC 95 88 — split as [EC] then [95 88]
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: {
        on: (e: string, cb: (...args: unknown[]) => void) => {
          if (e === 'data') {
            cb(Buffer.from([0xEC]));
            cb(Buffer.from([0x95, 0x88]));
          }
        },
      },
      stderr: { on: vi.fn() },
      on: (e: string, cb: (...args: unknown[]) => void) => { if (e === 'close') cb(0, null); },
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
      on: (e: string, cb: (...args: unknown[]) => void) => { if (e === 'close') cb(null, 'SIGTERM'); },
    });
    await expect(callClaude({ systemPrompt: 'sys', userMessage: 'hi' })).rejects.toThrow('signal SIGTERM');
  });

  it('expectJson + first attempt fails, second attempt succeeds → return valid JSON', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    let callIdx = 0;
    (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callIdx++;
      const stdout = callIdx === 1 ? 'not json' : '{"ok":true}';
      return {
        stdout: { on: (e: string, cb: (data: Buffer) => void) => { if (e === 'data') cb(Buffer.from(stdout)); } },
        stderr: { on: vi.fn() },
        on: (e: string, cb: (code: number) => void) => { if (e === 'close') cb(0); },
      };
    });
    const result = await callClaude({ systemPrompt: 'sys', userMessage: 'hi', expectJson: true });
    expect(result).toBe('{"ok":true}');
    expect(callIdx).toBe(2);
  });

  it("F2-A 강화: attempt 2+ systemPrompt에 JSON_RETRY_GUARD 주입 (5/1 WS HPV evidence)", async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    let callIdx = 0;
    (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callIdx++;
      const stdout = callIdx === 1 ? 'not json' : '{"ok":true}';
      return {
        stdout: { on: (e: string, cb: (data: Buffer) => void) => { if (e === 'data') cb(Buffer.from(stdout)); } },
        stderr: { on: vi.fn() },
        on: (e: string, cb: (code: number) => void) => { if (e === 'close') cb(0); },
      };
    });
    await callClaude({ systemPrompt: 'BASE_SYS', userMessage: 'hi', expectJson: true });

    const firstSystemPrompt = (spawn as ReturnType<typeof vi.fn>).mock.calls[0][1][
      (spawn as ReturnType<typeof vi.fn>).mock.calls[0][1].indexOf('--system-prompt') + 1
    ];
    const secondSystemPrompt = (spawn as ReturnType<typeof vi.fn>).mock.calls[1][1][
      (spawn as ReturnType<typeof vi.fn>).mock.calls[1][1].indexOf('--system-prompt') + 1
    ];

    // attempt 1: BASE_SYS + JSON_GUARD only (no retry guard)
    expect(firstSystemPrompt).toContain('BASE_SYS');
    expect(firstSystemPrompt).not.toContain('RETRY (previous response rejected)');

    // attempt 2: BASE_SYS + JSON_GUARD + JSON_RETRY_GUARD (escape/length 가이드)
    expect(secondSystemPrompt).toContain('BASE_SYS');
    expect(secondSystemPrompt).toContain('RETRY (previous response rejected)');
    expect(secondSystemPrompt).toMatch(/escape/i);
  });

  it('expectJson + jsonRetries=0 → no retry, throw on first failure', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    let callIdx = 0;
    (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callIdx++;
      return {
        stdout: { on: (e: string, cb: (data: Buffer) => void) => { if (e === 'data') cb(Buffer.from('not json')); } },
        stderr: { on: vi.fn() },
        on: (e: string, cb: (code: number) => void) => { if (e === 'close') cb(0); },
      };
    });
    await expect(callClaude({ systemPrompt: 'sys', userMessage: 'hi', expectJson: true, jsonRetries: 0 })).rejects.toThrow('invalid JSON');
    expect(callIdx).toBe(1);
  });

  it('expectJson + both attempts fail → throw with attempt count', async () => {
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    let callIdx = 0;
    (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callIdx++;
      return {
        stdout: { on: (e: string, cb: (data: Buffer) => void) => { if (e === 'data') cb(Buffer.from('not json')); } },
        stderr: { on: vi.fn() },
        on: (e: string, cb: (code: number) => void) => { if (e === 'close') cb(0); },
      };
    });
    await expect(callClaude({ systemPrompt: 'sys', userMessage: 'hi', expectJson: true })).rejects.toThrow('attempt 2/2');
    expect(callIdx).toBe(2);
  });

  // 4/28 cron 25010381167 regression: claude CLI 응답 없이 무한 hang → spawn timeout 추가
  it('child가 close 이벤트 안 보내면 timeoutMs 후 SIGTERM kill + reject', async () => {
    vi.useFakeTimers();
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    const killSpy = vi.fn();
    // close 이벤트를 절대 emit 안 하는 stuck child
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(), // close/error 콜백 등록만 받고 emit 안 함
      kill: killSpy,
    });

    const promise = callClaude({ systemPrompt: 'sys', userMessage: 'hi', timeoutMs: 1000 });
    // unhandled rejection 방지: 즉시 catch 핸들러 attach
    const rejected = expect(promise).rejects.toThrow('timeout after 1000ms');
    await vi.advanceTimersByTimeAsync(1100);
    await rejected;
    expect(killSpy).toHaveBeenCalledWith('SIGTERM');
    vi.useRealTimers();
  });

  it('timeout 후 5초 내 child 안 죽으면 SIGKILL escalate', async () => {
    vi.useFakeTimers();
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    const killSpy = vi.fn();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: killSpy,
    });

    const promise = callClaude({ systemPrompt: 'sys', userMessage: 'hi', timeoutMs: 100 });
    const rejected = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(150); // SIGTERM
    await rejected;
    expect(killSpy).toHaveBeenNthCalledWith(1, 'SIGTERM');
    await vi.advanceTimersByTimeAsync(5100); // SIGKILL grace 경과
    expect(killSpy).toHaveBeenNthCalledWith(2, 'SIGKILL');
    vi.useRealTimers();
  });

  it('정상 close 응답 시 timeout 안 발동, kill 호출 X', async () => {
    vi.useFakeTimers();
    const { spawn } = await import('node:child_process');
    const { callClaude } = await import('../llm');
    const killSpy = vi.fn();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValue({
      stdout: { on: (e: string, cb: (data: Buffer) => void) => { if (e === 'data') cb(Buffer.from('ok')); } },
      stderr: { on: vi.fn() },
      on: (e: string, cb: (code: number) => void) => { if (e === 'close') cb(0); },
      kill: killSpy,
    });
    const result = await callClaude({ systemPrompt: 'sys', userMessage: 'hi', timeoutMs: 5000 });
    expect(result).toBe('ok');
    // timeout 안 지났는데 진행 — kill 호출 X
    expect(killSpy).not.toHaveBeenCalled();
    // timer는 cleared 됐어야 — advance 해도 추가 reject 없음
    await vi.advanceTimersByTimeAsync(10000);
    expect(killSpy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('extractJson', () => {
  it('strips code fence', async () => {
    const { extractJson } = await import('../llm');
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('throws when no JSON delimiter (LLM drift — content_html-only output)', async () => {
    const { extractJson } = await import('../llm');
    // 황사 케이스 시뮬레이션: { 또는 [ 가 전혀 없는 본문 단편
    expect(() => extractJson('니다.\\" — 대한예방의학회 권고</blockquote>...')).toThrow('no JSON delimiter');
  });

  it('handles content_html with } inside escaped string (bracket-balanced walk)', async () => {
    const { extractJson } = await import('../llm');
    const input = '{"content_html":"<div style=\\"color:red\\">a}b</div>","ok":true}';
    expect(extractJson(input)).toBe(input);
  });

  it('strips leading text before {', async () => {
    const { extractJson } = await import('../llm');
    expect(extractJson('Sure, here is the JSON: {"a":1}')).toBe('{"a":1}');
  });
});
