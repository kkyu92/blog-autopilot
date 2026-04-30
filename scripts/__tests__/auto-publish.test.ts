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
vi.mock('../../src/lib/wordpress', () => ({
  publishScheduled: vi.fn(),
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
    const { publishScheduled: wpPublish } = await import('../../src/lib/wordpress');
    const { execFileSync } = await import('node:child_process');

    vi.mocked(pickQueue).mockResolvedValue([mockCandidate()]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });
    vi.mocked(callClaude).mockResolvedValue(mockDraftJson());
    vi.mocked(review).mockResolvedValue({ verdict: 'pass', score: 90 });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());
    vi.mocked(wpPublish).mockResolvedValue({
      externalId: 'wp-123',
      externalUrl: 'https://ws.example.com/test-slug',
      scheduledAt: '2026-04-27T00:00:00Z',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=WS', '--slot-count=1', '--mode=normal']);

    expect(code).toBe(0);

    const rows = testDb.select().from(publishedPosts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('published');
    expect(rows[0].niche).toBe('WS');
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
    const { publishScheduled: wpPublish } = await import('../../src/lib/wordpress');

    vi.mocked(pickQueue).mockResolvedValue([mockCandidate()]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });
    vi.mocked(callClaude).mockResolvedValue(mockDraftJson());
    // Editor: revision_needed first call, pass second.
    vi.mocked(review)
      .mockResolvedValueOnce({ verdict: 'revision_needed', score: 60, feedback: '더 길게' })
      .mockResolvedValueOnce({ verdict: 'pass', score: 88 });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());
    vi.mocked(wpPublish).mockResolvedValue({
      externalId: 'wp-456',
      externalUrl: 'https://ws.example.com/test-slug',
      scheduledAt: '2026-04-27T00:00:00Z',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=WS', '--slot-count=1']);

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
    const code = await runMain(['node', 'auto-publish.ts', '--niche=WS', '--slot-count=1']);

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
    expect(args[titleIdx + 1]).toContain('WS');
    expect(args[titleIdx + 1]).toContain('test keyword');
  });

  it('Scenario 4: dedup skip → 다음 keyword 진행 → published', async () => {
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: wpPublish } = await import('../../src/lib/wordpress');

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
    vi.mocked(wpPublish).mockResolvedValue({
      externalId: 'wp-789',
      externalUrl: 'https://ws.example.com/second-slug',
      scheduledAt: '2026-04-27T00:00:00Z',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=WS', '--slot-count=1']);

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
        { service: 'WP-WS', ok: false, reason: 'HTTP 401' },
        { service: 'Pexels', ok: true },
      ],
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=WS', '--slot-count=1']);

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
    const { publishScheduled: wpPublish } = await import('../../src/lib/wordpress');

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
    vi.mocked(wpPublish).mockResolvedValue({
      externalId: 'wp-ph',
      externalUrl: 'https://ws.example.com/test-slug',
      scheduledAt: '2026-04-27T00:00:00Z',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=WS', '--slot-count=1']);

    expect(code).toBe(0);

    // wpPublish was called with content_html containing the placeholder URL injected.
    const publishArgs = vi.mocked(wpPublish).mock.calls[0];
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
    const { publishScheduled: wpPublish } = await import('../../src/lib/wordpress');

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
    vi.mocked(wpPublish).mockResolvedValue({
      externalId: 'wp-retry',
      externalUrl: 'https://ws.example.com/test-slug',
      scheduledAt: '2026-04-27T00:00:00Z',
    });

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=WS', '--slot-count=1']);

    expect(code).toBe(0);
    expect(callClaude).toHaveBeenCalledTimes(2); // writer called twice (schema retry)

    // attempt 2 userMessage에 revision_feedback이 missing field를 언급해야 함
    const secondCall = vi.mocked(callClaude).mock.calls[1][0];
    const secondUserMsg = JSON.parse(secondCall.userMessage) as { revision_feedback?: string };
    expect(secondUserMsg.revision_feedback).toBeTruthy();
    expect(secondUserMsg.revision_feedback).toMatch(/title/i);

    const rows = testDb.select().from(publishedPosts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('published');
  });

  it('Scenario 7: batch slug 충돌 → -2 suffix, 두 글 모두 published', async () => {
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { review } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: wpPublish } = await import('../../src/lib/wordpress');

    vi.mocked(pickQueue).mockResolvedValue([
      mockCandidate({ keyword: 'kw-A' }),
      mockCandidate({ keyword: 'kw-B' }),
    ]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: '신규' });
    // Both writer calls return identical draft.slug='same-slug'.
    vi.mocked(callClaude).mockResolvedValue(mockDraftJson({ slug: 'same-slug' }));
    vi.mocked(review).mockResolvedValue({ verdict: 'pass', score: 90 });
    vi.mocked(fetchForSlots).mockResolvedValue(mockImageResults());
    vi.mocked(wpPublish).mockImplementation(async (_niche, post) => ({
      externalId: `wp-${post.slug}`,
      externalUrl: `https://ws.example.com/${post.slug}`,
      scheduledAt: '2026-04-27T00:00:00Z',
    }));

    const { runMain } = await import('../auto-publish');
    const code = await runMain(['node', 'auto-publish.ts', '--niche=WS', '--slot-count=2']);

    expect(code).toBe(0);

    const rows = testDb.select().from(publishedPosts).all().sort((a, b) => a.id - b.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].slug).toBe('same-slug');
    expect(rows[1].slug).toBe('same-slug-2');
    expect(rows[0].status).toBe('published');
    expect(rows[1].status).toBe('published');

    // wpPublish was invoked with the deduped slug for the 2nd post.
    expect(wpPublish).toHaveBeenCalledTimes(2);
    const secondCallPost = vi.mocked(wpPublish).mock.calls[1][1];
    expect(secondCallPost.slug).toBe('same-slug-2');
  });
});
