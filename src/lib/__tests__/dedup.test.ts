import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { checkAndResolve } from "../dedup";
import { publishedPosts } from "../schema";

// ── helpers ─────────────────────────────────────────────────────────────────

function daysAgoISO(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

const BASE = {
  niche: "WS" as const,
  keyword: "테스트 키워드",
  title: "기존 글 제목",
  slug: "test-slug",
  platform: "wordpress_ws" as const,
  externalUrl: "https://example.com/1",
  publishedAt: daysAgoISO(0),
};

// ── setup ────────────────────────────────────────────────────────────────────

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle>;

beforeEach(() => {
  sqlite = new Database(":memory:");
  db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
});

// ── tests ────────────────────────────────────────────────────────────────────

describe("dedup.checkAndResolve", () => {
  // ── L1: slug 영구 차단 ───────────────────────────────────────────────────

  it("L1: same slug same niche → slug_variant (foo → foo-2)", async () => {
    db.insert(publishedPosts).values({ ...BASE, slug: "foo" }).run();

    const result = await checkAndResolve(db, {
      niche: "WS",
      keyword: "다른 키워드",
      evergreen: false,
      proposedSlug: "foo",
    });

    expect(result.action).toBe("slug_variant");
    expect(result.suggested_slug).toBe("foo-2");
  });

  it("L1: same slug different niche → pass (cross-niche is OK)", async () => {
    db
      .insert(publishedPosts)
      .values({ ...BASE, niche: "WS", slug: "foo", platform: "wordpress_ws" })
      .run();

    const result = await checkAndResolve(db, {
      niche: "TS",
      keyword: "다른 키워드",
      evergreen: false,
      proposedSlug: "foo",
    });

    // No keyword duplicate either — should pass
    expect(result.action).toBe("pass");
  });

  it("L1: slug variant 10회 충돌 (foo ~ foo-10) → skip", async () => {
    // Insert foo, foo-2 … foo-10 (10 slugs total)
    const slugs = ["foo", ...Array.from({ length: 9 }, (_, i) => `foo-${i + 2}`)];
    for (let i = 0; i < slugs.length; i++) {
      db
        .insert(publishedPosts)
        .values({
          ...BASE,
          slug: slugs[i],
          externalUrl: `https://example.com/${i + 1}`,
          keyword: `키워드-${i}`,
        })
        .run();
    }

    const result = await checkAndResolve(db, {
      niche: "WS",
      keyword: "신규 키워드",
      evergreen: false,
      proposedSlug: "foo",
    });

    expect(result.action).toBe("skip");
    expect(result.reason).toMatch(/10회/);
  });

  // ── L4: evergreen 90d strict ─────────────────────────────────────────────

  it("L4: evergreen + 80d ago → skip", async () => {
    db
      .insert(publishedPosts)
      .values({
        ...BASE,
        publishedAt: daysAgoISO(80),
        metadata: JSON.stringify({ evergreen: true }),
      })
      .run();

    const result = await checkAndResolve(db, {
      niche: "WS",
      keyword: BASE.keyword,
      evergreen: true,
    });

    expect(result.action).toBe("skip");
  });

  it("L4: evergreen + 95d ago (> 90d) → pass", async () => {
    db
      .insert(publishedPosts)
      .values({
        ...BASE,
        publishedAt: daysAgoISO(95),
        metadata: JSON.stringify({ evergreen: true }),
      })
      .run();

    const result = await checkAndResolve(db, {
      niche: "WS",
      keyword: BASE.keyword,
      evergreen: true,
    });

    expect(result.action).toBe("pass");
  });

  // ── L2: 24h strict ───────────────────────────────────────────────────────

  it("L2: 24h strict — 급상승 trend 무시하고 skip", async () => {
    db
      .insert(publishedPosts)
      .values({ ...BASE, publishedAt: daysAgoISO(0) }) // just now
      .run();

    const result = await checkAndResolve(db, {
      niche: "WS",
      keyword: BASE.keyword,
      evergreen: false,
      trend: { search_volume_trend: "급상승", priority_score: 95 },
    });

    expect(result.action).toBe("skip");
  });

  it("L2: 23h ago (within 24h) → skip regardless of trend", async () => {
    const twentyThreeHoursAgo = new Date(
      Date.now() - 23 * 3600 * 1000,
    ).toISOString();
    db
      .insert(publishedPosts)
      .values({ ...BASE, publishedAt: twentyThreeHoursAgo })
      .run();

    const result = await checkAndResolve(db, {
      niche: "WS",
      keyword: BASE.keyword,
      evergreen: false,
      trend: { search_volume_trend: "급상승", priority_score: 100 },
    });

    expect(result.action).toBe("skip");
  });

  // ── L3: 7d loose ─────────────────────────────────────────────────────────

  it("L3 follow_up: 3d ago + 급상승 + score≥80 → follow_up + different content_type", async () => {
    db
      .insert(publishedPosts)
      .values({
        ...BASE,
        publishedAt: daysAgoISO(3),
        metadata: JSON.stringify({ content_type: "정보형" }),
      })
      .run();

    const result = await checkAndResolve(db, {
      niche: "WS",
      keyword: BASE.keyword,
      evergreen: false,
      trend: { search_volume_trend: "급상승", priority_score: 85 },
    });

    expect(result.action).toBe("follow_up");
    expect(result.suggested_content_type).toBeDefined();
    expect(result.suggested_content_type).not.toBe("정보형");
  });

  it("L3 skip: 3d ago + 상승 (not 급상승) → skip", async () => {
    db
      .insert(publishedPosts)
      .values({ ...BASE, publishedAt: daysAgoISO(3) })
      .run();

    const result = await checkAndResolve(db, {
      niche: "WS",
      keyword: BASE.keyword,
      evergreen: false,
      trend: { search_volume_trend: "상승", priority_score: 70 },
    });

    expect(result.action).toBe("skip");
  });

  it("L3 skip: 3d ago + 급상승 but score < 80 → skip", async () => {
    db
      .insert(publishedPosts)
      .values({ ...BASE, publishedAt: daysAgoISO(3) })
      .run();

    const result = await checkAndResolve(db, {
      niche: "WS",
      keyword: BASE.keyword,
      evergreen: false,
      trend: { search_volume_trend: "급상승", priority_score: 75 },
    });

    expect(result.action).toBe("skip");
  });

  // ── L1 priority over L4 ──────────────────────────────────────────────────

  it("L1 + L4: same slug + evergreen → L1 wins (slug_variant)", async () => {
    db
      .insert(publishedPosts)
      .values({
        ...BASE,
        slug: "foo",
        publishedAt: daysAgoISO(10),
        metadata: JSON.stringify({ evergreen: true }),
      })
      .run();

    const result = await checkAndResolve(db, {
      niche: "WS",
      keyword: BASE.keyword,
      evergreen: true,
      proposedSlug: "foo",
    });

    expect(result.action).toBe("slug_variant");
    expect(result.suggested_slug).toBe("foo-2");
  });

  // ── >7d pass ─────────────────────────────────────────────────────────────

  it(">7d: 8d ago, no evergreen → pass", async () => {
    db
      .insert(publishedPosts)
      .values({ ...BASE, publishedAt: daysAgoISO(8) })
      .run();

    const result = await checkAndResolve(db, {
      niche: "WS",
      keyword: BASE.keyword,
      evergreen: false,
    });

    expect(result.action).toBe("pass");
  });

  // ── 신규 키워드 ──────────────────────────────────────────────────────────

  it("신규 키워드: no existing rows → pass", async () => {
    const result = await checkAndResolve(db, {
      niche: "WS",
      keyword: "완전 새로운 키워드",
      evergreen: false,
    });

    expect(result.action).toBe("pass");
    expect(result.reason).toMatch(/신규/);
  });
});
