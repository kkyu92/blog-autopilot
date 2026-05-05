import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { publishedPosts } from "../schema";

const BASE_POST = {
  niche: "HS" as const,
  keyword: "foo",
  title: "title1",
  slug: "a-b",
  platform: "wordpress_ws" as const,
  externalUrl: "https://example.com/1",
  publishedAt: "2026-04-26T00:00:00Z",
};

describe("schema 0001_pr5_schema_boost", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite);
    migrate(db, { migrationsFolder: "./drizzle/migrations" });
  });

  it("UNIQUE(niche, slug) blocks same niche+slug duplicate", () => {
    db.insert(publishedPosts).values({ ...BASE_POST }).run();
    expect(() =>
      db
        .insert(publishedPosts)
        .values({
          ...BASE_POST,
          keyword: "foo2",
          title: "title2",
          externalUrl: "https://example.com/2",
        })
        .run(),
    ).toThrow();
  });

  it("UNIQUE(niche, slug) allows same slug across different niches", () => {
    db.insert(publishedPosts).values({ ...BASE_POST, niche: "HS", platform: "wordpress_ws" }).run();
    expect(() =>
      db
        .insert(publishedPosts)
        .values({
          ...BASE_POST,
          niche: "TS",
          platform: "wordpress_ts",
          externalUrl: "https://example.com/2",
        })
        .run(),
    ).not.toThrow();
  });

  it('status defaults to "published"', () => {
    db.insert(publishedPosts).values({ ...BASE_POST }).run();
    const row = sqlite.prepare("SELECT status FROM published_posts WHERE slug = ?").get("a-b") as {
      status: string;
    };
    expect(row.status).toBe("published");
  });

  // NOTE: drizzle-kit for SQLite does NOT generate CHECK constraints for text
  // enums in ALTER TABLE ADD COLUMN statements. The enum is a TypeScript-level
  // constraint only. This test verifies that the column exists and accepts valid
  // values; runtime CHECK enforcement is not available in this SQLite setup.
  it("status column accepts valid enum values", () => {
    expect(() => {
      sqlite
        .prepare(
          `INSERT INTO published_posts (niche, keyword, title, slug, platform, external_url, published_at, status)
           VALUES ('HS', 'k', 't', 's1', 'wordpress_ws', 'https://e.com/3', '2026-04-26T00:00:00Z', 'failed')`,
        )
        .run();
    }).not.toThrow();
    const row = sqlite
      .prepare("SELECT status FROM published_posts WHERE slug = ?")
      .get("s1") as { status: string };
    expect(row.status).toBe("failed");
  });
});
