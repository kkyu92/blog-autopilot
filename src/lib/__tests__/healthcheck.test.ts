import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mock for ./llm — must be at top level for vi.mock hoisting
vi.mock('../llm', () => ({
  callClaude: vi.fn(),
}));

describe('healthcheck.runAll', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: all env vars present
    vi.stubEnv('PIXABAY_API_KEY', 'px-key');
    vi.stubEnv('PEXELS_API_KEY', 'pe-key');
    vi.stubEnv('WORDPRESS_WS_ACCESS_TOKEN', 'ws-token');
    vi.stubEnv('WORDPRESS_WS_BLOG_ID', 'ws-blog');
    vi.stubEnv('WORDPRESS_TS_ACCESS_TOKEN', 'ts-token');
    vi.stubEnv('WORDPRESS_TS_BLOG_ID', 'ts-blog');
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'as-refresh');
    vi.stubEnv('GOOGLE_BLOG_ID', 'as-blog');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'g-client-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'g-client-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('6종 모두 200 → allPassed=true, 6 results', async () => {
    // Blogger needs 2 fetch calls (token + API), others need 1 each → 5 + 1 = 6 total
    // Pixabay, Pexels, WP-WS, WP-TS: 1 each = 4
    // Blogger: 2 (token refresh + blogs GET)
    // Total fetch calls: 6
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pixabay
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pexels
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-WS
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-TS
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }) // Blogger token
      .mockResolvedValueOnce({ ok: true, status: 200 }) as any; // Blogger blogs GET

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    expect(report.allPassed).toBe(true);
    expect(report.results).toHaveLength(6);
    expect(report.results.every(r => r.ok)).toBe(true);
  });

  it('Pexels 401 → allPassed=false, Pexels result ok=false', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pixabay
      .mockResolvedValueOnce({ ok: false, status: 401 }) // Pexels 401
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-WS
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-TS
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }) // Blogger token
      .mockResolvedValueOnce({ ok: true, status: 200 }) as any; // Blogger blogs GET

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    expect(report.allPassed).toBe(false);
    const pexels = report.results.find(r => r.service === 'Pexels');
    expect(pexels).toBeDefined();
    expect(pexels!.ok).toBe(false);
    expect(pexels!.reason).toContain('401');
  });

  it('claude CLI throws → claude-cli result ok=false', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pixabay
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pexels
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-WS
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-TS
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }) // Blogger token
      .mockResolvedValueOnce({ ok: true, status: 200 }) as any; // Blogger blogs GET

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockRejectedValue(new Error('OAuth expired'));

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    expect(report.allPassed).toBe(false);
    const cli = report.results.find(r => r.service === 'claude-cli');
    expect(cli).toBeDefined();
    expect(cli!.ok).toBe(false);
    expect(cli!.reason).toContain('OAuth expired');
  });

  it('Pixabay env missing → result reason = PIXABAY_API_KEY missing', async () => {
    vi.stubEnv('PIXABAY_API_KEY', '');

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pexels
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-WS
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-TS
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }) // Blogger token
      .mockResolvedValueOnce({ ok: true, status: 200 }) as any; // Blogger blogs GET

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const pixabay = report.results.find(r => r.service === 'Pixabay');
    expect(pixabay).toBeDefined();
    expect(pixabay!.ok).toBe(false);
    expect(pixabay!.reason).toBe('PIXABAY_API_KEY missing');
  });

  it('WordPress WS env missing → WP-WS ok=false, reason = WORDPRESS_WS_ACCESS_TOKEN missing', async () => {
    vi.stubEnv('WORDPRESS_WS_ACCESS_TOKEN', '');

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pixabay
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pexels
      // WP-WS skips fetch (env missing)
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-TS
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }) // Blogger token
      .mockResolvedValueOnce({ ok: true, status: 200 }) as any; // Blogger blogs GET

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const wpWs = report.results.find(r => r.service === 'WP-WS');
    expect(wpWs).toBeDefined();
    expect(wpWs!.ok).toBe(false);
    expect(wpWs!.reason).toBe('WORDPRESS_WS_ACCESS_TOKEN missing');
  });

  it('WordPress WS blogId missing → WP-WS ok=false, reason = WORDPRESS_WS_BLOG_ID missing', async () => {
    vi.stubEnv('WORDPRESS_WS_BLOG_ID', '');

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pixabay
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pexels
      // WP-WS skips fetch (env missing)
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-TS
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }) // Blogger token
      .mockResolvedValueOnce({ ok: true, status: 200 }) as any; // Blogger blogs GET

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const wpWs = report.results.find(r => r.service === 'WP-WS');
    expect(wpWs).toBeDefined();
    expect(wpWs!.ok).toBe(false);
    expect(wpWs!.reason).toBe('WORDPRESS_WS_BLOG_ID missing');
  });

  it('Blogger token refresh HTTP 400 → Blogger-AS ok=false', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pixabay
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pexels
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-WS
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-TS
      .mockResolvedValueOnce({ ok: false, status: 400 }) as any; // Blogger token refresh 400

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const blogger = report.results.find(r => r.service === 'Blogger-AS');
    expect(blogger).toBeDefined();
    expect(blogger!.ok).toBe(false);
    expect(blogger!.reason).toContain('400');
  });

  it('Blogger token OK but blogs API 403 → Blogger-AS ok=false', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pixabay
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pexels
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-WS
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-TS
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }) // Blogger token
      .mockResolvedValueOnce({ ok: false, status: 403 }) as any; // Blogger blogs GET 403

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const blogger = report.results.find(r => r.service === 'Blogger-AS');
    expect(blogger).toBeDefined();
    expect(blogger!.ok).toBe(false);
    expect(blogger!.reason).toContain('403');
  });

  it('fetch timeout (AbortError) → ok=false, reason includes abort/timeout', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    global.fetch = vi.fn().mockRejectedValue(abortError) as any;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    // All 5 fetch-based services should fail
    const fetchServices = ['Pixabay', 'Pexels', 'WP-WS', 'WP-TS', 'Blogger-AS'];
    for (const svc of fetchServices) {
      const r = report.results.find(res => res.service === svc);
      expect(r).toBeDefined();
      expect(r!.ok).toBe(false);
    }
    expect(report.allPassed).toBe(false);
  });

  it('claude CLI returns string without "OK" → ok=false, reason mentions unexpected', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pixabay
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pexels
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-WS
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-TS
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }) // Blogger token
      .mockResolvedValueOnce({ ok: true, status: 200 }) as any; // Blogger blogs GET

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('Sorry, I cannot do that.');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const cli = report.results.find(r => r.service === 'claude-cli');
    expect(cli).toBeDefined();
    expect(cli!.ok).toBe(false);
    expect(cli!.reason).toContain('unexpected');
  });

  it('Promise.all parallel — all 6 services present in results, service names correct', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pixabay
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pexels
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-WS
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-TS
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }) // Blogger token
      .mockResolvedValueOnce({ ok: true, status: 200 }) as any; // Blogger blogs GET

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const serviceNames = report.results.map(r => r.service);
    expect(serviceNames).toContain('Pixabay');
    expect(serviceNames).toContain('Pexels');
    expect(serviceNames).toContain('WP-WS');
    expect(serviceNames).toContain('WP-TS');
    expect(serviceNames).toContain('Blogger-AS');
    expect(serviceNames).toContain('claude-cli');
    expect(report.results).toHaveLength(6);
  });

  it('Blogger env missing → Blogger-AS ok=false, reason = GOOGLE_REFRESH_TOKEN missing', async () => {
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', '');

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pixabay
      .mockResolvedValueOnce({ ok: true, status: 200 }) // Pexels
      .mockResolvedValueOnce({ ok: true, status: 200 }) // WP-WS
      .mockResolvedValueOnce({ ok: true, status: 200 }) as any; // WP-TS

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const blogger = report.results.find(r => r.service === 'Blogger-AS');
    expect(blogger).toBeDefined();
    expect(blogger!.ok).toBe(false);
    expect(blogger!.reason).toBe('GOOGLE_REFRESH_TOKEN missing');
  });

  it('claude CLI timeout → ok=false, reason contains "timeout" + retry exhaustion', async () => {
    vi.useFakeTimers();

    // Unstub all env vars so all other services short-circuit on missing-env synchronously
    vi.unstubAllEnvs();

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockImplementation(() => new Promise(() => {})); // never resolves

    const { runAll } = await import('../healthcheck');
    const promise = runAll();

    // 3 attempts × 10s timeout + 500ms + 1000ms backoffs = 31.5s. 35s 안전 마진.
    await vi.advanceTimersByTimeAsync(35_000);

    const report = await promise;
    const claudeResult = report.results.find(r => r.service === 'claude-cli');
    expect(claudeResult?.ok).toBe(false);
    expect(claudeResult?.reason).toMatch(/timeout/);
    expect(claudeResult?.reason).toContain('after 3 attempts');

    vi.useRealTimers();
  });

  // ─── Retry 정책 ───────────────────────────────────────────────

  it('retry: 5xx → 2번째 시도 success → 최종 ok=true (recovery)', async () => {
    // Promise.all parallel — fetch는 병렬 호출 순서대로 mock 소비.
    // Pixabay 1st → Pexels → WP-WS → WP-TS → Blogger token → Blogger blogs → Pixabay 2nd (backoff 후).
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })  // 1: Pixabay attempt 1 (transient)
      .mockResolvedValueOnce({ ok: true, status: 200 })   // 2: Pexels
      .mockResolvedValueOnce({ ok: true, status: 200 })   // 3: WP-WS
      .mockResolvedValueOnce({ ok: true, status: 200 })   // 4: WP-TS
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }) // 5: Blogger token
      .mockResolvedValueOnce({ ok: true, status: 200 })   // 6: Blogger blogs GET
      .mockResolvedValueOnce({ ok: true, status: 200 }) as any; // 7: Pixabay attempt 2 (recover)

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    expect(report.allPassed).toBe(true);
    const pixabay = report.results.find(r => r.service === 'Pixabay');
    expect(pixabay!.ok).toBe(true);
  }, 10_000);

  it('retry: 5xx 3회 모두 실패 → reason "after 3 attempts" 포함', async () => {
    // 병렬 ordering: 다른 5 services 먼저 (mocks 1-6, Blogger 2번 포함), 그 다음 Pixabay 2nd/3rd.
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })  // 1: Pixabay attempt 1
      .mockResolvedValueOnce({ ok: true, status: 200 })   // 2: Pexels
      .mockResolvedValueOnce({ ok: true, status: 200 })   // 3: WP-WS
      .mockResolvedValueOnce({ ok: true, status: 200 })   // 4: WP-TS
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }) // 5: Blogger token
      .mockResolvedValueOnce({ ok: true, status: 200 })   // 6: Blogger blogs GET
      .mockResolvedValueOnce({ ok: false, status: 503 })  // 7: Pixabay attempt 2 (backoff 후)
      .mockResolvedValueOnce({ ok: false, status: 503 }) as any; // 8: Pixabay attempt 3

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    expect(report.allPassed).toBe(false);
    const pixabay = report.results.find(r => r.service === 'Pixabay');
    expect(pixabay!.ok).toBe(false);
    expect(pixabay!.reason).toContain('503');
    expect(pixabay!.reason).toContain('after 3 attempts');
  }, 10_000);

  it('retry: 4xx (permanent) → 재시도 안 함, fetch 호출 1회만', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })  // Pixabay 401 (permanent — no retry)
      .mockResolvedValueOnce({ ok: true, status: 200 })   // Pexels
      .mockResolvedValueOnce({ ok: true, status: 200 })   // WP-WS
      .mockResolvedValueOnce({ ok: true, status: 200 })   // WP-TS
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }) // Blogger token
      .mockResolvedValueOnce({ ok: true, status: 200 }); // Blogger blogs GET
    global.fetch = fetchMock as any;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    // Pixabay 1 + Pexels 1 + WP-WS 1 + WP-TS 1 + Blogger 2 = 6회
    expect(fetchMock).toHaveBeenCalledTimes(6);
    const pixabay = report.results.find(r => r.service === 'Pixabay');
    expect(pixabay!.ok).toBe(false);
    expect(pixabay!.reason).toContain('401');
    expect(pixabay!.reason).not.toContain('after');  // retry 안 했으니 "after N attempts" 안 붙음
  });

  it('retry: env missing (permanent) → fetch 호출 안 함', async () => {
    vi.stubEnv('PIXABAY_API_KEY', '');

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })   // Pexels
      .mockResolvedValueOnce({ ok: true, status: 200 })   // WP-WS
      .mockResolvedValueOnce({ ok: true, status: 200 })   // WP-TS
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'tok' }) }) // Blogger token
      .mockResolvedValueOnce({ ok: true, status: 200 }); // Blogger blogs GET
    global.fetch = fetchMock as any;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    await runAll();

    // Pixabay 0 (env missing) + Pexels 1 + WP-WS 1 + WP-TS 1 + Blogger 2 = 5회
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});

describe('isTransient (retry classification)', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['PIXABAY_API_KEY missing', false],
    ['HTTP 401', false],
    ['HTTP 403', false],
    ['HTTP 400', false],
    ['token refresh HTTP 400', false],
    ['Error: OAuth expired', false],
    ['unauthorized', false],
    ['HTTP 500', true],
    ['HTTP 503', true],
    ['Error: claude-cli timeout after 10000ms', true],
    ['DOMException: The operation was aborted', true],
    ['TypeError: fetch failed', true],
  ])('"%s" → transient=%s', async (reason, expected) => {
    const { isTransient } = await import('../healthcheck');
    expect(isTransient(reason)).toBe(expected);
  });
});
