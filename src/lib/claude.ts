import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export type Tone = "informative" | "conversational" | "expert";

const TONE_LABELS: Record<Tone, string> = {
  informative: "정보 전달형",
  conversational: "대화체",
  expert: "전문가",
};

function buildSystemPrompt(tone: Tone): string {
  return `당신은 한국어 블로그 콘텐츠 전문 작가입니다.
톤: ${TONE_LABELS[tone]}
다음 규칙을 따르세요:
- H2, H3 소제목으로 구조화
- 2000-3000자 분량
- SEO 친화적: 키워드를 제목, 첫 문단, 소제목에 자연스럽게 포함
- 독자에게 실질적인 가치를 제공하는 내용
- 마지막에 요약 또는 행동 촉구 포함`;
}

function buildUserPrompt(
  keyword: string,
  targetLength: number,
  sourceSummaries?: string
): string {
  let prompt = `키워드: ${keyword}\n원하는 분량: ${targetLength}자\n`;
  if (sourceSummaries) {
    // 10KB limit on source material
    const trimmed = sourceSummaries.slice(0, 10240);
    prompt += `\n참고 자료:\n---\n${trimmed}\n---\n`;
  }
  prompt += `\n위 키워드에 대한 블로그 글을 Markdown 형식으로 작성해주세요.`;
  return prompt;
}

export interface GenerateOptions {
  keyword: string;
  tone?: Tone;
  targetLength?: number;
  sourceSummaries?: string;
  signal?: AbortSignal;
}

// Streaming 콘텐츠 생성 — AsyncIterable<string> 반환
export async function* generateContent(
  options: GenerateOptions
): AsyncGenerator<string> {
  const {
    keyword,
    tone = "informative",
    targetLength = 2500,
    sourceSummaries,
    signal,
  } = options;

  const client = getClient();

  const stream = client.messages.stream(
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: buildSystemPrompt(tone),
      messages: [
        {
          role: "user",
          content: buildUserPrompt(keyword, targetLength, sourceSummaries),
        },
      ],
    },
    { signal }
  );

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

// SEO 메타데이터 생성 (non-streaming)
export async function generateSeoMeta(
  title: string,
  bodyPreview: string
): Promise<{ seoTitle: string; seoDescription: string; seoTags: string[] }> {
  const client = getClient();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `다음 블로그 글의 SEO 메타데이터를 JSON으로 생성하세요:
- seo_title: 60자 이내
- seo_description: 155자 이내
- seo_tags: 5-10개 키워드 배열

글 제목: ${title}
글 내용 첫 500자: ${bodyPreview.slice(0, 500)}

JSON만 출력하세요. 다른 텍스트 없이.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    return {
      seoTitle: parsed.seo_title || title,
      seoDescription: parsed.seo_description || "",
      seoTags: parsed.seo_tags || [],
    };
  } catch {
    return { seoTitle: title, seoDescription: "", seoTags: [] };
  }
}
