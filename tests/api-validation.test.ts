import { describe, it, expect } from "vitest";

// API 라우트의 입력 검증 로직 테스트 (핸들러 외부에서 순수 로직으로 테스트)

describe("POST /api/content validation", () => {
  function validateCreateContent(body: Record<string, unknown>) {
    if (!body.title) return { error: "title is required", status: 400 };
    return null;
  }

  it("rejects missing title", () => {
    const err = validateCreateContent({});
    expect(err).toEqual({ error: "title is required", status: 400 });
  });

  it("rejects empty title", () => {
    const err = validateCreateContent({ title: "" });
    expect(err).toEqual({ error: "title is required", status: 400 });
  });

  it("accepts valid title", () => {
    const err = validateCreateContent({ title: "테스트 제목" });
    expect(err).toBeNull();
  });
});

describe("POST /api/content/generate validation", () => {
  function validateGenerate(body: Record<string, unknown>) {
    if (!body.contentId || !body.keyword) {
      return { error: "contentId and keyword are required", status: 400 };
    }
    return null;
  }

  it("rejects missing contentId", () => {
    const err = validateGenerate({ keyword: "test" });
    expect(err?.status).toBe(400);
  });

  it("rejects missing keyword", () => {
    const err = validateGenerate({ contentId: "abc" });
    expect(err?.status).toBe(400);
  });

  it("accepts valid input", () => {
    const err = validateGenerate({ contentId: "abc", keyword: "test" });
    expect(err).toBeNull();
  });
});

describe("POST /api/content/bulk-generate validation", () => {
  function validateBulkGenerate(body: Record<string, unknown>) {
    const { keywords } = body;
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return { error: "keywords array is required", status: 400 };
    }
    if (keywords.length > 10) {
      return { error: "Maximum 10 keywords per batch", status: 400 };
    }
    return null;
  }

  it("rejects non-array keywords", () => {
    expect(validateBulkGenerate({ keywords: "test" })).toEqual({
      error: "keywords array is required",
      status: 400,
    });
  });

  it("rejects empty array", () => {
    expect(validateBulkGenerate({ keywords: [] })).toEqual({
      error: "keywords array is required",
      status: 400,
    });
  });

  it("rejects more than 10 keywords", () => {
    const keywords = Array.from({ length: 11 }, (_, i) => `kw${i}`);
    expect(validateBulkGenerate({ keywords })).toEqual({
      error: "Maximum 10 keywords per batch",
      status: 400,
    });
  });

  it("accepts 1 keyword", () => {
    expect(validateBulkGenerate({ keywords: ["test"] })).toBeNull();
  });

  it("accepts 10 keywords (max)", () => {
    const keywords = Array.from({ length: 10 }, (_, i) => `kw${i}`);
    expect(validateBulkGenerate({ keywords })).toBeNull();
  });
});

describe("POST /api/publish/schedule validation", () => {
  function validateSchedule(body: Record<string, unknown>) {
    const { contentId, scheduledAt, platform } = body;
    if (!contentId || !scheduledAt || !platform) {
      return { error: "contentId, scheduledAt, platform are required", status: 400 };
    }
    if (!["wordpress_ws", "wordpress_ts", "blogger_as"].includes(platform as string)) {
      return { error: "platform must be wordpress_ws, wordpress_ts, or blogger_as", status: 400 };
    }
    const scheduled = new Date(scheduledAt as string);
    if (isNaN(scheduled.getTime()) || scheduled <= new Date()) {
      return { error: "scheduledAt must be a future date", status: 400 };
    }
    return null;
  }

  it("rejects missing fields", () => {
    expect(validateSchedule({})).toBeTruthy();
    expect(validateSchedule({ contentId: "a" })).toBeTruthy();
    expect(validateSchedule({ contentId: "a", scheduledAt: "2030-01-01" })).toBeTruthy();
  });

  it("rejects invalid platform", () => {
    const err = validateSchedule({
      contentId: "a",
      scheduledAt: "2030-01-01T00:00:00Z",
      platform: "wordpress",
    });
    expect(err?.error).toContain("platform must be");
  });

  it("rejects past date", () => {
    const err = validateSchedule({
      contentId: "a",
      scheduledAt: "2020-01-01T00:00:00Z",
      platform: "blogger_as",
    });
    expect(err?.error).toContain("future date");
  });

  it("rejects invalid date", () => {
    const err = validateSchedule({
      contentId: "a",
      scheduledAt: "not-a-date",
      platform: "blogger_as",
    });
    expect(err?.error).toContain("future date");
  });

  it("accepts valid schedule", () => {
    const err = validateSchedule({
      contentId: "a",
      scheduledAt: "2030-06-15T10:00:00Z",
      platform: "wordpress_ws",
    });
    expect(err).toBeNull();
  });
});

describe("POST /api/publish/blogger validation", () => {
  function validatePublish(body: Record<string, unknown>) {
    if (!body.contentId) {
      return { error: "contentId is required", status: 400 };
    }
    return null;
  }

  it("rejects missing contentId", () => {
    expect(validatePublish({})).toEqual({ error: "contentId is required", status: 400 });
  });

  it("accepts valid contentId", () => {
    expect(validatePublish({ contentId: "abc123" })).toBeNull();
  });
});

describe("GET /api/images validation", () => {
  function validateImageSearch(q: string | null | undefined) {
    const trimmed = q?.trim();
    if (!trimmed) return { error: "q parameter is required", status: 400 };
    return null;
  }

  it("rejects null query", () => {
    expect(validateImageSearch(null)).toBeTruthy();
  });

  it("rejects empty string", () => {
    expect(validateImageSearch("")).toBeTruthy();
  });

  it("rejects whitespace-only", () => {
    expect(validateImageSearch("   ")).toBeTruthy();
  });

  it("accepts valid query", () => {
    expect(validateImageSearch("cats")).toBeNull();
  });
});

describe("PUT /api/settings — token protection", () => {
  function filterSettingsUpdate(body: Record<string, string>) {
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== "string") continue;
      if (key.endsWith("_tokens")) continue; // 토큰 직접 수정 차단
      filtered[key] = value;
    }
    return filtered;
  }

  it("blocks token keys", () => {
    const result = filterSettingsUpdate({
      blogger_tokens: '{"access_token":"stolen"}',
      naver_tokens: '{"access_token":"stolen"}',
      claude_api_key: "sk-ant-real",
    });
    expect(result).not.toHaveProperty("blogger_tokens");
    expect(result).not.toHaveProperty("naver_tokens");
    expect(result).toHaveProperty("claude_api_key");
  });

  it("allows normal settings", () => {
    const result = filterSettingsUpdate({
      blog_name: "My Blog",
      default_tone: "expert",
    });
    expect(result).toEqual({ blog_name: "My Blog", default_tone: "expert" });
  });
});
