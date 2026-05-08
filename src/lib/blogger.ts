import { getValidTokens, type OAuthTokens } from "@/lib/tokens";
import { normalizeLabels } from "./labels";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  "http://localhost:3000/api/auth/blogger/callback";

// OAuth URL 생성
export function getBloggerAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/blogger https://www.googleapis.com/auth/webmasters.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// Authorization code → tokens
export async function exchangeBloggerCode(
  code: string
): Promise<OAuthTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
    scope: data.scope,
  };
}

// 토큰 갱신
async function refreshBloggerTokens(
  tokens: OAuthTokens
): Promise<OAuthTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error("Token refresh failed");
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: tokens.refresh_token, // refresh_token은 재사용
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
    scope: data.scope,
  };
}

// 유효한 토큰 가져오기 (자동 갱신)
export async function getValidBloggerTokens(): Promise<OAuthTokens | null> {
  return getValidTokens("blogger", refreshBloggerTokens);
}

// 블로그 목록 조회
export async function listBlogs(
  accessToken: string
): Promise<{ id: string; name: string; url: string }[]> {
  const res = await fetch(
    "https://www.googleapis.com/blogger/v3/users/self/blogs",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) throw new Error("Failed to list blogs");
  const data = await res.json();
  return (data.items || []).map(
    (b: { id: string; name: string; url: string }) => ({
      id: b.id,
      name: b.name,
      url: b.url,
    })
  );
}

// Blogger 전체 게시물 목록 조회
export async function listBloggerPosts(
  accessToken: string,
  blogId: string
): Promise<{ id: string; title: string; url: string; content: string; published: string }[]> {
  const posts: { id: string; title: string; url: string; content: string; published: string }[] = [];
  let pageToken = "";

  do {
    const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?maxResults=50&status=live${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) break;
    const data = await res.json();
    for (const post of data.items || []) {
      posts.push({
        id: post.id,
        title: post.title,
        url: post.url,
        content: post.content || "",
        published: post.published,
      });
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return posts;
}

// Blogger 게시물 발행
export async function publishToBlogger(params: {
  accessToken: string;
  blogId: string;
  title: string;
  html: string;
  labels?: string[];
}): Promise<{ id: string; url: string }> {
  const { accessToken, blogId, title, html, labels } = params;

  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        kind: "blogger#post",
        title,
        content: html,
        labels: labels || [],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Blogger publish failed: ${err}`);
  }

  const post = await res.json();
  return { id: post.id, url: post.url };
}

// Blogger 게시물 삭제
export async function deleteFromBlogger(params: {
  accessToken: string;
  blogId: string;
  postId: string;
}): Promise<void> {
  const { accessToken, blogId, postId } = params;

  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${postId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(`Blogger delete failed: ${err}`);
  }
}

// ─── Scheduled publishing (PR5 D3) ───────────────────────────────────────────
// Uses server-side refresh-token flow (env vars) via getBloggerCredentials from D1.
// Coexists with the interactive OAuth path above — they serve different code paths.

import { getBloggerCredentials } from './tokens';

interface BloggerTokenResponse {
  access_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
}

interface BloggerDraftResponse {
  id: string;
  // other fields ignored
}

interface BloggerPublishResponse {
  id: string;
  url: string;
  published: string;
  // other fields ignored
}

/** Non-retryable (4xx) error — caller bug; retrying won't help */
class BloggerNonRetryableError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'BloggerNonRetryableError';
  }
}

const BLOGGER_TIMEOUT_MS = 30_000;

async function bloggerFetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = BLOGGER_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

/**
 * Retry helper for Blogger publishing fetches.
 * Retries up to `retries` times with exponential backoff (1s, 2s).
 * 4xx BloggerNonRetryableError fails fast without retrying.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof BloggerNonRetryableError) throw e;
      lastErr = e;
      if (i < retries - 1) await new Promise<void>((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

/**
 * Server-side token refresh using env-based credentials (no DB).
 * One-shot — no retry. Fails loudly so caller gets a clear error.
 */
async function getAccessToken(niche: 'AS' | 'TS' | 'HS' = 'AS'): Promise<string> {
  const { refreshToken, clientId, clientSecret } = getBloggerCredentials(niche);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Blogger token refresh fail: ${res.status}`);
  const data = (await res.json()) as BloggerTokenResponse;
  return data.access_token;
}

/**
 * Publish a scheduled post to Blogger. Multi-niche after 5/5 WP→Blogger 마이그레이션.
 * Two-step: create draft (isDraft=true) → publish with publishDate.
 *
 * NOTE on orphan drafts: each step is retried independently. If step 1 (draft)
 * succeeds but step 2 (publish) exhausts all retries, the draft remains in
 * Blogger admin as an orphan. This is acceptable since draft visibility is
 * not user-facing.
 *
 * @param niche - 'AS' (apt-signal), 'TS' (trip-signal), 'HS' (health-signal).
 */
export async function publishScheduled(
  niche: 'AS' | 'TS' | 'HS',
  post: { title: string; content: string; labels?: string[] },
  scheduledFor: Date
): Promise<{ externalId: string; externalUrl: string; scheduledAt: string }> {
  const { blogId } = getBloggerCredentials(niche);
  const accessToken = await getAccessToken(niche);

  // niche=AS: 통합 6 카테고리로 라벨 normalize (AdSense 사이트 주제 통일성).
  //          unknown drop, 빈 배열 → default '시장분석'. HS/TS pass-through.
  // 5/6 prep relabel-as.mjs 일회성 cleanup 의 정책을 발행 시점에 영구 강제.
  const normalizedLabels = normalizeLabels(niche, post.labels);

  // Step 1: create draft (isDraft=true) — retried independently
  const draft = await withRetry(async () => {
    const draftBody: Record<string, unknown> = {
      title: post.title,
      content: post.content,
    };
    if (normalizedLabels.length > 0) draftBody.labels = normalizedLabels;

    const res = await bloggerFetchWithTimeout(
      `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?isDraft=true`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draftBody),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      if (res.status >= 400 && res.status < 500) {
        throw new BloggerNonRetryableError(`Blogger draft fail: ${res.status}: ${errText}`, res.status);
      }
      throw new Error(`Blogger draft fail: ${res.status}: ${errText}`);
    }

    return (await res.json()) as BloggerDraftResponse;
  });

  // Step 2: publish with publishDate — retried independently
  // If this step fails after retries, the draft from step 1 remains as an orphan.
  const published = await withRetry(async () => {
    const pubUrl = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${draft.id}/publish?publishDate=${encodeURIComponent(scheduledFor.toISOString())}`;
    const res = await bloggerFetchWithTimeout(pubUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status >= 400 && res.status < 500) {
        throw new BloggerNonRetryableError(`Blogger publish fail: ${res.status}: ${errText}`, res.status);
      }
      throw new Error(`Blogger publish fail: ${res.status}: ${errText}`);
    }

    return (await res.json()) as BloggerPublishResponse;
  });

  return {
    externalId: published.id,
    externalUrl: published.url,
    scheduledAt: published.published,
  };
}
