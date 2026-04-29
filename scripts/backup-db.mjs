#!/usr/bin/env node

/**
 * SQLite DB 백업 스크립트
 *
 * 사용법:
 *   node scripts/backup-db.mjs                    # 기본 백업
 *   node scripts/backup-db.mjs --max-backups 10   # 최대 10개 유지
 *   node scripts/backup-db.mjs --output /tmp      # 출력 디렉토리 지정
 *
 * cron 예시 (매일 새벽 3시):
 *   0 3 * * * cd /app && node scripts/backup-db.mjs
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const args = process.argv.slice(2);

function getArg(name, defaultValue) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "blog.db");
const BACKUP_DIR = getArg("output", path.join(process.cwd(), "data", "backups"));
const MAX_BACKUPS = parseInt(getArg("max-backups", "7"), 10);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function formatDate(date) {
  return date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function backup() {
  // DB 파일 존재 확인
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[backup] DB not found: ${DB_PATH}`);
    process.exit(1);
  }

  ensureDir(BACKUP_DIR);

  const timestamp = formatDate(new Date());
  const backupFile = path.join(BACKUP_DIR, `content-${timestamp}.db`);

  // SQLite online backup (sqlite3 CLI의 .backup 명령 사용)
  // WAL 모드에서도 안전한 백업을 위해 sqlite3 CLI 사용 시도
  try {
    execSync(
      `sqlite3 "${DB_PATH}" ".backup '${backupFile}'"`,
      { stdio: "pipe" }
    );
    console.log(`[backup] SQLite backup completed: ${backupFile}`);
  } catch {
    // sqlite3 CLI 없으면 파일 복사 (WAL checkpoint 먼저)
    try {
      execSync(`sqlite3 "${DB_PATH}" "PRAGMA wal_checkpoint(TRUNCATE);"`, { stdio: "pipe" });
    } catch {
      // checkpoint 실패해도 계속 진행
    }
    fs.copyFileSync(DB_PATH, backupFile);
    console.log(`[backup] File copy backup completed: ${backupFile}`);
  }

  // 백업 파일 크기 표시
  const stats = fs.statSync(backupFile);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`[backup] Size: ${sizeMB} MB`);

  // 오래된 백업 정리
  cleanOldBackups();
}

function cleanOldBackups() {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("content-") && f.endsWith(".db"))
    .sort()
    .reverse(); // 최신 순

  if (files.length <= MAX_BACKUPS) return;

  const toDelete = files.slice(MAX_BACKUPS);
  for (const file of toDelete) {
    const filePath = path.join(BACKUP_DIR, file);
    fs.unlinkSync(filePath);
    console.log(`[backup] Deleted old backup: ${file}`);
  }

  console.log(`[backup] Kept ${MAX_BACKUPS} backups, deleted ${toDelete.length}`);
}

backup();
