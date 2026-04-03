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
  return `당신은 10년 경력의 한국어 블로그 콘텐츠 전문 작가입니다.
단순 정보 나열이 아닌, 독자에게 실질적 가치를 전달하는 깊이 있는 글을 씁니다.

${TONE_PROMPTS[tone]}

## 글 작성 원칙

### 구조
- Markdown 형식 (H2, H3 소제목으로 구조화)
- 서론: 독자의 문제/궁금증을 정확히 짚고 시작 (뻔한 도입부 금지)
- 본론: 각 섹션이 독립적인 가치를 제공. 빈 말 없이 구체적으로
- 결론: 핵심 요약 + 독자가 바로 실행할 수 있는 행동 제시

### 차별화 (가장 중요)
- 참고 자료에 이미 있는 내용을 반복하지 마세요
- 참고 자료가 놓친 관점, 더 깊은 분석, 최신 정보를 추가하세요
- "이 글에서만 얻을 수 있는 인사이트"가 반드시 1개 이상 포함되어야 합니다
- 다른 글에서 본 적 없는 비유, 사례, 데이터를 활용하세요

### SEO
- 키워드를 제목, 첫 문단, H2 소제목에 자연스럽게 배치
- 키워드 밀도 1~3% (너무 많아도 안 됨)
- 관련 키워드(LSI)를 본문에 자연스럽게 분산

### 품질 기준 (반드시 지키세요)
- 구체적 수치, 날짜, 사례를 포함할 것 (막연한 표현 금지)
- "많은", "다양한", "여러" 같은 모호한 수식어 대신 구체적 숫자 사용
- 한 문장이 50자를 넘지 않도록 (가독성)
- 같은 표현을 3번 이상 반복하지 않을 것
- AI가 쓴 티가 나지 않게: 자연스러운 흐름, 개인적 관점, 독특한 비유

### 절대 하지 말 것
- "오늘은 ~에 대해 알아보겠습니다" 류의 도입부
- "~라고 할 수 있습니다" 류의 결론
- 단순 정의만 나열 ("A란 B이다. C란 D이다.")
- 출처 없는 통계 ("전문가들에 따르면...")
- 이모지 사용`;
}

function buildUserPrompt(
  keyword: string,
  targetLength: number,
  sourceSummaries?: string
): string {
  let prompt = `키워드: ${keyword}\n목표 분량: 약 ${targetLength}자 이상\n`;

  if (sourceSummaries) {
    prompt += `
## 참고 자료 분석 지침

아래는 이 키워드에 대한 기존 글들입니다. 이 자료를 활용하되, 반드시 다음을 수행하세요:

1. **분석**: 각 참고 자료의 핵심 주장과 구조를 파악하세요
2. **빈틈 찾기**: 참고 자료들이 공통적으로 놓친 관점, 부족한 설명, 오래된 정보를 찾으세요
3. **차별화**: 참고 자료에 없는 새로운 인사이트, 더 깊은 분석, 실용적 조언을 추가하세요
4. **절대 복사 금지**: 문장 구조나 표현을 그대로 가져오지 마세요. 완전히 새로운 글을 쓰세요

### 참고 자료:
---
${sourceSummaries}
---

위 자료를 분석한 후, 이 자료들보다 더 깊이 있고, 더 실용적이고, 더 독자 친화적인 글을 작성하세요.
`;
  }

  prompt += `\n위 키워드에 대한 블로그 글을 Markdown 형식으로 작성해주세요.
제목(H1)은 포함하지 마세요. 본문만 작성합니다.
최소 ${targetLength}자 이상 작성하세요. 양보다 질이 중요하지만, 충분한 분량도 중요합니다.`;

  return prompt;
}

export interface GenerateOptions {
  keyword: string;
  tone?: Tone;
  targetLength?: number;
  sourceSummaries?: string;
  signal?: AbortSignal;
}

// Streaming 콘텐츠 생성 (최고 품질 모델 사용)
export async function* generateContent(
  options: GenerateOptions
): AsyncGenerator<string> {
  const {
    keyword,
    tone = "informative",
    targetLength = 3000,
    sourceSummaries,
    signal,
  } = options;

  const client = getClient();

  const stream = client.messages.stream(
    {
      model: "claude-opus-4-20250514",
      max_tokens: 16384,
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
글 내용 첫 1000자: ${bodyPreview.slice(0, 1000)}

규칙:
- seo_title: 검색에 노출될 제목, 60자 이내, 핵심 키워드 포함, 클릭을 유도하는 문구
- seo_description: 검색 결과에 표시될 설명, 155자 이내, 글의 핵심 가치를 전달
- seo_tags: 5~10개 관련 키워드 배열 (한국어, 검색량이 높을 법한 키워드 위주)

JSON만 출력하세요:
{"seo_title": "...", "seo_description": "...", "seo_tags": ["...", "..."]}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  try {
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
