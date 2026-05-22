#!/usr/bin/env node
// GSC daily fetch — 3 blog (AS/HS/TS) 어제 데이터 누적.
// 무한 성장 Phase 2 (docs/roadmap-gsc-analytics.md).
//
// Usage: node --env-file=.env.local scripts/gsc-fetch.mjs [--days=1]
// - --days=N : 어제부터 N일치 fetch (default 1)
//
// Insert pattern: ON CONFLICT(date,blog,page,query) DO NOTHING (idempotent re-run safe).
// Storage: ctr ×10000 / position ×100 (integer precision).

import Database from 'better-sqlite3';
import { execSync } from 'node:child_process';

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN,
  DATABASE_PATH = './data/blog.db',
} = process.env;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error('Missing env: GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN');
  process.exit(1);
}

const BLOGS = [
  { code: 'AS', siteUrl: 'https://apt-signal.blogspot.com/' },
  { code: 'HS', siteUrl: 'https://health-signal.blogspot.com/' },
  { code: 'TS', siteUrl: 'https://trip-signal.blogspot.com/' },
];

const argDays = parseInt(
  process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? '1',
  10,
);

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function targetDates(n) {
  // 어제부터 n 일치 (KST 기준 — UTC+9 보정)
  const today = new Date();
  today.setUTCHours(today.getUTCHours() + 9);
  const dates = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(ymd(d));
  }
  return dates.reverse();
}

async function refreshAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: GOOGLE_REFRESH_TOKEN,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function gscSearchAnalytics(accessToken, siteUrl, body) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GSC query ${siteUrl}: ${res.status} ${await res.text()}`);
  return res.json();
}

function ensureMigrated() {
  // 첫 호출 시 drizzle 자동 migration (db.ts proxy 와 동일 패턴)
  // 본 script 는 raw better-sqlite3 사용 — migration 누락 시 수동 실행 trigger.
  try {
    execSync('pnpm drizzle-kit migrate', { stdio: 'pipe' });
  } catch (err) {
    console.warn('[gsc-fetch] migrate skipped:', err.message?.slice(0, 100));
  }
}

function normalizePage(url) {
  // https://apt-signal.blogspot.com/2026/05/foo.html → /2026/05/foo.html
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

async function fetchBlogDate(accessToken, blog, date) {
  const records = [];

  // 1) page + query 조합 (top-N) — 검색 쿼리 별 metrics
  try {
    const data = await gscSearchAnalytics(accessToken, blog.siteUrl, {
      startDate: date,
      endDate: date,
      dimensions: ['page', 'query'],
      rowLimit: 1000,
    });
    for (const row of data.rows ?? []) {
      const [page, query] = row.keys;
      records.push({
        date,
        blog: blog.code,
        page: normalizePage(page),
        query,
        impressions: row.impressions ?? 0,
        clicks: row.clicks ?? 0,
        ctr: Math.round((row.ctr ?? 0) * 10000),
        position: Math.round((row.position ?? 0) * 100),
      });
    }
  } catch (err) {
    console.warn(`  [${blog.code} ${date}] page+query fetch failed:`, err.message?.slice(0, 80));
  }

  // 2) page only (page 합계) — query="" 로 저장
  try {
    const data = await gscSearchAnalytics(accessToken, blog.siteUrl, {
      startDate: date,
      endDate: date,
      dimensions: ['page'],
      rowLimit: 1000,
    });
    for (const row of data.rows ?? []) {
      const [page] = row.keys;
      records.push({
        date,
        blog: blog.code,
        page: normalizePage(page),
        query: '',
        impressions: row.impressions ?? 0,
        clicks: row.clicks ?? 0,
        ctr: Math.round((row.ctr ?? 0) * 10000),
        position: Math.round((row.position ?? 0) * 100),
      });
    }
  } catch (err) {
    console.warn(`  [${blog.code} ${date}] page-only fetch failed:`, err.message?.slice(0, 80));
  }

  return records;
}

function insertRecords(db, records) {
  const stmt = db.prepare(
    `INSERT INTO gsc_metrics (date, blog, page, query, impressions, clicks, ctr, position)
     VALUES (@date, @blog, @page, @query, @impressions, @clicks, @ctr, @position)
     ON CONFLICT(date, blog, page, query) DO NOTHING`,
  );
  let inserted = 0;
  for (const r of records) {
    const result = stmt.run(r);
    if (result.changes > 0) inserted++;
  }
  return inserted;
}

async function main() {
  console.log('🔭 GSC daily fetch 시작...\n');
  ensureMigrated();

  const accessToken = await refreshAccessToken();
  console.log('✅ OAuth refresh 성공');

  const db = new Database(DATABASE_PATH);
  const dates = targetDates(argDays);
  console.log(`📅 대상 날짜: ${dates.join(', ')}\n`);

  let totalRecords = 0;
  let totalInserted = 0;

  for (const blog of BLOGS) {
    console.log(`📊 ${blog.code} (${blog.siteUrl})`);
    for (const date of dates) {
      const records = await fetchBlogDate(accessToken, blog, date);
      const inserted = insertRecords(db, records);
      totalRecords += records.length;
      totalInserted += inserted;
      console.log(`  ${date}: ${records.length} rows fetched, ${inserted} new`);
    }
  }

  db.close();
  console.log(`\n✅ 완료: ${totalInserted}/${totalRecords} new records`);
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
