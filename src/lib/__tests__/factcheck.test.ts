import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock for ./llm — must be at top level for vi.mock hoisting
vi.mock('../llm', () => ({
  callClaude: vi.fn(),
}));

describe('factcheck', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Test 1: WS niche — verdict=pass
  it('WS niche — 통과 시 verdict=pass, issues 빈 배열', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({ verdict: 'pass', issues: [], disclaimer_added: false }),
    );

    const { factcheck } = await import('../factcheck');
    const result = await factcheck({
      niche: 'HS',
      draft: {
        content_html: '<p>건강한 생활습관에 대한 글입니다.</p>',
        title: '건강 생활습관',
        keyword: '건강',
      },
    });

    expect(result.verdict).toBe('pass');
    expect(result.issues).toEqual([]);
    expect(result.disclaimer_added).toBe(false);
  });

  // Test 2: WS niche — needs_revision with issues
  it('WS niche — 수정 필요 시 verdict=needs_revision, issues 배열 채워짐', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        verdict: 'needs_revision',
        issues: [
          {
            type: 'source',
            description: '통계 출처 없음',
            suggested_fix: 'WHO 또는 질병관리청 출처 명시 필요',
          },
        ],
        disclaimer_added: false,
      }),
    );

    const { factcheck } = await import('../factcheck');
    const result = await factcheck({
      niche: 'HS',
      draft: {
        content_html: '<p>연구에 따르면 90%가 효과적입니다.</p>',
        title: '건강 효과',
        keyword: '건강 효과',
      },
    });

    expect(result.verdict).toBe('needs_revision');
    expect(result.issues).toHaveLength(1);
    expect(result.issues![0].type).toBe('source');
  });

  // Test 3: AS niche — disclaimer 자동 삽입
  it('AS niche — 면책 문구 누락 시 disclaimer_added=true, modified_html에 면책 포함', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        verdict: 'pass',
        issues: [],
        disclaimer_added: true,
        modified_html:
          '<p>부동산 투자 정보입니다.</p><p>이 글은 정보 제공 목적이며, 전문 의료/법률/세무 상담을 대체하지 않습니다.</p>',
      }),
    );

    const { factcheck } = await import('../factcheck');
    const result = await factcheck({
      niche: 'AS',
      draft: {
        content_html: '<p>부동산 투자 정보입니다.</p>',
        title: '부동산 투자',
        keyword: '부동산 투자',
      },
    });

    expect(result.disclaimer_added).toBe(true);
    expect(result.modified_html).toContain('정보 제공 목적');
  });

  // Test 4: TS niche — skip without calling callClaude
  it('TS niche — YMYL 아님, callClaude 호출 없이 verdict=skipped 반환', async () => {
    const { callClaude } = await import('../llm');

    const { factcheck } = await import('../factcheck');
    const result = await factcheck({
      niche: 'TS',
      draft: {
        content_html: '<p>여행 정보입니다.</p>',
        title: '제주도 여행',
        keyword: '제주도 여행',
      },
    });

    expect(result.verdict).toBe('skipped');
    expect(callClaude).not.toHaveBeenCalled();
  });

  // Test 5: callClaude throws — error propagates
  it('callClaude 오류 → factcheck에서 에러 전파', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockRejectedValue(new Error('claude CLI 연결 실패'));

    const { factcheck } = await import('../factcheck');
    await expect(
      factcheck({
        niche: 'HS',
        draft: {
          content_html: '<p>건강 정보</p>',
          title: '건강',
          keyword: '건강',
        },
      }),
    ).rejects.toThrow('claude CLI 연결 실패');
  });

  // Test 6: Invalid JSON from callClaude — error propagates (via expectJson:true)
  it('callClaude가 유효하지 않은 JSON 반환 시 에러 전파', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockRejectedValue(new Error('invalid JSON: Unexpected token'));

    const { factcheck } = await import('../factcheck');
    await expect(
      factcheck({
        niche: 'AS',
        draft: {
          content_html: '<p>금융 정보</p>',
          title: '금융',
          keyword: '금융',
        },
      }),
    ).rejects.toThrow('invalid JSON');
  });

  // Test 7: Multiple issue types — source, recency, forbidden
  it('여러 issue 타입 — source, recency, forbidden 동시 존재', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        verdict: 'needs_revision',
        issues: [
          {
            type: 'source',
            description: '통계 출처 없음',
            suggested_fix: '출처 URL 추가',
          },
          {
            type: 'recency',
            description: '2024년 부동산 정책 언급',
            suggested_fix: '2026년 기준으로 업데이트',
          },
          {
            type: 'forbidden',
            description: '"절세 보장" 표현 사용',
            suggested_fix: '"절세 가능성이 있을 수 있습니다"로 변경',
          },
        ],
        disclaimer_added: true,
        modified_html: '<p>수정된 HTML</p><p>이 글은 정보 제공 목적...</p>',
      }),
    );

    const { factcheck } = await import('../factcheck');
    const result = await factcheck({
      niche: 'AS',
      draft: {
        content_html: '<p>부동산 절세 보장 정보</p>',
        title: '절세 전략',
        keyword: '절세',
      },
    });

    expect(result.verdict).toBe('needs_revision');
    expect(result.issues).toHaveLength(3);
    const types = result.issues!.map((i) => i.type);
    expect(types).toContain('source');
    expect(types).toContain('recency');
    expect(types).toContain('forbidden');
  });

  // Test 8: expectJson:true is passed to callClaude
  it('callClaude 호출 시 expectJson:true 플래그 전달 확인', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({ verdict: 'pass', issues: [], disclaimer_added: false }),
    );

    const { factcheck } = await import('../factcheck');
    await factcheck({
      niche: 'HS',
      draft: {
        content_html: '<p>건강 정보</p>',
        title: '건강',
        keyword: '건강',
      },
    });

    expect(callClaude).toHaveBeenCalledWith(
      expect.objectContaining({ expectJson: true }),
    );
  });

  // Test 10: LLM returns hallucinated verdict — runtime guard throws
  it('LLM returns malformed verdict → throws', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(JSON.stringify({ verdict: 'unknown' }));

    const { factcheck } = await import('../factcheck');
    await expect(
      factcheck({ niche: 'HS', draft: { content_html: '<p>x</p>', title: 't', keyword: 'k' } }),
    ).rejects.toThrow(/unexpected verdict/);
  });

  // Test 9: userMessage payload includes niche/title/keyword/content_html
  it('callClaude userMessage JSON에 niche/title/keyword/content_html 4개 필드 모두 포함', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({ verdict: 'pass', issues: [], disclaimer_added: false }),
    );

    const { factcheck } = await import('../factcheck');
    const inputDraft = {
      content_html: '<p>의료 정보 본문</p>',
      title: '의료 가이드라인',
      keyword: '의료 가이드라인 2026',
    };

    await factcheck({ niche: 'HS', draft: inputDraft });

    const call = vi.mocked(callClaude).mock.calls[0][0];
    const parsed = JSON.parse(call.userMessage);
    expect(parsed.niche).toBe('HS');
    expect(parsed.title).toBe(inputDraft.title);
    expect(parsed.keyword).toBe(inputDraft.keyword);
    expect(parsed.content_html).toBe(inputDraft.content_html);
  });

  // 5/29 AdSense reject family: severity classification
  it('source 이슈 — critical 키워드 (출처 전무/URL 미제공/URL-데이터 불일치/발화자 미명시 등) 자동 라벨링', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        verdict: 'needs_revision',
        issues: [
          { type: 'source', description: '"10~15% 할인 사례 다수 확인" — 구체적 출처 전무.', suggested_fix: 'URL 추가' },
          { type: 'source', description: 'DART 확인 권고 시 URL 미제공.', suggested_fix: 'URL 추가' },
          { type: 'source', description: 'rt.molit.go.kr 사용. URL-데이터 불일치.', suggested_fix: 'stat.molit.go.kr 사용' },
          { type: 'source', description: '블록쿼트 발화자·소속·출처 전혀 없음.', suggested_fix: '출처 명시' },
          { type: 'source', description: '통계 인용 일부 누락 — minor.', suggested_fix: '보강' },
          { type: 'recency', description: '2024 정책 언급', suggested_fix: '2026 업데이트' },
        ],
      }),
    );

    const { factcheck } = await import('../factcheck');
    const result = await factcheck({
      niche: 'AS',
      draft: { content_html: '<p>x</p>', title: 't', keyword: 'k' },
    });

    const critical = result.issues!.filter((i) => i.severity === 'critical');
    expect(critical).toHaveLength(4);
    expect(critical.map((i) => i.description).join(' | ')).toMatch(/출처 전무/);
    expect(critical.map((i) => i.description).join(' | ')).toMatch(/URL 미제공/);
    expect(critical.map((i) => i.description).join(' | ')).toMatch(/URL-데이터 불일치/);
    expect(critical.map((i) => i.description).join(' | ')).toMatch(/출처 전혀 없/);

    const warn = result.issues!.filter((i) => i.severity === 'warn');
    expect(warn.length).toBe(2); // minor source + recency
  });

  it('LLM이 severity 명시 시 그대로 보존 (override X)', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        verdict: 'needs_revision',
        issues: [
          // LLM 이 일반 source 인데 critical 으로 직접 라벨링 시 그대로 유지
          { type: 'source', description: '일반 보강 권고', suggested_fix: 'x', severity: 'critical' },
        ],
      }),
    );

    const { factcheck } = await import('../factcheck');
    const result = await factcheck({
      niche: 'HS',
      draft: { content_html: '<p>x</p>', title: 't', keyword: 'k' },
    });

    expect(result.issues![0].severity).toBe('critical');
  });

  // consistency type tests
  it('consistency 이슈 — 수치 모순 → critical 자동 라벨링', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        verdict: 'needs_revision',
        issues: [
          { type: 'consistency', description: '동일 지표(전세가율) 수치 모순: 62%와 70% 혼재.', suggested_fix: '단일 수치로 통일' },
          { type: 'consistency', description: '같은 정책 시행일 날짜 모순: 2024-01과 2025-01 혼재.', suggested_fix: '정확한 날짜 확인 후 통일' },
          { type: 'consistency', description: '그래프 설명 단락 간 모순: 상승 vs 하락 방향 불일치.', suggested_fix: '단락 간 방향 통일' },
          { type: 'consistency', description: '비율 표현 미세 차이 (오타 가능성)', suggested_fix: '재검토' },
        ],
      }),
    );

    const { factcheck } = await import('../factcheck');
    const result = await factcheck({
      niche: 'AS',
      draft: { content_html: '<p>x</p>', title: 't', keyword: 'k' },
    });

    const critical = result.issues!.filter((i) => i.severity === 'critical');
    const warn = result.issues!.filter((i) => i.severity === 'warn');
    // 수치 모순, 날짜 모순, 단락 간 모순 → critical (3개)
    // 비율 차이 → warn (1개)
    expect(critical.length).toBe(3);
    expect(warn.length).toBe(1);
    expect(critical.map((i) => i.description).join(' | ')).toMatch(/수치 모순/);
    expect(critical.map((i) => i.description).join(' | ')).toMatch(/날짜 모순/);
    expect(critical.map((i) => i.description).join(' | ')).toMatch(/단락 간 모순/);
  });

  it('consistency 이슈 — critical 패턴 없으면 warn', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        verdict: 'needs_revision',
        issues: [
          { type: 'consistency', description: '표현 일관성 미흡: 같은 용어를 두 가지 이름으로 사용.', suggested_fix: '통일 권고' },
        ],
      }),
    );

    const { factcheck } = await import('../factcheck');
    const result = await factcheck({
      niche: 'HS',
      draft: { content_html: '<p>x</p>', title: 't', keyword: 'k' },
    });

    expect(result.issues![0].type).toBe('consistency');
    expect(result.issues![0].severity).toBe('warn');
  });

  it('consistency + source 혼재 — 각각 severity 독립 판정', async () => {
    const { callClaude } = await import('../llm');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        verdict: 'needs_revision',
        issues: [
          { type: 'source', description: '전체 출처 전무 — AI 생성 의심.', suggested_fix: 'URL 추가' },
          { type: 'consistency', description: '동일 지표 내부 수치 불일치: 두 단락 수치 상이.', suggested_fix: '수치 통일' },
          { type: 'recency', description: '2023년 정책 인용', suggested_fix: '현행 정책으로 교체' },
        ],
      }),
    );

    const { factcheck } = await import('../factcheck');
    const result = await factcheck({
      niche: 'AS',
      draft: { content_html: '<p>x</p>', title: 't', keyword: 'k' },
    });

    const issues = result.issues!;
    const sourceIssue = issues.find((i) => i.type === 'source')!;
    const consistencyIssue = issues.find((i) => i.type === 'consistency')!;
    const recencyIssue = issues.find((i) => i.type === 'recency')!;

    expect(sourceIssue.severity).toBe('critical');       // 출처 전무 → critical
    expect(consistencyIssue.severity).toBe('critical');  // 내부 수치 불일치 → critical
    expect(recencyIssue.severity).toBe('warn');          // recency → always warn
  });
});
