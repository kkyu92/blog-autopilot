import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the llm module so callClaude is injectable
vi.mock('../llm', () => ({
  callClaude: vi.fn(),
}));

const VALID_CANDIDATE = {
  keyword: '아파트 전세 시세',
  category: '부동산',
  content_type: '정보형',
  search_volume_trend: '상승',
  priority_score: 82,
  evergreen: true,
  image_keywords: ['apartment', 'real estate'],
};

const VALID_CANDIDATE_2 = {
  keyword: '강남 오피스텔',
  category: '부동산',
  content_type: '비교형',
  search_volume_trend: '안정',
  priority_score: 71,
  evergreen: false,
  image_keywords: ['office building', 'seoul'],
};

// Empty signals — bypasses ALL external fetch calls (daily_trends + niche-specific aggregators)
const NO_SIGNALS = { daily_trends: [] as unknown[], realestate: [] as unknown[], wellness: [] as unknown[], travel: [] as unknown[] };

describe('pickQueue', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Test 1: Returns parsed candidates with evergreen field (direct array response)
  it('returns parsed candidates with evergreen field (direct array)', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValueOnce(
      JSON.stringify([VALID_CANDIDATE, VALID_CANDIDATE_2])
    );

    const { pickQueue } = await import('../trends');
    const result = await pickQueue({ niche: 'AS', signals: NO_SIGNALS });

    expect(result).toHaveLength(2);
    expect(result[0].keyword).toBe('아파트 전세 시세');
    expect(result[0].evergreen).toBe(true);
    expect(result[1].evergreen).toBe(false);
  });

  // Test 2: count defaults to 5
  it('count defaults to 5 — returns up to 5 candidates from LLM', async () => {
    const { callClaude } = await import('../llm');
    const manyCandidates = Array.from({ length: 8 }, (_, i) => ({
      ...VALID_CANDIDATE,
      keyword: `keyword-${i}`,
      priority_score: 70 + i,
    }));
    vi.mocked(callClaude).mockResolvedValueOnce(JSON.stringify(manyCandidates));

    const { pickQueue } = await import('../trends');
    const result = await pickQueue({ niche: 'HS', signals: NO_SIGNALS });

    expect(result).toHaveLength(5);
  });

  // Test 3: count override
  it('count override: opts.count=3 → returns up to 3 candidates', async () => {
    const { callClaude } = await import('../llm');
    const manyCandidates = Array.from({ length: 6 }, (_, i) => ({
      ...VALID_CANDIDATE,
      keyword: `keyword-${i}`,
      priority_score: 70 + i,
    }));
    vi.mocked(callClaude).mockResolvedValueOnce(JSON.stringify(manyCandidates));

    const { pickQueue } = await import('../trends');
    const result = await pickQueue({ niche: 'TS', count: 3, signals: NO_SIGNALS });

    expect(result).toHaveLength(3);
  });

  // Test 4: niche in userMessage
  it('niche WS is present in the userMessage JSON passed to callClaude', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValueOnce(JSON.stringify([VALID_CANDIDATE]));

    const { pickQueue } = await import('../trends');
    await pickQueue({ niche: 'HS', signals: NO_SIGNALS });

    const callArgs = vi.mocked(callClaude).mock.calls[0][0];
    const parsed = JSON.parse(callArgs.userMessage);
    expect(parsed.niche).toBe('HS');
  });

  // Test 5: expectJson:true passed
  it('expectJson:true is passed to callClaude', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValueOnce(JSON.stringify([VALID_CANDIDATE]));

    const { pickQueue } = await import('../trends');
    await pickQueue({ niche: 'AS', signals: NO_SIGNALS });

    const callArgs = vi.mocked(callClaude).mock.calls[0][0];
    expect(callArgs.expectJson).toBe(true);
  });

  // Test 6: trend-hunter persona used as systemPrompt
  it('trend-hunter persona used as systemPrompt (contains unique phrase)', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValueOnce(JSON.stringify([VALID_CANDIDATE]));

    const { pickQueue } = await import('../trends');
    await pickQueue({ niche: 'TS', signals: NO_SIGNALS });

    const callArgs = vi.mocked(callClaude).mock.calls[0][0];
    // Trend Hunter persona contains this Korean phrase
    expect(callArgs.systemPrompt).toContain('Trend Hunter');
  });

  // Test 7: {keywords: [...]} envelope handled
  it('{keywords: [...]} envelope is handled', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValueOnce(
      JSON.stringify({ keywords: [VALID_CANDIDATE, VALID_CANDIDATE_2] })
    );

    const { pickQueue } = await import('../trends');
    const result = await pickQueue({ niche: 'HS', signals: NO_SIGNALS });

    expect(result).toHaveLength(2);
    expect(result[0].keyword).toBe('아파트 전세 시세');
  });

  // Test 8: {candidates: [...]} envelope handled
  it('{candidates: [...]} envelope is handled', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValueOnce(
      JSON.stringify({ candidates: [VALID_CANDIDATE] })
    );

    const { pickQueue } = await import('../trends');
    const result = await pickQueue({ niche: 'AS', signals: NO_SIGNALS });

    expect(result).toHaveLength(1);
    expect(result[0].keyword).toBe('아파트 전세 시세');
  });

  // Test 9: Invalid candidate (missing priority_score) throws
  it('invalid candidate (missing priority_score) throws', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValueOnce(
      JSON.stringify([{ keyword: 'x', category: 'test' }])
    );

    const { pickQueue } = await import('../trends');
    await expect(
      pickQueue({ niche: 'TS', signals: NO_SIGNALS })
    ).rejects.toThrow('priority_score');
  });

  // Test 10: evergreen defaults to false when not specified
  it('evergreen defaults to false when not specified in LLM response', async () => {
    const { callClaude } = await import('../llm');
    const candidateNoEvergreen = {
      keyword: VALID_CANDIDATE.keyword,
      category: VALID_CANDIDATE.category,
      content_type: VALID_CANDIDATE.content_type,
      search_volume_trend: VALID_CANDIDATE.search_volume_trend,
      priority_score: VALID_CANDIDATE.priority_score,
      image_keywords: VALID_CANDIDATE.image_keywords,
      // no evergreen field
    };
    vi.mocked(callClaude).mockResolvedValueOnce(
      JSON.stringify([candidateNoEvergreen])
    );

    const { pickQueue } = await import('../trends');
    const result = await pickQueue({ niche: 'AS', signals: NO_SIGNALS });

    expect(result[0].evergreen).toBe(false);
  });

  // Test 11: evergreen=true is preserved
  it('evergreen=true is preserved when LLM returns true', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValueOnce(
      JSON.stringify([{ ...VALID_CANDIDATE, evergreen: true }])
    );

    const { pickQueue } = await import('../trends');
    const result = await pickQueue({ niche: 'TS', signals: NO_SIGNALS });

    expect(result[0].evergreen).toBe(true);
  });

  // Test 12: signals.daily_trends injection — callClaude receives them; no external fetch
  it('signals.daily_trends injection: userMessage contains injected keywords', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValueOnce(JSON.stringify([VALID_CANDIDATE]));

    const injectedTrends = [
      {
        keyword: '부산 여행',
        trafficVolume: '50K+',
        newsTitle: '',
        newsSource: '',
        newsUrl: '',
        imageUrl: '',
        pubDate: '',
      },
    ];

    const { pickQueue } = await import('../trends');
    await pickQueue({ niche: 'TS', signals: { daily_trends: injectedTrends } });

    const callArgs = vi.mocked(callClaude).mock.calls[0][0];
    const parsed = JSON.parse(callArgs.userMessage);
    expect(parsed.daily_trends_kr.some((t: { keyword: string }) => t.keyword === '부산 여행')).toBe(true);
  });

  // Test 13: callClaude throws → propagates
  // 4/28 사고 후 paperclip 안정성 복원: trend-hunter agent에 이전 발행 키워드 inject
  it('recent_published_keywords inject: userMessage에 keyword list + cannibalization 차단 instruction 포함', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(JSON.stringify([VALID_CANDIDATE]));
    const { pickQueue } = await import('../trends');
    await pickQueue({
      niche: 'AS',
      signals: { daily_trends: [], realestate: [] },
      recent_published_keywords: ['여의도 재건축 추진 현황 2026', '서울 장기안심주택'],
    });
    const userMsg = vi.mocked(callClaude).mock.calls[0][0].userMessage;
    const parsed = JSON.parse(userMsg);
    expect(parsed.recent_published_keywords).toEqual([
      '여의도 재건축 추진 현황 2026',
      '서울 장기안심주택',
    ]);
    expect(parsed.instruction).toContain('CANNIBALIZATION');
    expect(parsed.instruction).toContain('지명+토픽');
    expect(parsed.instruction).toContain('여의도 재건축');
  });

  it('recent_published_keywords 없으면 instruction에 cannibalization 섹션 미포함', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(JSON.stringify([VALID_CANDIDATE]));
    const { pickQueue } = await import('../trends');
    await pickQueue({ niche: 'AS', signals: { daily_trends: [], realestate: [] } });
    const userMsg = vi.mocked(callClaude).mock.calls[0][0].userMessage;
    const parsed = JSON.parse(userMsg);
    expect(parsed.recent_published_keywords).toBeUndefined();
    expect(parsed.instruction).not.toContain('CANNIBALIZATION');
  });

  it('WS niche: signals.wellness inject 시 wellness_news 가 userMessage에 포함', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(JSON.stringify([VALID_CANDIDATE]));
    const { pickQueue } = await import('../trends');
    await pickQueue({
      niche: 'HS',
      signals: {
        daily_trends: [],
        wellness: [
          { title: '건강검진 안내', link: 'x', pubDate: 'p', source: 'health-chosun' },
        ],
      },
    });
    const userMsg = vi.mocked(callClaude).mock.calls[0][0].userMessage;
    const parsed = JSON.parse(userMsg);
    expect(parsed.wellness_news).toHaveLength(1);
    expect(parsed.wellness_news[0].source).toBe('health-chosun');
    expect(parsed.instruction).toContain('wellness_news');
  });

  it('TS niche: signals.travel inject 시 travel_news 가 userMessage에 포함', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(JSON.stringify([VALID_CANDIDATE]));
    const { pickQueue } = await import('../trends');
    await pickQueue({
      niche: 'TS',
      signals: {
        daily_trends: [],
        travel: [
          { title: '황금연휴 여행지', link: 'x', pubDate: 'p', source: 'google-news-season' },
        ],
      },
    });
    const userMsg = vi.mocked(callClaude).mock.calls[0][0].userMessage;
    const parsed = JSON.parse(userMsg);
    expect(parsed.travel_news).toHaveLength(1);
    expect(parsed.travel_news[0].source).toBe('google-news-season');
    expect(parsed.instruction).toContain('travel_news');
  });

  it('callClaude throws → pickQueue rejects with same error', async () => {
    const { callClaude } = await import('../llm');
    const err = new Error('API failure');
    vi.mocked(callClaude).mockRejectedValueOnce(err);

    const { pickQueue } = await import('../trends');
    await expect(
      pickQueue({ niche: 'HS', signals: NO_SIGNALS })
    ).rejects.toThrow('API failure');
  });
});
