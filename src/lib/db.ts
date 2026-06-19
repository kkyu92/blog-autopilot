import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

// 마이그레이션 폴더 — repo root 기준. cwd 의존 (Actions runner는 _work/repo/repo/).
const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle/migrations");

export function getDb() {
  if (!_db) {
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "blog.db");
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000"); // wait up to 5s on lock instead of failing immediately
    sqlite.pragma("synchronous = NORMAL"); // safe durability trade-off for WAL mode

    _db = drizzle(sqlite, { schema });

    // 첫 호출 시 자동 마이그레이션 (drizzle-kit migrate idempotent)
    if (fs.existsSync(MIGRATIONS_DIR)) {
      migrate(_db, { migrationsFolder: MIGRATIONS_DIR });
    }
  }
  return _db;
}

// Backward-compatible export
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
