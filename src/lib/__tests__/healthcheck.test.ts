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
    vi.stubEnv('WORDPRESS_WS_TOKEN', 'ws-token');
    vi.stubEnv('WORDPRESS_WS_BLOG_ID', 'ws-blog');
    vi.stubEnv('WORDPRESS_TS_TOKEN', 'ts-token');
    vi.stubEnv('WORDPRESS_TS_BLOG_ID', 'ts-blog');
    vi.stubEnv('BLOGGER_AS_REFRESH_TOKEN', 'as-refresh');
    vi.stubEnv('BLOGGER_AS_BLOG_ID', 'as-blog');
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

  it('WordPress WS env missing → WP-WS ok=false, reason = env missing', async () => {
    vi.stubEnv('WORDPRESS_WS_TOKEN', '');

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
    expect(wpWs!.reason).toBe('env missing');
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

  it('Blogger env missing → Blogger-AS ok=false, reason = env missing', async () => {
    vi.stubEnv('BLOGGER_AS_REFRESH_TOKEN', '');

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
    expect(blogger!.reason).toBe('env missing');
  });
});
