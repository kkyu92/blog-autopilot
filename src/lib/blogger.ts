import { getValidTokens, type OAuthTokens } from "@/lib/tokens";

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
