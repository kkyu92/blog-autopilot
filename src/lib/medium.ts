// Medium API 연동 (Integration Token 기반, OAuth 불필요)
// https://github.com/Medium/medium-api-docs

export interface MediumUser {
  id: string;
  username: string;
  name: string;
  url: string;
}

export interface MediumPublishResult {
  id: string;
  url: string;
  title: string;
  publishStatus: string;
}

// Medium 사용자 정보 조회
export async function getMediumUser(
  integrationToken: string
): Promise<MediumUser> {
  const res = await fetch("https://api.medium.com/v1/me", {
    headers: {
      Authorization: `Bearer ${integrationToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Medium auth failed (${res.status}): ${err}`);
  }

  const { data } = await res.json();
  return {
    id: data.id,
    username: data.username,
    name: data.name,
    url: data.url,
  };
}

// Medium 글 발행
export async function publishToMedium(params: {
  integrationToken: string;
  authorId: string;
  title: string;
  html: string;
  tags?: string[];
  publishStatus?: "public" | "draft" | "unlisted";
  canonicalUrl?: string;
}): Promise<MediumPublishResult> {
  const {
    integrationToken,
    authorId,
    title,
    html,
    tags = [],
    publishStatus = "draft",
    canonicalUrl,
  } = params;

  const body: Record<string, unknown> = {
    title,
    contentFormat: "html",
    content: html,
    tags: tags.slice(0, 5), // Medium 최대 5개 태그
    publishStatus,
  };

  if (canonicalUrl) {
    body.canonicalUrl = canonicalUrl;
  }

  const res = await fetch(
    `https://api.medium.com/v1/users/${authorId}/posts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integrationToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Medium publish failed (${res.status}): ${err}`);
  }

  const { data } = await res.json();
  return {
    id: data.id,
    url: data.url,
    title: data.title,
    publishStatus: data.publishStatus,
  };
}
