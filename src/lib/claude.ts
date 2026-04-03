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

const TONE_PROMPTS: Record<Tone, string> = {
  informative: `톤: 정보 전달형
- 객관적이고 명확한 어조로 작성
- "~입니다", "~됩니다" 체를 사용
- 핵심 정보를 먼저 제시하고 부연 설명
- 통계나 수치가 있으면 적극 활용
- 독자가 빠르게 정보를 얻을 수 있도록 구성`,

  conversational: `톤: 대화체
- 친근하고 편한 어조로 작성 ("~해요", "~거든요", "~죠")
- 독자에게 말을 거는 듯한 문장 포함 ("혹시 ~해보신 적 있나요?")
- 개인 경험이나 일화를 자연스럽게 섞어서 작성
- 딱딱한 설명 대신 비유와 예시를 활용
- 이모지 사용하지 않기`,

  expert: `톤: 전문가
- 깊이 있는 분석과 전문 용어를 적절히 사용
- "~이다", "~하다" 체 또는 "~입니다" 체 일관 유지
- 원인-결과 관계를 명확히 서술
- 업계 동향이나 전문적 인사이트 포함
- 신뢰감을 주는 논리적 구성`,
};

function buildSystemPrompt(tone: Tone): string {
  return `당신은 한국어 블로그 콘텐츠 전문 작가입니다.

${TONE_PROMPTS[tone]}

글 작성 규칙:
- Markdown 형식으로 작성 (H2, H3 소제목으로 구조화)
- 서론에서 독자의 관심을 끌고, 키워드를 자연스럽게 포함
- 각 섹션은 실질적인 가치를 제공 (뻔한 내용 반복 금지)
- SEO 친화적: 키워드를 제목, 첫 문단, 소제목에 자연스럽게 배치
- 마지막에 핵심 요약 또는 독자 행동 촉구 포함
- 한국어 맞춤법과 자연스러운 문장 사용
- AI가 쓴 티가 나지 않게 자연스러운 흐름 유지
- 불필요한 서론("오늘은 ~에 대해 알아보겠습니다") 지양`;
}

function buildUserPrompt(
  keyword: string,
  targetLength: number,
  sourceSummaries?: string
): string {
  let prompt = `키워드: ${keyword}\n목표 분량: 약 ${targetLength}자\n`;

  if (sourceSummaries) {
    const trimmed = sourceSummaries.slice(0, 10240);
    prompt += `\n참고 자료 (이 내용을 기반으로 새로운 글을 창작하세요. 그대로 복사하지 마세요):\n---\n${trimmed}\n---\n`;
  }

  prompt += `\n위 키워드에 대한 블로그 글을 Markdown 형식으로 작성해주세요.
제목(H1)은 포함하지 마세요 — 본문만 작성합니다.`;

  return prompt;
}

export interface GenerateOptions {
  keyword: string;
  tone?: Tone;
  targetLength?: number;
  sourceSummaries?: string;
  signal?: AbortSignal;
}

// Streaming 콘텐츠 생성
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
      model: "claude-opus-4-20250514",
      max_tokens: 8192,
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
        content: `다음 블로그 글의 SEO 메타데이터를 JSON으로 생성하세요.

글 제목: ${title}
글 내용 첫 500자: ${bodyPreview.slice(0, 500)}

규칙:
- seo_title: 검색에 노출될 제목, 60자 이내, 핵심 키워드 포함
- seo_description: 검색 결과에 표시될 설명, 155자 이내, 클릭을 유도하는 문구
- seo_tags: 5~10개 관련 키워드 배열 (한국어)

JSON만 출력하세요:
{"seo_title": "...", "seo_description": "...", "seo_tags": ["...", "..."]}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
    // JSON 블록에서 추출 (```json ... ``` 또는 순수 JSON)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    return {
      seoTitle: parsed.seo_title || title,
      seoDescription: parsed.seo_description || "",
      seoTags: parsed.seo_tags || [],
    };
  } catch {
    return { seoTitle: title, seoDescription: "", seoTags: [] };
  }
}
