import { describe, it, expect } from "vitest";

// claude.ts 내부 프롬프트 빌더 로직 테스트

describe("buildSystemPrompt", () => {
  const TONE_PROMPTS: Record<string, string> = {
    informative: "톤: 정보 전달형",
    conversational: "톤: 대화체",
    expert: "톤: 전문가",
  };

  function buildSystemPrompt(tone: string): string {
    return `당신은 한국어 블로그 콘텐츠 전문 작가입니다.\n\n${TONE_PROMPTS[tone]}`;
  }

  it("includes informative tone prompt", () => {
    const result = buildSystemPrompt("informative");
    expect(result).toContain("정보 전달형");
    expect(result).toContain("한국어 블로그");
  });

  it("includes conversational tone prompt", () => {
    const result = buildSystemPrompt("conversational");
    expect(result).toContain("대화체");
  });

  it("includes expert tone prompt", () => {
    const result = buildSystemPrompt("expert");
    expect(result).toContain("전문가");
  });
});

describe("buildUserPrompt", () => {
  function buildUserPrompt(keyword: string, targetLength: number, sourceSummaries?: string): string {
    let prompt = `키워드: ${keyword}\n목표 분량: 약 ${targetLength}자\n`;
    if (sourceSummaries) {
      const trimmed = sourceSummaries.slice(0, 10240);
      prompt += `\n참고 자료 (이 내용을 기반으로 새로운 글을 창작하세요. 그대로 복사하지 마세요):\n---\n${trimmed}\n---\n`;
    }
    prompt += `\n위 키워드에 대한 블로그 글을 Markdown 형식으로 작성해주세요.\n제목(H1)은 포함하지 마세요 — 본문만 작성합니다.`;
    return prompt;
  }

  it("includes keyword and length", () => {
    const result = buildUserPrompt("인공지능", 3000);
    expect(result).toContain("키워드: 인공지능");
    expect(result).toContain("약 3000자");
  });

  it("includes source summaries when provided", () => {
    const result = buildUserPrompt("테스트", 2500, "참고 내용입니다");
    expect(result).toContain("참고 자료");
    expect(result).toContain("참고 내용입니다");
  });

  it("excludes source section when not provided", () => {
    const result = buildUserPrompt("테스트", 2500);
    expect(result).not.toContain("참고 자료");
  });

  it("truncates source summaries at 10240 chars", () => {
    const longSource = "A".repeat(20000);
    const result = buildUserPrompt("테스트", 2500, longSource);
    // 참고 자료 부분만 추출해서 길이 체크
    expect(result).toContain("A".repeat(10240));
    expect(result).not.toContain("A".repeat(10241));
  });

  it("always includes markdown instruction", () => {
    const result = buildUserPrompt("키워드", 2500);
    expect(result).toContain("Markdown 형식");
    expect(result).toContain("제목(H1)은 포함하지 마세요");
  });
});

describe("SEO JSON parsing logic", () => {
  function parseSeoResponse(text: string, fallbackTitle: string) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      return {
        seoTitle: parsed.seo_title || fallbackTitle,
        seoDescription: parsed.seo_description || "",
        seoTags: parsed.seo_tags || [],
      };
    } catch {
      return { seoTitle: fallbackTitle, seoDescription: "", seoTags: [] };
    }
  }

  it("parses valid JSON response", () => {
    const text = '{"seo_title": "테스트 제목", "seo_description": "설명", "seo_tags": ["tag1", "tag2"]}';
    const result = parseSeoResponse(text, "fallback");
    expect(result.seoTitle).toBe("테스트 제목");
    expect(result.seoDescription).toBe("설명");
    expect(result.seoTags).toEqual(["tag1", "tag2"]);
  });

  it("parses JSON wrapped in markdown code block", () => {
    const text = '```json\n{"seo_title": "제목", "seo_description": "설명", "seo_tags": []}\n```';
    const result = parseSeoResponse(text, "fallback");
    expect(result.seoTitle).toBe("제목");
  });

  it("returns fallback on invalid JSON", () => {
    const result = parseSeoResponse("not json at all", "대체 제목");
    expect(result.seoTitle).toBe("대체 제목");
    expect(result.seoDescription).toBe("");
    expect(result.seoTags).toEqual([]);
  });

  it("uses fallback title when seo_title is empty", () => {
    const text = '{"seo_title": "", "seo_description": "설명", "seo_tags": []}';
    const result = parseSeoResponse(text, "fallback 제목");
    expect(result.seoTitle).toBe("fallback 제목");
  });
});
