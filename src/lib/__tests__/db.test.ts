import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { publishedPosts } from "../schema";

function openTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "./drizzle/migrations" });
  return { sqlite, db };
}

describe("db pragmas (in-memory)", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    ({ sqlite } = openTestDb());
  });

  it("foreign_keys is enabled", () => {
    const row = sqlite.pragma("foreign_keys") as { foreign_keys: number }[];
    expect(row[0].foreign_keys).toBe(1);
  });

  it("busy_timeout is set to 5000ms", () => {
    const row = sqlite.pragma("busy_timeout") as { timeout: number }[];
    expect(row[0].timeout).toBe(5000);
  });

  it("synchronous is NORMAL (1)", () => {
    const row = sqlite.pragma("synchronous") as { synchronous: number }[];
    expect(row[0].synchronous).toBe(1);
  });
});

describe("db pragmas (file-based WAL)", () => {
  let tmpDir: string;
  let sqlite: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "blog-autopilot-test-"));
    sqlite = new Database(join(tmpDir, "test.db"));
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
  });

  afterEach(() => {
    sqlite.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("WAL journal mode is active on file-based DB", () => {
    const row = sqlite.pragma("journal_mode") as { journal_mode: string }[];
    expect(row[0].journal_mode).toBe("wal");
  });
});

describe("db migration idempotency", () => {
  it("migrate called twice does not throw", () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    expect(() => {
      migrate(db, { migrationsFolder: "./drizzle/migrations" });
      migrate(db, { migrationsFolder: "./drizzle/migrations" });
    }).not.toThrow();
  });
});

describe("db UNIQUE constraint enforcement", () => {
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    ({ db } = openTestDb());
  });

  const BASE = {
    niche: "HS" as const,
    keyword: "test",
    title: "Test",
    slug: "test-slug",
    platform: "wordpress_ws" as const,
    externalUrl: "https://example.com/1",
    publishedAt: "2026-06-20T00:00:00Z",
  };

  it("UNIQUE(niche, slug) blocks duplicate within same niche", () => {
    db.insert(publishedPosts).values({ ...BASE }).run();
    expect(() =>
      db.insert(publishedPosts).values({ ...BASE, keyword: "other", externalUrl: "https://example.com/2" }).run()
    ).toThrow();
  });

  it("same slug in different niche is allowed", () => {
    db.insert(publishedPosts).values({ ...BASE, niche: "HS", platform: "wordpress_ws" }).run();
    expect(() =>
      db.insert(publishedPosts).values({ ...BASE, niche: "TS", platform: "wordpress_ts", externalUrl: "https://example.com/2" }).run()
    ).not.toThrow();
  });

  it("UNIQUE(slug, platform) blocks same slug+platform across niches", () => {
    db.insert(publishedPosts).values({ ...BASE, niche: "HS" }).run();
    expect(() =>
      db.insert(publishedPosts).values({ ...BASE, niche: "AS", platform: "wordpress_ws", externalUrl: "https://example.com/2" }).run()
    ).toThrow();
  });
});

describe("db integrity_check", () => {
  it("fresh migrated DB passes integrity_check", () => {
    const { sqlite } = openTestDb();
    const result = sqlite.pragma("integrity_check") as { integrity_check: string }[];
    expect(result[0].integrity_check).toBe("ok");
  });

  it("fresh migrated DB passes quick_check", () => {
    const { sqlite } = openTestDb();
    const result = sqlite.pragma("quick_check") as { quick_check: string }[];
    expect(result[0].quick_check).toBe("ok");
  });
});
