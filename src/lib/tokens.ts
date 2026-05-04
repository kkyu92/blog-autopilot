import { db } from "@/lib/db";
import { settings } from "@/lib/schema";
import { eq } from "drizzle-orm";

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp (ms)
  token_type?: string;
  scope?: string;
}

// 토큰 저장
export async function saveTokens(
  platform: string,
  tokens: OAuthTokens
): Promise<void> {
  const key = `${platform}_tokens`;
  const value = JSON.stringify(tokens);

  const [existing] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key));

  if (existing) {
    await db.update(settings).set({ value }).where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value });
  }
}

// 토큰 조회
export async function getTokens(
  platform: string
): Promise<OAuthTokens | null> {
  const key = `${platform}_tokens`;
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  if (!row) return null;

  try {
    return JSON.parse(row.value) as OAuthTokens;
  } catch {
    return null;
  }
}

// 토큰 만료 확인 (5분 여유)
export function isExpired(tokens: OAuthTokens): boolean {
  return Date.now() > tokens.expires_at - 5 * 60 * 1000;
}

// 갱신 mutex — 동시 갱신 방지
const refreshLocks = new Map<string, Promise<OAuthTokens>>();

export async function getValidTokens(
  platform: string,
  refreshFn: (tokens: OAuthTokens) => Promise<OAuthTokens>
): Promise<OAuthTokens | null> {
  const tokens = await getTokens(platform);
  if (!tokens) return null;

  if (!isExpired(tokens)) return tokens;

  // 이미 갱신 중이면 기다림
  const existing = refreshLocks.get(platform);
  if (existing) return existing;

  const refreshPromise = (async () => {
    try {
      const newTokens = await refreshFn(tokens);
      await saveTokens(platform, newTokens);
      return newTokens;
    } finally {
      refreshLocks.delete(platform);
    }
  })();

  refreshLocks.set(platform, refreshPromise);
  return refreshPromise;
}

// 토큰 삭제
export async function deleteTokens(platform: string): Promise<void> {
  const key = `${platform}_tokens`;
  await db.delete(settings).where(eq(settings.key, key));
}

// ─── Niche-scoped env-based credential resolution (synchronous, no DB) ────────
// 5/5 WP→Blogger 마이그레이션 후 Blogger 만 운영. WP credentials 함수 제거.

export interface BloggerCredentials {
  refreshToken: string;
  blogId: string;
  clientId: string;
  clientSecret: string;
}

// niche → BLOG_ID env suffix 매핑 (도메인 일관 명명)
// AS → apt-signal.blogspot.com (GOOGLE_BLOG_ID_APT, fallback GOOGLE_BLOG_ID for backward compat)
// TS → travel-signal.blogspot.com (GOOGLE_BLOG_ID_TRAVEL)
// WS → health-signal.blogspot.com (GOOGLE_BLOG_ID_HEALTH)
const BLOG_ID_ENV_SUFFIX: Record<'AS' | 'TS' | 'WS', string> = {
  AS: 'APT',
  TS: 'TRAVEL',
  WS: 'HEALTH',
};

export function getBloggerCredentials(niche: 'AS' | 'TS' | 'WS' = 'AS'): BloggerCredentials {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const suffix = BLOG_ID_ENV_SUFFIX[niche];
  // AS는 backward compat — 기존 GOOGLE_BLOG_ID env도 fallback 인정
  const blogId =
    process.env[`GOOGLE_BLOG_ID_${suffix}`] ??
    (niche === 'AS' ? process.env.GOOGLE_BLOG_ID : undefined);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!refreshToken) throw new Error('Blogger credentials missing: GOOGLE_REFRESH_TOKEN');
  if (!blogId) throw new Error(`Blogger credentials missing: GOOGLE_BLOG_ID_${suffix}`);
  if (!clientId) throw new Error('Blogger credentials missing: GOOGLE_CLIENT_ID');
  if (!clientSecret) throw new Error('Blogger credentials missing: GOOGLE_CLIENT_SECRET');
  return { refreshToken, blogId, clientId, clientSecret };
}
