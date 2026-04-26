import { getValidTokens, getWordPressCredentials, type OAuthTokens } from "@/lib/tokens";

const WP_CLIENT_ID = process.env.WORDPRESS_CLIENT_ID!;
const WP_CLIENT_SECRET = process.env.WORDPRESS_CLIENT_SECRET!;
const WP_REDIRECT_URI =
  process.env.WORDPRESS_REDIRECT_URI ||
  "http://localhost:3000/api/auth/wordpress/callback";
const WP_SITE = process.env.WORDPRESS_SITE || "";

// OAuth URL 생성
export function getWordPressAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: WP_CLIENT_ID,
    redirect_uri: WP_REDIRECT_URI,
    response_type: "code",
    scope: "global",
    state,
  });
  return `https://public-api.wordpress.com/oauth2/authorize?${params}`;
}

// Authorization code → tokens
export async function exchangeWordPressCode(
  code: string
): Promise<OAuthTokens> {
  const res = await fetch("https://public-api.wordpress.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: WP_CLIENT_ID,
      client_secret: WP_CLIENT_SECRET,
      redirect_uri: WP_REDIRECT_URI,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WordPress token exchange failed: ${err}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.access_token, // WP.com doesn't use refresh tokens, token doesn't expire
    expires_at: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    token_type: data.token_type,
  };
}

// 유효한 토큰 가져오기
export async function getValidWordPressTokens(): Promise<OAuthTokens | null> {
  // WordPress.com 토큰은 만료되지 않으므로 갱신 불필요
  return getValidTokens("wordpress", async (tokens) => tokens);
}

// 사이트 정보 조회
export async function getWordPressSite(
  accessToken: string
): Promise<{ id: number; name: string; url: string }> {
  const site = WP_SITE;
  if (!site) throw new Error("WORDPRESS_SITE not configured");

  const res = await fetch(
    `https://public-api.wordpress.com/rest/v1.1/sites/${site}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WordPress site fetch failed: ${err}`);
  }

  const data = await res.json();
  return { id: data.ID, name: data.name, url: data.URL };
}

// WordPress 전체 게시물 목록 조회
export async function listWordPressPosts(
  accessToken: string,
  site?: string
): Promise<{ id: number; title: string; url: string; content: string; date: string }[]> {
  const targetSite = site || WP_SITE;
  if (!targetSite) throw new Error("WORDPRESS_SITE not configured");

  const posts: { id: number; title: string; url: string; content: string; date: string }[] = [];
  let offset = 0;

  do {
    const res = await fetch(
      `https://public-api.wordpress.com/rest/v1.1/sites/${targetSite}/posts?number=100&offset=${offset}&status=publish`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) break;
    const data = await res.json();
    for (const post of data.posts || []) {
      posts.push({
        id: post.ID,
        title: post.title,
        url: post.URL,
        content: post.content || "",
        date: post.date,
      });
    }
    if ((data.posts || []).length < 100) break;
    offset += 100;
  } while (true);

  return posts;
}

// WordPress 글 발행
export async function publishToWordPress(params: {
  accessToken: string;
  site?: string;
  title: string;
  html: string;
  tags?: string[];
  status?: "publish" | "draft";
}): Promise<{ id: number; url: string }> {
  const {
    accessToken,
    site = WP_SITE,
    title,
    html,
    tags = [],
    status = "publish",
  } = params;

  if (!site) throw new Error("WORDPRESS_SITE not configured");

  const res = await fetch(
    `https://public-api.wordpress.com/rest/v1.2/sites/${site}/posts/new`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        content: html,
        tags: tags.join(","),
        status,
        format: "standard",
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WordPress publish failed (${res.status}): ${err}`);
  }

  const post = await res.json();
  return { id: post.ID, url: post.URL };
}

// WordPress 게시물 삭제
export async function deleteFromWordPress(params: {
  accessToken: string;
  site?: string;
  postId: string;
}): Promise<void> {
  const { accessToken, site = WP_SITE, postId } = params;

  if (!site) throw new Error("WORDPRESS_SITE not configured");

  const res = await fetch(
    `https://public-api.wordpress.com/rest/v1.1/sites/${site}/posts/${postId}/delete`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`WordPress delete failed (${res.status}): ${err}`);
  }
}

// ─── Multi-site scheduled publishing (PR5 D2) ────────────────────────────────

export interface WPScheduledPost {
  title: string;
  content: string; // HTML
  slug: string;
  excerpt?: string;
  categories?: string[];
  tags?: string[];
}

/** WP.com REST API response shape for POST /sites/:id/posts/new */
interface WPCreatePostResponse {
  ID: number;
  URL: string;
  date: string;
  // other fields ignored
}

/** Non-retryable (4xx) error — caller bug; retrying won't help */
class WPNonRetryableError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'WPNonRetryableError';
  }
}

const PUBLISH_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = PUBLISH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

/**
 * Publish a scheduled post to a niche-routed WordPress.com site.
 * Uses niche credentials from env vars via getWordPressCredentials (D1).
 * Retries up to 3× with exponential backoff (1s / 2s) for 5xx and network errors.
 * 4xx errors (auth/bad-request) fail fast without retrying.
 */
export async function publishScheduled(
  niche: 'WS' | 'TS',
  post: WPScheduledPost,
  scheduledFor: Date
): Promise<{ externalId: string; externalUrl: string; scheduledAt: string }> {
  const { accessToken, blogId } = getWordPressCredentials(niche);

  const body: Record<string, unknown> = {
    title: post.title,
    content: post.content,
    slug: post.slug,
    status: 'future',
    date: scheduledFor.toISOString(),
  };

  // Only include optional fields if they are defined (JSON.stringify omits undefined,
  // but being explicit keeps the intent clear and avoids null being serialized)
  if (post.excerpt !== undefined) body.excerpt = post.excerpt;
  if (post.categories !== undefined) body.categories = post.categories;
  if (post.tags !== undefined) body.tags = post.tags;

  const url = `https://public-api.wordpress.com/rest/v1.1/sites/${blogId}/posts/new`;
  const init: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };

  let lastErr: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init);

      if (!res.ok) {
        const errText = await res.text();
        // 4xx = caller bug (bad auth, bad payload) — don't retry
        if (res.status >= 400 && res.status < 500) {
          throw new WPNonRetryableError(
            `WP-${niche} HTTP ${res.status}: ${errText}`,
            res.status
          );
        }
        // 5xx = server-side transient — retryable
        throw new Error(`WP-${niche} HTTP ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as WPCreatePostResponse;
      return {
        externalId: String(data.ID),
        externalUrl: data.URL,
        scheduledAt: data.date,
      };
    } catch (e) {
      // 4xx: fail fast, no backoff
      if (e instanceof WPNonRetryableError) throw e;

      lastErr = e;
      // Apply exponential backoff before the next attempt (1s, 2s)
      if (attempt < 2) {
        await new Promise<void>((r) =>
          setTimeout(r, 1000 * Math.pow(2, attempt))
        );
      }
    }
  }

  throw lastErr;
}
