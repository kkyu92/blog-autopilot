import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// POST /api/backup — DB 백업 실행
export async function POST() {
  const dbPath =
    process.env.DATABASE_PATH ||
    path.join(process.cwd(), "data", "content.db");

  if (!fs.existsSync(dbPath)) {
    return NextResponse.json({ error: "DB not found" }, { status: 404 });
  }

  const backupDir = path.join(path.dirname(dbPath), "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupFile = path.join(backupDir, `content-${timestamp}.db`);

  try {
    execSync(`sqlite3 "${dbPath}" ".backup '${backupFile}'"`, {
      stdio: "pipe",
    });
  } catch {
    try {
      execSync(`sqlite3 "${dbPath}" "PRAGMA wal_checkpoint(TRUNCATE);"`, {
        stdio: "pipe",
      });
    } catch {
      // continue
    }
    fs.copyFileSync(dbPath, backupFile);
  }

  const stats = fs.statSync(backupFile);

  return NextResponse.json({
    ok: true,
    file: path.basename(backupFile),
    sizeMB: (stats.size / 1024 / 1024).toFixed(2),
    timestamp,
  });
}

// GET /api/backup — 백업 목록 조회
export async function GET() {
  const dbPath =
    process.env.DATABASE_PATH ||
    path.join(process.cwd(), "data", "content.db");
  const backupDir = path.join(path.dirname(dbPath), "backups");

  if (!fs.existsSync(backupDir)) {
    return NextResponse.json({ backups: [] });
  }

  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("content-") && f.endsWith(".db"))
    .sort()
    .reverse()
    .map((f) => {
      const stats = fs.statSync(path.join(backupDir, f));
      return {
        file: f,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
        createdAt: stats.mtime.toISOString(),
      };
    });

  return NextResponse.json({ backups: files });
}
