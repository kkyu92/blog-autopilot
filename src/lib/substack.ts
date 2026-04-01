// Substack 발행 (Substack API / Email Draft 방식)
// Substack은 공식 API가 없으므로 Substack의 비공개 API를 활용
// 사용자는 이메일+패스워드 또는 쿠키 기반으로 인증

export interface SubstackDraft {
  id: number;
  title: string;
  subtitle: string;
  draft_url: string;
}

export interface SubstackConfig {
  subdomain: string; // e.g., "myblog" for myblog.substack.com
  email: string;
  password: string;
  // 또는 인증 쿠키
  cookie?: string;
}

// Substack 로그인하여 쿠키 획득
export async function loginToSubstack(
  email: string,
  password: string
): Promise<string> {
  const res = await fetch("https://substack.com/api/v1/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, captcha_response: null }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Substack login failed: ${res.status}`);
  }

  // Set-Cookie 헤더에서 세션 쿠키 추출
  const cookies = res.headers.getSetCookie?.() || [];
  const sessionCookie = cookies
    .map((c) => c.split(";")[0])
    .filter((c) => c.startsWith("substack.sid") || c.startsWith("connect.sid"))
    .join("; ");

  if (!sessionCookie) {
    throw new Error("No session cookie received from Substack");
  }

  return sessionCookie;
}

// Substack 초안 생성
export async function createSubstackDraft(params: {
  subdomain: string;
  cookie: string;
  title: string;
  subtitle?: string;
  html: string;
}): Promise<SubstackDraft> {
  const { subdomain, cookie, title, subtitle, html } = params;

  const res = await fetch(
    `https://${subdomain}.substack.com/api/v1/drafts`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({
        draft_title: title,
        draft_subtitle: subtitle || "",
        draft_body: { type: "doc", content: htmlToSubstackBody(html) },
        type: "newsletter",
      }),
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Substack draft creation failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    title: data.draft_title,
    subtitle: data.draft_subtitle || "",
    draft_url: `https://${subdomain}.substack.com/publish/post/${data.id}`,
  };
}

// HTML을 Substack ProseMirror 형식으로 변환 (간소화)
function htmlToSubstackBody(
  html: string
): Array<{ type: string; content?: Array<{ type: string; text?: string }> }> {
  // Substack은 ProseMirror 기반 에디터 사용
  // 간단하게 HTML 그대로 paragraph로 래핑
  return [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: html, // Substack이 자체적으로 HTML 파싱
        },
      ],
    },
  ];
}

// Substack 발행 (draft → publish)
export async function publishSubstackDraft(params: {
  subdomain: string;
  cookie: string;
  draftId: number;
}): Promise<{ url: string }> {
  const { subdomain, cookie, draftId } = params;

  const res = await fetch(
    `https://${subdomain}.substack.com/api/v1/drafts/${draftId}/publish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ send: false }), // send: false = 웹 전용 (이메일 안 보냄)
      signal: AbortSignal.timeout(15000),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Substack publish failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    url: data.canonical_url || `https://${subdomain}.substack.com/p/${data.slug}`,
  };
}
