import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mock for ./llm — must be at top level for vi.mock hoisting
vi.mock('../llm', () => ({
  callClaude: vi.fn(),
}));

// 5/5 WP→Blogger 마이그레이션 후 healthcheck = Pixabay + Pexels + Blogger × 3 niche + claude-cli = 6 services.
// fetch 호출 8회 (Pixabay 1 + Pexels 1 + Blogger-AS token+blogs 2 + Blogger-TS token+blogs 2 + Blogger-HS token+blogs 2).

interface FetchOpts {
  pixabay?: { ok: boolean; status: number };
  pexels?: { ok: boolean; status: number };
  bloggerToken?: { ok: boolean; status: number; json?: () => Promise<unknown> };
  bloggerBlogsAs?: { ok: boolean; status: number };
  bloggerBlogsTs?: { ok: boolean; status: number };
  bloggerBlogsWs?: { ok: boolean; status: number };
  rejectAll?: Error;
}

function makeFetchMock(opts: FetchOpts = {}) {
  if (opts.rejectAll) {
    return vi.fn().mockRejectedValue(opts.rejectAll);
  }
  return vi.fn().mockImplementation(async (url: string) => {
    const u = String(url);
    if (u.includes('pixabay')) return opts.pixabay ?? { ok: true, status: 200 };
    if (u.includes('pexels')) return opts.pexels ?? { ok: true, status: 200 };
    if (u.includes('oauth2.googleapis.com/token')) {
      return (
        opts.bloggerToken ?? {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'tok' }),
        }
      );
    }
    if (u.includes('blogger/v3/blogs/as-blog')) return opts.bloggerBlogsAs ?? { ok: true, status: 200 };
    if (u.includes('blogger/v3/blogs/ts-blog')) return opts.bloggerBlogsTs ?? { ok: true, status: 200 };
    if (u.includes('blogger/v3/blogs/ws-blog')) return opts.bloggerBlogsWs ?? { ok: true, status: 200 };
    return { ok: false, status: 404 };
  });
}

describe('healthcheck.runAll', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: all env vars present (Blogger 3 niche)
    vi.stubEnv('PIXABAY_API_KEY', 'px-key');
    vi.stubEnv('PEXELS_API_KEY', 'pe-key');
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'g-refresh');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'g-client-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'g-client-secret');
    vi.stubEnv('GOOGLE_BLOG_ID_APT', 'as-blog');
    vi.stubEnv('GOOGLE_BLOG_ID_TRIP', 'ts-blog');
    vi.stubEnv('GOOGLE_BLOG_ID_HEALTH', 'ws-blog');
    // backward-compat fallback (AS only)
    vi.stubEnv('GOOGLE_BLOG_ID', 'as-blog');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('6종 모두 200 → allPassed=true, 6 results', async () => {
    global.fetch = makeFetchMock() as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    expect(report.allPassed).toBe(true);
    expect(report.results).toHaveLength(6);
    expect(report.results.every((r) => r.ok)).toBe(true);
  });

  it('Pexels 401 → allPassed=false, Pexels result ok=false', async () => {
    global.fetch = makeFetchMock({ pexels: { ok: false, status: 401 } }) as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    expect(report.allPassed).toBe(false);
    const pexels = report.results.find((r) => r.service === 'Pexels');
    expect(pexels).toBeDefined();
    expect(pexels!.ok).toBe(false);
    expect(pexels!.reason).toContain('401');
  });

  it('claude CLI throws → claude-cli result ok=false', async () => {
    global.fetch = makeFetchMock() as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockRejectedValue(new Error('OAuth expired'));

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    expect(report.allPassed).toBe(false);
    const cli = report.results.find((r) => r.service === 'claude-cli');
    expect(cli).toBeDefined();
    expect(cli!.ok).toBe(false);
    expect(cli!.reason).toContain('OAuth expired');
  });

  it('Pixabay env missing → result reason = PIXABAY_API_KEY missing', async () => {
    vi.stubEnv('PIXABAY_API_KEY', '');

    global.fetch = makeFetchMock() as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const pixabay = report.results.find((r) => r.service === 'Pixabay');
    expect(pixabay).toBeDefined();
    expect(pixabay!.ok).toBe(false);
    expect(pixabay!.reason).toBe('PIXABAY_API_KEY missing');
  });

  it('Blogger TS BLOG_ID missing → Blogger-TS ok=false, reason = GOOGLE_BLOG_ID_TRIP missing', async () => {
    vi.stubEnv('GOOGLE_BLOG_ID_TRIP', '');

    global.fetch = makeFetchMock() as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const ts = report.results.find((r) => r.service === 'Blogger-TS');
    expect(ts).toBeDefined();
    expect(ts!.ok).toBe(false);
    expect(ts!.reason).toBe('GOOGLE_BLOG_ID_TRIP missing');
  });

  it('Blogger HS BLOG_ID missing → Blogger-HS ok=false, reason = GOOGLE_BLOG_ID_HEALTH missing', async () => {
    vi.stubEnv('GOOGLE_BLOG_ID_HEALTH', '');

    global.fetch = makeFetchMock() as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const hs = report.results.find((r) => r.service === 'Blogger-HS');
    expect(hs).toBeDefined();
    expect(hs!.ok).toBe(false);
    expect(hs!.reason).toBe('GOOGLE_BLOG_ID_HEALTH missing');
  });

  it('Blogger token refresh HTTP 400 → 모든 niche fail', async () => {
    global.fetch = makeFetchMock({
      bloggerToken: { ok: false, status: 400 },
    }) as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    for (const niche of ['AS', 'TS', 'HS']) {
      const r = report.results.find((res) => res.service === `Blogger-${niche}`);
      expect(r).toBeDefined();
      expect(r!.ok).toBe(false);
      expect(r!.reason).toContain('400');
    }
  });

  it('Blogger token OK but AS blogs API 403 → Blogger-AS ok=false, TS/HS 정상', async () => {
    global.fetch = makeFetchMock({
      bloggerBlogsAs: { ok: false, status: 403 },
    }) as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const as = report.results.find((r) => r.service === 'Blogger-AS');
    expect(as!.ok).toBe(false);
    expect(as!.reason).toContain('403');
    expect(report.results.find((r) => r.service === 'Blogger-TS')!.ok).toBe(true);
    expect(report.results.find((r) => r.service === 'Blogger-HS')!.ok).toBe(true);
  });

  it('fetch timeout (AbortError) → ok=false, reason includes abort/timeout', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    global.fetch = makeFetchMock({ rejectAll: abortError }) as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    // All 5 fetch-based services should fail
    const fetchServices = ['Pixabay', 'Pexels', 'Blogger-AS', 'Blogger-TS', 'Blogger-HS'];
    for (const svc of fetchServices) {
      const r = report.results.find((res) => res.service === svc);
      expect(r).toBeDefined();
      expect(r!.ok).toBe(false);
    }
    expect(report.allPassed).toBe(false);
  });

  it('claude CLI returns string without "OK" → ok=false, reason mentions unexpected', async () => {
    global.fetch = makeFetchMock() as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('Sorry, I cannot do that.');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const cli = report.results.find((r) => r.service === 'claude-cli');
    expect(cli).toBeDefined();
    expect(cli!.ok).toBe(false);
    expect(cli!.reason).toContain('unexpected');
  });

  it('Promise.all parallel — all 6 services present in results, service names correct', async () => {
    global.fetch = makeFetchMock() as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    const serviceNames = report.results.map((r) => r.service);
    expect(serviceNames).toContain('Pixabay');
    expect(serviceNames).toContain('Pexels');
    expect(serviceNames).toContain('Blogger-AS');
    expect(serviceNames).toContain('Blogger-TS');
    expect(serviceNames).toContain('Blogger-HS');
    expect(serviceNames).toContain('claude-cli');
    expect(report.results).toHaveLength(6);
  });

  it('Blogger env missing → 모든 niche ok=false, reason = GOOGLE_REFRESH_TOKEN missing', async () => {
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', '');

    global.fetch = makeFetchMock() as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    for (const niche of ['AS', 'TS', 'HS']) {
      const r = report.results.find((res) => res.service === `Blogger-${niche}`);
      expect(r!.ok).toBe(false);
      expect(r!.reason).toBe('GOOGLE_REFRESH_TOKEN missing');
    }
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
    const claudeResult = report.results.find((r) => r.service === 'claude-cli');
    expect(claudeResult?.ok).toBe(false);
    expect(claudeResult?.reason).toMatch(/timeout/);
    expect(claudeResult?.reason).toContain('after 3 attempts');

    vi.useRealTimers();
  });

  // ─── Retry 정책 ───────────────────────────────────────────────

  it('retry: 5xx → 2번째 시도 success → 최종 ok=true (recovery)', async () => {
    let pixabayCount = 0;
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('pixabay')) {
        pixabayCount += 1;
        if (pixabayCount === 1) return { ok: false, status: 500 };
        return { ok: true, status: 200 };
      }
      if (u.includes('pexels')) return { ok: true, status: 200 };
      if (u.includes('oauth2.googleapis.com/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
      }
      if (u.includes('blogger/v3/blogs/')) return { ok: true, status: 200 };
      return { ok: false, status: 404 };
    }) as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    expect(report.allPassed).toBe(true);
    const pixabay = report.results.find((r) => r.service === 'Pixabay');
    expect(pixabay!.ok).toBe(true);
  }, 10_000);

  it('retry: 5xx 3회 모두 실패 → reason "after 3 attempts" 포함', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('pixabay')) return { ok: false, status: 503 };
      if (u.includes('pexels')) return { ok: true, status: 200 };
      if (u.includes('oauth2.googleapis.com/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
      }
      if (u.includes('blogger/v3/blogs/')) return { ok: true, status: 200 };
      return { ok: false, status: 404 };
    }) as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    expect(report.allPassed).toBe(false);
    const pixabay = report.results.find((r) => r.service === 'Pixabay');
    expect(pixabay!.ok).toBe(false);
    expect(pixabay!.reason).toContain('503');
    expect(pixabay!.reason).toContain('after 3 attempts');
  }, 10_000);

  it('retry: 4xx (permanent) → 재시도 안 함, fetch 호출 1회만 (Pixabay)', async () => {
    let pixabayCount = 0;
    let totalCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      totalCount += 1;
      const u = String(url);
      if (u.includes('pixabay')) {
        pixabayCount += 1;
        return { ok: false, status: 401 };
      }
      if (u.includes('pexels')) return { ok: true, status: 200 };
      if (u.includes('oauth2.googleapis.com/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
      }
      if (u.includes('blogger/v3/blogs/')) return { ok: true, status: 200 };
      return { ok: false, status: 404 };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    const report = await runAll();

    // Pixabay 4xx → 재시도 없음 (1 call). 다른 서비스도 모두 1회씩만 (정상).
    // Blogger 3 niche × 2 fetch (token+blogs) = 6, Pixabay 1, Pexels 1 = 총 8.
    expect(pixabayCount).toBe(1);
    expect(totalCount).toBe(8);
    const pixabay = report.results.find((r) => r.service === 'Pixabay');
    expect(pixabay!.ok).toBe(false);
    expect(pixabay!.reason).toContain('401');
    expect(pixabay!.reason).not.toContain('after');
  });

  it('retry: env missing (permanent) → fetch 호출 안 함', async () => {
    vi.stubEnv('PIXABAY_API_KEY', '');

    let pixabayCount = 0;
    let totalCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      totalCount += 1;
      const u = String(url);
      if (u.includes('pixabay')) {
        pixabayCount += 1;
        return { ok: true, status: 200 };
      }
      if (u.includes('pexels')) return { ok: true, status: 200 };
      if (u.includes('oauth2.googleapis.com/token')) {
        return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
      }
      if (u.includes('blogger/v3/blogs/')) return { ok: true, status: 200 };
      return { ok: false, status: 404 };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue('OK');

    const { runAll } = await import('../healthcheck');
    await runAll();

    // Pixabay env missing → fetch 0. Pexels 1 + Blogger 6 = 7.
    expect(pixabayCount).toBe(0);
    expect(totalCount).toBe(7);
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
