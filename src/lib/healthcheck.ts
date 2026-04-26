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

async function pingWordPress(niche: 'WS' | 'TS'): Promise<HealthResult> {
  const token = process.env[`WORDPRESS_${niche}_ACCESS_TOKEN`];
  const blogId = process.env[`WORDPRESS_${niche}_BLOG_ID`];
  if (!token) return { service: `WP-${niche}`, ok: false, reason: `WORDPRESS_${niche}_ACCESS_TOKEN missing` };
  if (!blogId) return { service: `WP-${niche}`, ok: false, reason: `WORDPRESS_${niche}_BLOG_ID missing` };
  try {
    const res = await fetchWithTimeout(
      `https://public-api.wordpress.com/rest/v1.1/sites/${blogId}/posts?number=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return { service: `WP-${niche}`, ok: res.ok, reason: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { service: `WP-${niche}`, ok: false, reason: String(e) };
  }
}

async function pingBlogger(niche: 'AS' = 'AS'): Promise<HealthResult> {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const blogId = process.env.GOOGLE_BLOG_ID;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!refreshToken) return { service: `Blogger-${niche}`, ok: false, reason: 'GOOGLE_REFRESH_TOKEN missing' };
  if (!blogId) return { service: `Blogger-${niche}`, ok: false, reason: 'GOOGLE_BLOG_ID missing' };
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

export async function runAll(): Promise<HealthReport> {
  const results = await Promise.all([
    pingPixabay(),
    pingPexels(),
    pingWordPress('WS'),
    pingWordPress('TS'),
    pingBlogger(),
    pingClaudeCli(),
  ]);
  return { allPassed: results.every(r => r.ok), results };
}
