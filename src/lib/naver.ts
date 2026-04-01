import { getValidTokens, type OAuthTokens } from "@/lib/tokens";

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID!;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET!;
const NAVER_REDIRECT_URI =
  process.env.NAVER_REDIRECT_URI ||
  "http://localhost:3000/api/auth/naver/callback";

// OAuth URL 생성
export function getNaverAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: NAVER_CLIENT_ID,
    redirect_uri: NAVER_REDIRECT_URI,
    response_type: "code",
    state,
  });
  return `https://nid.naver.com/oauth2.0/authorize?${params}`;
}

// Authorization code → tokens
export async function exchangeNaverCode(code: string, state: string): Promise<OAuthTokens> {
  const res = await fetch("https://nid.naver.com/oauth2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: NAVER_CLIENT_ID,
      client_secret: NAVER_CLIENT_SECRET,
      code,
      state,
    }),
  });

  if (!res.ok) {
    throw new Error("Naver token exchange failed");
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`Naver OAuth error: ${data.error_description}`);
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
  };
}

// 토큰 갱신
async function refreshNaverTokens(tokens: OAuthTokens): Promise<OAuthTokens> {
  const res = await fetch("https://nid.naver.com/oauth2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: NAVER_CLIENT_ID,
      client_secret: NAVER_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!res.ok) {
    throw new Error("Naver token refresh failed");
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`Naver refresh error: ${data.error_description}`);
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
  };
}

// 유효한 토큰 가져오기
export async function getValidNaverTokens(): Promise<OAuthTokens | null> {
  return getValidTokens("naver", refreshNaverTokens);
}

// 네이버 블로그 발행
export async function publishToNaver(params: {
  accessToken: string;
  title: string;
  html: string;
}): Promise<{ url: string }> {
  const { accessToken, title, html } = params;

  const formData = new URLSearchParams({
    title,
    contents: html,
  });

  const res = await fetch(
    "https://openapi.naver.com/blog/writePost.json",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Naver publish failed: ${err}`);
  }

  const data = await res.json();
  return {
    url: data.message?.result?.url || "",
  };
}
