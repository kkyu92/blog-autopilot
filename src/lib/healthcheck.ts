import { callClaude } from './llm';

const TIMEOUT_MS = 10_000;

interface HealthResult { service: string; ok: boolean; reason?: string; }
export interface HealthReport { allPassed: boolean; results: HealthResult[]; }

const UA = 'blog-autopilot/1.0';

function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function pingPixabay(): Promise<HealthResult> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return { service: 'Pixabay', ok: false, reason: 'PIXABAY_API_KEY missing' };
  try {
    const res = await fetchWithTimeout(
      `https://pixabay.com/api/?key=${key}&q=test&per_page=3`,
      { headers: { 'User-Agent': UA } },
    );
    return { service: 'Pixabay', ok: res.ok, reason: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { service: 'Pixabay', ok: false, reason: String(e) };
  }
}

async function pingPexels(): Promise<HealthResult> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return { service: 'Pexels', ok: false, reason: 'PEXELS_API_KEY missing' };
  try {
    const res = await fetchWithTimeout(
      'https://api.pexels.com/v1/search?query=test&per_page=1',
      { headers: { Authorization: key, 'User-Agent': UA } },
    );
    return { service: 'Pexels', ok: res.ok, reason: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { service: 'Pexels', ok: false, reason: String(e) };
  }
}

// niche → BLOG_ID env suffix (도메인 일관 명명, tokens.ts와 동일)
const BLOG_ID_ENV_SUFFIX: Record<'AS' | 'TS' | 'WS', string> = {
  AS: 'APT',
  TS: 'TRIP',
  WS: 'HEALTH',
};

async function pingBlogger(niche: 'AS' | 'TS' | 'WS'): Promise<HealthResult> {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const suffix = BLOG_ID_ENV_SUFFIX[niche];
  const blogId =
    process.env[`GOOGLE_BLOG_ID_${suffix}`] ??
    (niche === 'AS' ? process.env.GOOGLE_BLOG_ID : undefined);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!refreshToken) return { service: `Blogger-${niche}`, ok: false, reason: 'GOOGLE_REFRESH_TOKEN missing' };
  if (!blogId) return { service: `Blogger-${niche}`, ok: false, reason: `GOOGLE_BLOG_ID_${suffix} missing` };
  if (!clientId) return { service: `Blogger-${niche}`, ok: false, reason: 'GOOGLE_CLIENT_ID missing' };
  if (!clientSecret) return { service: `Blogger-${niche}`, ok: false, reason: 'GOOGLE_CLIENT_SECRET missing' };
  try {
    // Step 1: refresh access token
    const tokRes = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!tokRes.ok) {
      return { service: `Blogger-${niche}`, ok: false, reason: `token refresh HTTP ${tokRes.status}` };
    }
    const tok = (await tokRes.json()) as { access_token: string };

    // Step 2: cheap GET to validate access
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?maxResults=1`,
      { headers: { Authorization: `Bearer ${tok.access_token}` } },
    );
    return { service: `Blogger-${niche}`, ok: res.ok, reason: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { service: `Blogger-${niche}`, ok: false, reason: String(e) };
  }
}

async function pingClaudeCli(): Promise<HealthResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<HealthResult>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`claude-cli timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  });
  try {
    const result = await Promise.race<HealthResult>([
      callClaude({ systemPrompt: 'You are a healthcheck.', userMessage: 'reply with exactly: OK' })
        .then((res): HealthResult => ({
          service: 'claude-cli',
          ok: res.includes('OK'),
          reason: res.includes('OK') ? undefined : `unexpected: ${res.slice(0, 50)}`,
        })),
      timeoutPromise,
    ]);
    return result;
  } catch (e) {
    return { service: 'claude-cli', ok: false, reason: String(e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Retry 정책 — 5xx / network 일시 장애만 재시도. env missing / 4xx / oauth 는 영구 실패.
// 시간 budget: 6 services 병렬 × 최악 (10s × 3 + backoff 1.5s) = ~32s.
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

export function isTransient(reason?: string): boolean {
  if (!reason) return false;
  if (reason.includes('missing')) return false;        // env 누락 — 즉시 fail
  if (/HTTP 4\d\d/i.test(reason)) return false;        // 401/403/400 등 영구
  if (/oauth|unauthorized/i.test(reason)) return false; // 토큰 만료/거부
  return true;                                          // 5xx / timeout / network 등
}

async function pingWithRetry(
  name: string,
  fn: () => Promise<HealthResult>,
): Promise<HealthResult> {
  let last: HealthResult | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await fn();
    if (last.ok) return last;
    if (!isTransient(last.reason)) return last;
    if (attempt < MAX_ATTEMPTS) {
      const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(
        `[healthcheck] ${name} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${last.reason} — retry in ${backoff}ms`,
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  return {
    ...last!,
    reason: `${last!.reason} (after ${MAX_ATTEMPTS} attempts)`,
  };
}

export async function runAll(): Promise<HealthReport> {
  const results = await Promise.all([
    pingWithRetry('Pixabay', pingPixabay),
    pingWithRetry('Pexels', pingPexels),
    pingWithRetry('Blogger-AS', () => pingBlogger('AS')),
    pingWithRetry('Blogger-TS', () => pingBlogger('TS')),
    pingWithRetry('Blogger-WS', () => pingBlogger('WS')),
    pingWithRetry('claude-cli', pingClaudeCli),
  ]);
  return { allPassed: results.every(r => r.ok), results };
}
