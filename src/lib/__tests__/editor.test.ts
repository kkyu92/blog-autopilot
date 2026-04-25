import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mocks — must be at top level for vi.mock hoisting
vi.mock('../llm', () => ({
  callClaude: vi.fn(),
}));

vi.mock('../factcheck', () => ({
  factcheck: vi.fn(),
}));

/** Minimal valid draft that passes quantitative checks */
function validDraft() {
  return {
    title: '건강한 생활습관 가이드',
    content_html: '<p>본문 내용</p>',
    word_count: 1200,
    image_slots: [
      { slot_id: 'img-1', search_query: '건강', alt_text: '건강 이미지' },
      { slot_id: 'img-2', search_query: '운동', alt_text: '운동 이미지' },
    ],
    faq: [{ q: 'FAQ 질문', a: 'FAQ 답변' }],
    keyword: '건강한 생활습관',
  };
}

describe('editor.review', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Test 1: Pass path — all checks pass
  it('word_count ≥ 1200 + image_slots ≥ 2 + factcheck pass + LLM pass → verdict=pass, score from LLM', async () => {
    const { callClaude } = await import('../llm');
    const { factcheck } = await import('../factcheck');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        status: 'approved',
        quality_score: 88,
        final_html: '<p>polished</p>',
        final_meta: { title: 't', meta_description: 'd', slug: 's', labels: ['l'] },
      }),
    );
    vi.mocked(factcheck).mockResolvedValue({ verdict: 'pass' });

    const { review } = await import('../editor');
    const result = await review({ draft: validDraft(), niche: 'WS' });

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(88);
  });

  // Test 2: word_count < 1200 → revision_needed, feedback contains '1200'
  it('word_count < 1200 → revision_needed + feedback mentions 1200', async () => {
    const { callClaude } = await import('../llm');
    const { factcheck } = await import('../factcheck');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        status: 'approved',
        quality_score: 85,
        final_html: '<p>polished</p>',
        final_meta: { title: 't', meta_description: 'd', slug: 's', labels: ['l'] },
      }),
    );
    vi.mocked(factcheck).mockResolvedValue({ verdict: 'pass' });

    const { review } = await import('../editor');
    const draft = { ...validDraft(), word_count: 800 };
    const result = await review({ draft, niche: 'TS' });

    expect(result.verdict).toBe('revision_needed');
    expect(result.feedback).toContain('1200');
  });

  // Test 3: image_slots < 2 → revision_needed, feedback mentions image_slots
  it('image_slots < 2 → revision_needed + feedback mentions image_slots', async () => {
    const { callClaude } = await import('../llm');
    const { factcheck } = await import('../factcheck');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        status: 'approved',
        quality_score: 85,
        final_html: '<p>polished</p>',
        final_meta: { title: 't', meta_description: 'd', slug: 's', labels: ['l'] },
      }),
    );
    vi.mocked(factcheck).mockResolvedValue({ verdict: 'pass' });

    const { review } = await import('../editor');
    const draft = { ...validDraft(), image_slots: [{ slot_id: 'img-1', search_query: 'test', alt_text: 'test' }] };
    const result = await review({ draft, niche: 'TS' });

    expect(result.verdict).toBe('revision_needed');
    expect(result.feedback).toMatch(/image_slots/i);
  });

  // Test 4: WS niche → factcheck called once with niche='WS'
  it('WS niche → factcheck 호출 (niche=WS)', async () => {
    const { callClaude } = await import('../llm');
    const { factcheck } = await import('../factcheck');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        status: 'approved',
        quality_score: 85,
        final_html: '<p>polished</p>',
        final_meta: { title: 't', meta_description: 'd', slug: 's', labels: ['l'] },
      }),
    );
    vi.mocked(factcheck).mockResolvedValue({ verdict: 'pass' });

    const { review } = await import('../editor');
    await review({ draft: validDraft(), niche: 'WS' });

    expect(factcheck).toHaveBeenCalledTimes(1);
    expect(vi.mocked(factcheck).mock.calls[0][0].niche).toBe('WS');
  });

  // Test 5: AS niche → factcheck called once with niche='AS'
  it('AS niche → factcheck 호출 (niche=AS)', async () => {
    const { callClaude } = await import('../llm');
    const { factcheck } = await import('../factcheck');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        status: 'approved',
        quality_score: 85,
        final_html: '<p>polished</p>',
        final_meta: { title: 't', meta_description: 'd', slug: 's', labels: ['l'] },
      }),
    );
    vi.mocked(factcheck).mockResolvedValue({ verdict: 'pass' });

    const { review } = await import('../editor');
    await review({ draft: validDraft(), niche: 'AS' });

    expect(factcheck).toHaveBeenCalledTimes(1);
    expect(vi.mocked(factcheck).mock.calls[0][0].niche).toBe('AS');
  });

  // Test 6: TS niche → factcheck NOT called
  it('TS niche → factcheck 호출 안 함', async () => {
    const { callClaude } = await import('../llm');
    const { factcheck } = await import('../factcheck');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        status: 'approved',
        quality_score: 85,
        final_html: '<p>polished</p>',
        final_meta: { title: 't', meta_description: 'd', slug: 's', labels: ['l'] },
      }),
    );

    const { review } = await import('../editor');
    await review({ draft: validDraft(), niche: 'TS' });

    expect(factcheck).not.toHaveBeenCalled();
  });

  // Test 7: factcheck needs_revision → editor revision_needed with factcheck issues in feedback
  it('factcheck needs_revision → editor revision_needed, feedback에 factcheck issues 포함', async () => {
    const { callClaude } = await import('../llm');
    const { factcheck } = await import('../factcheck');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        status: 'approved',
        quality_score: 85,
        final_html: '<p>polished</p>',
        final_meta: { title: 't', meta_description: 'd', slug: 's', labels: ['l'] },
      }),
    );
    vi.mocked(factcheck).mockResolvedValue({
      verdict: 'needs_revision',
      issues: [
        { type: 'source' as const, description: '출처 없음', suggested_fix: '출처 추가 필요' },
      ],
    });

    const { review } = await import('../editor');
    const result = await review({ draft: validDraft(), niche: 'WS' });

    expect(result.verdict).toBe('revision_needed');
    expect(result.feedback).toContain('출처 없음');
  });

  // Test 8: factcheck disclaimer_added → editor returns modified_html + disclaimer_inserted=true (no input mutation)
  it('factcheck disclaimer_added=true → editor result에 disclaimer_inserted=true + modified_html 반환 (input 불변)', async () => {
    const { callClaude } = await import('../llm');
    const { factcheck } = await import('../factcheck');
    const modifiedHtml = '<p>본문</p><p>이 글은 정보 제공 목적이며 전문 상담을 대체하지 않습니다.</p>';
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        status: 'approved',
        quality_score: 85,
        final_html: '<p>polished</p>',
        final_meta: { title: 't', meta_description: 'd', slug: 's', labels: ['l'] },
      }),
    );
    vi.mocked(factcheck).mockResolvedValue({
      verdict: 'pass',
      disclaimer_added: true,
      modified_html: modifiedHtml,
    });

    const { review } = await import('../editor');
    const draft = validDraft();
    const originalHtml = draft.content_html;
    const result = await review({ draft, niche: 'AS' });

    expect(result.disclaimer_inserted).toBe(true);
    expect(result.modified_html).toBe(modifiedHtml);
    // Input must NOT be mutated
    expect(draft.content_html).toBe(originalHtml);
  });

  // Test 9: LLM revision_needed → editor revision_needed even if quantitative passes
  it('LLM revision_needed → editor revision_needed (정량 통과해도)', async () => {
    const { callClaude } = await import('../llm');
    const { factcheck } = await import('../factcheck');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        status: 'revision_needed',
        quality_score: 55,
        revision_notes: 'CTA가 누락되었습니다',
      }),
    );
    vi.mocked(factcheck).mockResolvedValue({ verdict: 'pass' });

    const { review } = await import('../editor');
    const result = await review({ draft: validDraft(), niche: 'WS' });

    expect(result.verdict).toBe('revision_needed');
    expect(result.feedback).toContain('CTA가 누락되었습니다');
  });

  // Test 10: LLM returns unexpected status → throws with runtime guard
  it('LLM 예상치 못한 status → 런타임 가드 에러 throw', async () => {
    const { callClaude } = await import('../llm');
    const { factcheck } = await import('../factcheck');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({ status: 'unknown' }),
    );
    vi.mocked(factcheck).mockResolvedValue({ verdict: 'pass' });

    const { review } = await import('../editor');
    await expect(review({ draft: validDraft(), niche: 'TS' })).rejects.toThrow(
      /unexpected status/,
    );
  });

  // Test 11: Multiple issues combined — word_count + image_slots + factcheck
  it('복합 실패: word_count 부족 + image_slots 부족 + factcheck needs_revision → 3개 이슈 feedback에 포함', async () => {
    const { callClaude } = await import('../llm');
    const { factcheck } = await import('../factcheck');
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        status: 'approved',
        quality_score: 85,
        final_html: '<p>polished</p>',
        final_meta: { title: 't', meta_description: 'd', slug: 's', labels: ['l'] },
      }),
    );
    vi.mocked(factcheck).mockResolvedValue({
      verdict: 'needs_revision',
      issues: [
        { type: 'disclaimer' as const, description: '면책 문구 누락', suggested_fix: '면책 문구 추가' },
      ],
    });

    const { review } = await import('../editor');
    const draft = { ...validDraft(), word_count: 500, image_slots: [] };
    const result = await review({ draft, niche: 'WS' });

    expect(result.verdict).toBe('revision_needed');
    expect(result.feedback).toContain('1200');
    expect(result.feedback).toMatch(/image_slots/i);
    expect(result.feedback).toContain('면책 문구 누락');
  });

  // Test 12: Score defaults — 60 on revision (no LLM quality_score), 85 on pass (no LLM quality_score)
  it('LLM quality_score 없을 때 기본값: revision_needed → 60, pass → 85', async () => {
    const { callClaude } = await import('../llm');
    const { factcheck } = await import('../factcheck');

    // revision case: no quality_score field
    vi.mocked(callClaude).mockResolvedValueOnce(
      JSON.stringify({ status: 'revision_needed', revision_notes: '품질 미달' }),
    );
    vi.mocked(factcheck).mockResolvedValue({ verdict: 'pass' });

    const { review } = await import('../editor');
    const revisionResult = await review({ draft: validDraft(), niche: 'TS' });
    expect(revisionResult.verdict).toBe('revision_needed');
    expect(revisionResult.score).toBe(60);

    vi.resetAllMocks();

    // pass case: no quality_score field
    vi.mocked(callClaude).mockResolvedValueOnce(
      JSON.stringify({ status: 'approved' }),
    );
    vi.mocked(factcheck).mockResolvedValue({ verdict: 'pass' });

    const passResult = await review({ draft: validDraft(), niche: 'TS' });
    expect(passResult.verdict).toBe('pass');
    expect(passResult.score).toBe(85);
  });

  // Test 13: LLM status='approved' → final_html and final_meta forwarded in result
  it('LLM status=approved → EditorReviewResult에 final_html + final_meta 포함', async () => {
    const { callClaude } = await import('../llm');
    const { factcheck } = await import('../factcheck');
    const finalHtml = '<article><p>최종 편집된 내용입니다.</p></article>';
    const finalMeta = {
      title: '건강한 생활습관 완전 가이드',
      meta_description: '건강한 생활습관을 위한 10가지 핵심 전략',
      slug: 'healthy-lifestyle-guide',
      labels: ['건강', '생활습관', '웰빙'],
    };
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({
        status: 'approved',
        quality_score: 92,
        final_html: finalHtml,
        final_meta: finalMeta,
      }),
    );
    vi.mocked(factcheck).mockResolvedValue({ verdict: 'pass' });

    const { review } = await import('../editor');
    const result = await review({ draft: validDraft(), niche: 'TS' });

    expect(result.verdict).toBe('pass');
    expect(result.score).toBe(92);
    expect(result.final_html).toBe(finalHtml);
    expect(result.final_meta).toEqual(finalMeta);
  });
});
