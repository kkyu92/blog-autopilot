import { getValidTokens, type OAuthTokens } from "@/lib/tokens";

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
    `https://public-api.wordpress.com/rest/v1.2/sites/${site}/posts/${postId}/delete`,
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
