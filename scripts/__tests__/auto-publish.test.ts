import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { publishedPosts } from '../../src/lib/schema';

// ── PR5 lib mocks ────────────────────────────────────────────────────────────

vi.mock('../../src/lib/healthcheck', () => ({
  runAll: vi.fn(),
}));
vi.mock('../../src/lib/trends', () => ({
  pickQueue: vi.fn(),
}));
vi.mock('../../src/lib/fixed-topics', () => ({
  getFixedTopicKeyword: vi.fn(async () => null),
}));
vi.mock('../../src/lib/dedup', () => ({
  checkAndResolve: vi.fn(),
}));
vi.mock('../../src/lib/llm', () => ({
  callClaude: vi.fn(),
  // F1'-a: scripts/auto-publish.ts:968이 cron 종료 시 호출. test 환경에선 zero-stats 반환.
  getClaudeCallStats: vi.fn(() => ({ count: 0, firstCallAt: null, uptimeMs: null })),
}));
vi.mock('../../src/lib/editor', () => ({
  review: vi.fn(),
}));
vi.mock('../../src/lib/images', () => ({
  fetchForSlots: vi.fn(),
}));
vi.mock('../../src/lib/blogger', () => ({
  publishScheduled: vi.fn(),
}));

// Mock execFileSync so dispatch* helpers don't actually invoke gh.
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

// Mock disk-write fs surface so log/backup don't touch ~/logs and ~/backups during tests.
// node:fs is also imported as 'fs' by lib/db.ts; use a single hoisted mock that exposes BOTH
// the named ESM exports AND a default object — vitest module graph asks for both shapes.
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    appendFileSync: vi.fn(),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

// Mock getDb to return our per-test in-memory DB.
let testDb: ReturnType<typeof makeDb>;
vi.mock('../../src/lib/db', () => ({
  getDb: () => testDb,
}));

// ── helpers ──────────────────────────────────────────────────────────────────

function makeDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: './drizzle/migrations' });
  return db;
}

interface DraftOverrides {
  title?: string;
  slug?: string;
  content_html?: string;
  word_count?: number;
  meta_description?: string;
  keyword?: string;
}

function mockDraftJson(overrides: DraftOverrides = {}): string {
  return JSON.stringify({
    title: overrides.title ?? 'Test Title',
    slug: overrides.slug ?? 'test-slug',
    meta_description: overrides.meta_description ?? 'Test meta',
    content_html:
      overrides.content_html ??
      '<p>intro</p><!-- IMAGE_SLOT_1 --><p>body</p><!-- IMAGE_SLOT_2 --><p>outro</p>',
    image_slots: [
      { slot_id: 'IMAGE_SLOT_1', search_query: 'q1', alt_text: 'a1' },
      { slot_id: 'IMAGE_SLOT_2', search_query: 'q2', alt_text: 'a2' },
    ],
    chart_slots: [],
    faq_schema: [],
    word_count: overrides.word_count ?? 1500,
    keyword: overrides.keyword ?? 'test keyword',
    category: '뉴스',
    labels: ['태그1', '태그2'],
  });
}

interface CandidateOverrides {
  keyword?: string;
  category?: string;
  evergreen?: boolean;
  search_volume_trend?: '급상승' | '상승' | '안정';
  priority_score?: number;
}

function mockCandidate(overrides: CandidateOverrides = {}) {
  return {
    keyword: overrides.keyword ?? 'test keyword',
    category: overrides.category ?? '뉴스',
    content_type: '정보형' as const,
    search_volume_trend: overrides.search_volume_trend ?? ('상승' as const),
    priority_score: overrides.priority_score ?? 80,
    evergreen: overrides.evergreen ?? false,
    image_keywords: ['img1', 'img2'],
  };
}

function mockImageResults() {
  return [
    {
      slot_id: 'IMAGE_SLOT_1',
      image_url: 'https://example.com/img1.jpg',
      photographer: 'p1',
      source: 'pexels' as const,
      alt_text: 'a1',
    },
    {
      slot_id: 'IMAGE_SLOT_2',
      image_url: 'https://example.com/img2.jpg',
      photographer: 'p2',
      source: 'pixabay' as const,
      alt_text: 'a2',
    },
  ];
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('auto-publish.ts integration (7 시나리오)', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    testDb = makeDb();
    // HOME guard — even though fs.mkdir/copyFile/append are mocked, set HOME for safety
    process.env.HOME = '/tmp/test-home';
    // Avoid dispatch issue token branch (default both unset → silent skip)
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_REPOSITORY;

    const { runAll } = await import('../../src/lib/healthcheck');
    vi.mocked(runAll).mockResolvedValue({ allPassed: true, results: [] });
  });

  it('Scenario 1: golden path — 1 niche WS + 1 슬롯 → published', async () => {
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: bloggerPublish } = await import('../../src/lib/blogger');
    const { execFileSync } = await import('node:child_process');

    vi.mocked(pickQueue).mockResolvedValue([mockCandidate()]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });
    vi.mocked(callClaude).mockResolvedValue(mockDraftJson());
    vi.mocked(review).mockResolvedValue({ verdict: 'pass', score: 90 });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());
    vi.mocked(bloggerPublish).mockResolvedValue({
      externalId: 'wp-123',
      externalUrl: 'https://ws.example.com/test-slug',
      scheduledAt: '2026-04-27T00:00:00Z',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=HS', '--slot-count=1', '--mode=normal']);

    expect(code).toBe(0);

    const rows = testDb.select().from(publishedPosts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('published');
    expect(rows[0].niche).toBe('HS');
    expect(rows[0].slug).toBe('test-slug');
    expect(rows[0].externalUrl).toBe('https://ws.example.com/test-slug');
    expect(rows[0].scheduledSlot).toBeTruthy();

    // No GitHub Issue dispatch on golden path.
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('Scenario 2: editor reject 1회 + 2회차 pass → published', async () => {
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: bloggerPublish } = await import('../../src/lib/blogger');

    vi.mocked(pickQueue).mockResolvedValue([mockCandidate()]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });
    vi.mocked(callClaude).mockResolvedValue(mockDraftJson());
    // Editor: revision_needed first call, pass second.
    vi.mocked(review)
      .mockResolvedValueOnce({ verdict: 'revision_needed', score: 60, feedback: '더 길게' })
      .mockResolvedValueOnce({ verdict: 'pass', score: 88 });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());
    vi.mocked(bloggerPublish).mockResolvedValue({
      externalId: 'wp-456',
      externalUrl: 'https://ws.example.com/test-slug',
      scheduledAt: '2026-04-27T00:00:00Z',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=HS', '--slot-count=1']);

    expect(code).toBe(0);
    expect(callClaude).toHaveBeenCalledTimes(2); // writer called twice
    expect(review).toHaveBeenCalledTimes(2);

    const rows = testDb.select().from(publishedPosts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('published');
  });

  it('Scenario 3: editor reject 2회 → 폐기 (failed row + dispatch issue)', async () => {
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { execFileSync } = await import('node:child_process');

    // GITHUB_TOKEN set so dispatch actually invokes execFileSync.
    process.env.GITHUB_TOKEN = 'test-token';

    vi.mocked(pickQueue).mockResolvedValue([mockCandidate()]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });
    vi.mocked(callClaude).mockResolvedValue(mockDraftJson());
    // Editor: revision_needed both attempts.
    vi.mocked(review).mockResolvedValue({
      verdict: 'revision_needed',
      score: 50,
      feedback: '품질 미달',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=HS', '--slot-count=1']);

    // 1 slot, 1 failure → discard ratio 100% → exit 1
    expect(code).toBe(1);

    // recordFailure: pre-draft path (writer threw before draft escaped) → no DB INSERT, but dispatch fires.
    const rows = testDb.select().from(publishedPosts).all();
    expect(rows).toHaveLength(0);

    // execFileSync called for `gh issue create`
    expect(execFileSync).toHaveBeenCalled();
    const ghCall = vi.mocked(execFileSync).mock.calls[0];
    expect(ghCall[0]).toBe('gh');
    expect(ghCall[1]).toContain('issue');
    expect(ghCall[1]).toContain('create');
    // Title contains niche + keyword.
    const args = ghCall[1] as string[];
    const titleIdx = args.indexOf('--title');
    expect(args[titleIdx + 1]).toContain('HS');
    expect(args[titleIdx + 1]).toContain('test keyword');
  });

  it('Scenario 4: dedup skip → 다음 keyword 진행 → published', async () => {
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: bloggerPublish } = await import('../../src/lib/blogger');

    vi.mocked(pickQueue).mockResolvedValue([
      mockCandidate({ keyword: 'first-kw' }),
      mockCandidate({ keyword: 'second-kw' }),
    ]);
    vi.mocked(checkAndResolve)
      .mockResolvedValueOnce({ action: 'skip', reason: '24h dup' })
      .mockResolvedValueOnce({ action: 'pass', reason: '신규' });
    vi.mocked(callClaude).mockResolvedValue(mockDraftJson({ slug: 'second-slug' }));
    vi.mocked(review).mockResolvedValue({ verdict: 'pass', score: 90 });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());
    vi.mocked(bloggerPublish).mockResolvedValue({
      externalId: 'wp-789',
      externalUrl: 'https://ws.example.com/second-slug',
      scheduledAt: '2026-04-27T00:00:00Z',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=HS', '--slot-count=1']);

    expect(code).toBe(0);

    // Writer was invoked exactly once (for 2nd keyword); 1st keyword skipped before writer.
    expect(callClaude).toHaveBeenCalledTimes(1);
    const writerCall = vi.mocked(callClaude).mock.calls[0][0];
    expect(writerCall.userMessage).toContain('second-kw');
    expect(writerCall.userMessage).not.toContain('first-kw');

    const rows = testDb.select().from(publishedPosts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].keyword).toBe('second-kw');
    expect(rows[0].status).toBe('published');
  });

  it('Scenario 5: healthcheck fail → exit 2, no DB writes, pickQueue skipped', async () => {
    const { runAll } = await import('../../src/lib/healthcheck');
    const { pickQueue } = await import('../../src/lib/trends');

    vi.mocked(runAll).mockResolvedValue({
      allPassed: false,
      results: [
        { service: 'Blogger-HS', ok: false, reason: 'HTTP 401' },
        { service: 'Pexels', ok: true },
      ],
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=HS', '--slot-count=1']);

    expect(code).toBe(2);
    expect(pickQueue).not.toHaveBeenCalled();

    const rows = testDb.select().from(publishedPosts).all();
    expect(rows).toHaveLength(0);
  });

  it('Scenario 6: 모든 이미지 fail → placeholder 발행', async () => {
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: bloggerPublish } = await import('../../src/lib/blogger');

    const placeholderUrl = 'https://via.placeholder.com/1200x630.png?text=No+Image';

    vi.mocked(pickQueue).mockResolvedValue([mockCandidate()]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });
    vi.mocked(callClaude).mockResolvedValue(mockDraftJson());
    vi.mocked(review).mockResolvedValue({ verdict: 'pass', score: 90 });
    // All images fall back to placeholder.
    vi.mocked(fetchForSlots).mockResolvedValue([
      {
        slot_id: 'IMAGE_SLOT_1',
        image_url: placeholderUrl,
        photographer: null,
        source: 'placeholder',
        alt_text: 'a1',
      },
      {
        slot_id: 'IMAGE_SLOT_2',
        image_url: placeholderUrl,
        photographer: null,
        source: 'placeholder',
        alt_text: 'a2',
      },
    ]);
    vi.mocked(bloggerPublish).mockResolvedValue({
      externalId: 'wp-ph',
      externalUrl: 'https://ws.example.com/test-slug',
      scheduledAt: '2026-04-27T00:00:00Z',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=HS', '--slot-count=1']);

    expect(code).toBe(0);

    // bloggerPublish was called with content containing the placeholder URL injected.
    const publishArgs = vi.mocked(bloggerPublish).mock.calls[0];
    const post = publishArgs[1];
    expect(post.content).toContain(placeholderUrl);
    // Both markers replaced — no <!-- IMAGE_SLOT_N --> stragglers.
    expect(post.content).not.toMatch(/<!-- IMAGE_SLOT_\d+ -->/);

    const rows = testDb.select().from(publishedPosts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('published');
  });

  it('Scenario 8 (F2-A regression): writer JSON missing required field → retry with revision feedback → attempt 2 published', async () => {
    // RC-1 회귀 테스트: 4/30 cron run 25124826827에서 WS 자가면역 글이 LLM JSON drift로 title 필드 누락 →
    // 기존 코드는 attempt 1에서 즉시 throw (attempt 2 진입 못 함) → 영구 실패.
    // F2-A fix: missing field를 revision_feedback으로 LLM에 재요청 후 attempt 2 진입.
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: bloggerPublish } = await import('../../src/lib/blogger');

    vi.mocked(pickQueue).mockResolvedValue([mockCandidate()]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });

    // Writer attempt 1: valid JSON but title 필드 누락.
    // Writer attempt 2: 정상 JSON (LLM이 revision_feedback 반영).
    const missingTitleJson = (() => {
      const parsed = JSON.parse(mockDraftJson()) as Record<string, unknown>;
      delete parsed.title;
      return JSON.stringify(parsed);
    })();

    vi.mocked(callClaude)
      .mockResolvedValueOnce(missingTitleJson)
      .mockResolvedValueOnce(mockDraftJson());
    vi.mocked(review).mockResolvedValue({ verdict: 'pass', score: 90 });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());
    vi.mocked(bloggerPublish).mockResolvedValue({
      externalId: 'wp-retry',
      externalUrl: 'https://ws.example.com/test-slug',
      scheduledAt: '2026-04-27T00:00:00Z',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=HS', '--slot-count=1']);

    expect(code).toBe(0);
    expect(callClaude).toHaveBeenCalledTimes(2); // writer called twice (schema retry)

    // attempt 2 userMessage에 revision_feedback이 missing field를 언급해야 함
    const secondCall = vi.mocked(callClaude).mock.calls[1][0];
    const secondUserMsg = JSON.parse(secondCall.userMessage) as { revision_feedback?: string };
    expect(secondUserMsg.revision_feedback).toBeTruthy();
    expect(secondUserMsg.revision_feedback).toMatch(/title/i);
    // F2-A 강화 (5/1 evidence): wording에 [CRITICAL FINAL] prefix + "Begin response with" 강제 포함
    expect(secondUserMsg.revision_feedback).toMatch(/CRITICAL SCHEMA FAILURE/);
    expect(secondUserMsg.revision_feedback).toMatch(/Begin response with/);

    const rows = testDb.select().from(publishedPosts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('published');
  });

  it('Scenario 9 (disclaimer auto-apply 5/2): editor disclaimer_inserted=true → publish가 modified_html 반영', async () => {
    // 5/2 8건 spot-check evidence: WS·AS 매번 일부 슬롯 disclaimer 누락 (5/1 3건, 5/2 2건).
    // factcheck → editor.modified_html 메커니즘은 동작하지만 caller(writeAndReview)가 무시 →
    // publish는 원본 content_html 사용 → disclaimer 누락 publish.
    // Fix: writeAndReview가 review.modified_html을 draftWithImages.content_html에 반영.
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: bloggerPublish } = await import('../../src/lib/blogger');

    vi.mocked(pickQueue).mockResolvedValue([mockCandidate()]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });
    vi.mocked(callClaude).mockResolvedValue(mockDraftJson());

    const modifiedHtml = '<p>intro</p><img src="img1"/><p>body</p><p>⚠️ 면책: 정보 제공 목적</p>';
    vi.mocked(review).mockResolvedValue({
      verdict: 'pass',
      score: 90,
      disclaimer_inserted: true,
      modified_html: modifiedHtml,
    });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());
    vi.mocked(bloggerPublish).mockResolvedValue({
      externalId: 'wp-disc',
      externalUrl: 'https://ws.example.com/test-slug',
      scheduledAt: '2026-04-27T00:00:00Z',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=HS', '--slot-count=1']);

    expect(code).toBe(0);
    // publishScheduled가 modified_html을 받아야 함 (원본 아닌)
    expect(bloggerPublish).toHaveBeenCalledTimes(1);
    const publishedPost = vi.mocked(bloggerPublish).mock.calls[0][1];
    // d4418db: JSON-LD schema 자동 inject — modifiedHtml 본문 포함 + JSON-LD 추가
    expect(publishedPost.content).toContain(modifiedHtml);
    expect(publishedPost.content).toContain('⚠️ 면책');
    expect(publishedPost.content).toContain('application/ld+json');
  });

  it('Scenario 10 (5/25 RC): attempt 1 schema OK + revision_needed soft-pass-able + attempt 2 schema fail → salvage attempt 1', async () => {
    // 5/25 TS 가고시마 evidence: attempt 1 = schema OK + editor revision_needed score=79 (≥ SOFT_PASS_THRESHOLD 70),
    // attempt 2 = writer LLM drift (5 fields missing) → 기존 코드는 throw 가 soft-pass fallback 앞에서 발생해 영구 실패.
    // Fix: attempt 2 schema fail 일 때 lastDraft + score≥70 면 attempt 1 draft 로 soft-pass salvage.
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: bloggerPublish } = await import('../../src/lib/blogger');

    vi.mocked(pickQueue).mockResolvedValue([mockCandidate({ keyword: '일본 가고시마 여행 코스' })]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });

    // attempt 1: 정상 JSON (schema OK). attempt 2: title 누락 (schema fail).
    const missingTitleJson = (() => {
      const parsed = JSON.parse(mockDraftJson()) as Record<string, unknown>;
      delete parsed.title;
      return JSON.stringify(parsed);
    })();
    vi.mocked(callClaude)
      .mockResolvedValueOnce(mockDraftJson({ slug: 'gagoshima-trip' }))
      .mockResolvedValueOnce(missingTitleJson);

    // attempt 1 review: revision_needed score=79 (soft-pass-able). attempt 2 는 review 호출 못 함 (writer schema fail).
    vi.mocked(review).mockResolvedValueOnce({
      verdict: 'revision_needed',
      score: 79,
      feedback: '3개 항목 수정 필요',
    });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());
    vi.mocked(bloggerPublish).mockResolvedValue({
      externalId: 'bg-salvage',
      externalUrl: 'https://ts.example.com/gagoshima-trip',
      scheduledAt: '2026-05-25T00:00:00Z',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=TS', '--slot-count=1']);

    expect(code).toBe(0);
    expect(callClaude).toHaveBeenCalledTimes(2); // writer 2번 (attempt 1 + attempt 2)
    expect(bloggerPublish).toHaveBeenCalledTimes(1); // attempt 1 draft 로 publish 성공

    const rows = testDb.select().from(publishedPosts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('published');
    expect(rows[0].slug).toBe('gagoshima-trip');
  });

  it('Scenario 10b (5/25 RC guard): attempt 2 schema fail + attempt 1 score < SOFT_PASS_THRESHOLD → 영구 실패 유지', async () => {
    // salvage 분기 가드: attempt 1 score 가 SOFT_PASS_THRESHOLD 미만이면 기존 동작 (throw → 폐기) 유지.
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: bloggerPublish } = await import('../../src/lib/blogger');

    vi.mocked(pickQueue).mockResolvedValue([mockCandidate()]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });

    const missingTitleJson = (() => {
      const parsed = JSON.parse(mockDraftJson()) as Record<string, unknown>;
      delete parsed.title;
      return JSON.stringify(parsed);
    })();
    vi.mocked(callClaude)
      .mockResolvedValueOnce(mockDraftJson())
      .mockResolvedValueOnce(missingTitleJson);

    // attempt 1 review score=60 (< 70 SOFT_PASS_THRESHOLD)
    vi.mocked(review).mockResolvedValueOnce({
      verdict: 'revision_needed',
      score: 60,
      feedback: '품질 미달',
    });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=HS', '--slot-count=1']);

    expect(code).toBe(1); // 100% discard → exit 1 (의도된 동작)
    expect(bloggerPublish).not.toHaveBeenCalled(); // publish 안 함

    // recordFailure pre-draft path: writer threw before draft escaped → no DB row (Scenario 3 와 동일).
    const rows = testDb.select().from(publishedPosts).all();
    expect(rows).toHaveLength(0);
  });

  // 5/29 AdSense reject family: factcheck CRITICAL 차단 시나리오
  it('Scenario 11 (5/29 AdSense): attempt 2 모두 revision_needed + score≥70 + factcheck_critical_count>0 → soft-pass 차단, throw editor_reject_factcheck_critical', async () => {
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: bloggerPublish } = await import('../../src/lib/blogger');

    vi.mocked(pickQueue).mockResolvedValue([mockCandidate({ keyword: '미분양 아파트' })]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });

    // writer attempt 1 + 2 둘 다 schema OK 정상 JSON
    vi.mocked(callClaude)
      .mockResolvedValueOnce(mockDraftJson({ slug: 'misbunyang-1' }))
      .mockResolvedValueOnce(mockDraftJson({ slug: 'misbunyang-1' }));

    // review 두 번 모두 revision_needed score=82 (≥70 SOFT_PASS) + factcheck_critical_count=3
    vi.mocked(review).mockResolvedValue({
      verdict: 'revision_needed',
      score: 82,
      feedback: '[CRITICAL FACTCHECK] 구체적 출처 전무; URL 미제공; 발화자 미명시',
      factcheck_critical_count: 3,
    });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=AS', '--slot-count=1']);

    expect(code).toBe(1); // 100% discard
    expect(bloggerPublish).not.toHaveBeenCalled(); // soft-pass 차단됨

    // recordFailure pre-draft path: writeAndReview throw 가 draft 반환 전에 발생 → no DB row
    // (Scenario 3/10b 와 동일 패턴). failure dispatch 는 GH_TOKEN 없어서 test 환경 skip.
    const rows = testDb.select().from(publishedPosts).all();
    expect(rows).toHaveLength(0);
  });

  it('Scenario 11b (5/29 AdSense guard): attempt 2 schema fail + attempt 1 score≥70 + factcheck_critical_count>0 → salvage 차단', async () => {
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: bloggerPublish } = await import('../../src/lib/blogger');

    vi.mocked(pickQueue).mockResolvedValue([mockCandidate({ keyword: 'AS 분양' })]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });

    const missingTitleJson = (() => {
      const parsed = JSON.parse(mockDraftJson()) as Record<string, unknown>;
      delete parsed.title;
      return JSON.stringify(parsed);
    })();
    vi.mocked(callClaude)
      .mockResolvedValueOnce(mockDraftJson({ slug: 'as-salvage-block' }))
      .mockResolvedValueOnce(missingTitleJson);

    // attempt 1 review: soft-pass-able score=82 지만 critical_count=2 → salvage 차단
    vi.mocked(review).mockResolvedValueOnce({
      verdict: 'revision_needed',
      score: 82,
      feedback: '[CRITICAL FACTCHECK] 구체적 출처 전무; URL-데이터 불일치',
      factcheck_critical_count: 2,
    });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=AS', '--slot-count=1']);

    expect(code).toBe(1);
    expect(bloggerPublish).not.toHaveBeenCalled();
  });

  it('Scenario 11c (5/29 AdSense baseline): factcheck_critical_count=0 + score≥70 → 기존 soft-pass 정책 유지', async () => {
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: bloggerPublish } = await import('../../src/lib/blogger');

    vi.mocked(pickQueue).mockResolvedValue([mockCandidate({ keyword: 'baseline kw' })]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });
    vi.mocked(callClaude).mockResolvedValue(mockDraftJson({ slug: 'baseline-softpass' }));
    vi.mocked(review).mockResolvedValue({
      verdict: 'revision_needed',
      score: 75,
      feedback: '마이크로 스타일 권고',
      // factcheck_critical_count 미설정 = 0 으로 처리
    });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());
    vi.mocked(bloggerPublish).mockResolvedValue({
      externalId: 'bg-baseline',
      externalUrl: 'https://ws.example.com/baseline',
      scheduledAt: '2026-05-29T00:00:00Z',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=HS', '--slot-count=1']);

    expect(code).toBe(0); // soft-pass 발행됨
    expect(bloggerPublish).toHaveBeenCalledTimes(1);
  });

  it('Scenario 7: batch slug 충돌 → -2 suffix, 두 글 모두 published', async () => {
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: bloggerPublish } = await import('../../src/lib/blogger');

    vi.mocked(pickQueue).mockResolvedValue([
      mockCandidate({ keyword: 'kw-A' }),
      mockCandidate({ keyword: 'kw-B' }),
    ]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });
    // Both writer calls return identical draft.slug='same-slug'.
    vi.mocked(callClaude).mockResolvedValue(mockDraftJson({ slug: 'same-slug' }));
    vi.mocked(review).mockResolvedValue({ verdict: 'pass', score: 90 });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());
    let callCount = 0;
    vi.mocked(bloggerPublish).mockImplementation(async () => {
      callCount += 1;
      return {
        externalId: `bg-${callCount}`,
        externalUrl: `https://ws.example.com/post-${callCount}`,
        scheduledAt: '2026-04-27T00:00:00Z',
      };
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=HS', '--slot-count=2']);

    expect(code).toBe(0);

    const rows = testDb.select().from(publishedPosts).all().sort((a, b) => a.id - b.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].slug).toBe('same-slug');
    expect(rows[1].slug).toBe('same-slug-2');
    expect(rows[0].status).toBe('published');
    expect(rows[1].status).toBe('published');

    // bloggerPublish 2회 호출 확인 (slug 충돌 회피는 DB INSERT 측 책임 — Blogger API에는 slug 필드 없음)
    expect(bloggerPublish).toHaveBeenCalledTimes(2);
  });
});
