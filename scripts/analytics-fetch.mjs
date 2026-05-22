#!/usr/bin/env node
// GA4 daily fetch — 3 property (AS/HS/TS) 어제 데이터 누적.
// 무한 성장 Phase 3 (docs/roadmap-gsc-analytics.md).
//
// Usage: node --env-file=.env.local scripts/analytics-fetch.mjs [--days=1]
//
// Prerequisite:
//   1. GA4_PROPERTY_ID_APT/HEALTH/TRIP (.env.local 박제됨, 2026-05-22)
//   2. GA_SERVICE_ACCOUNT_KEY_PATH (.env.local — 사용자 GCP JSON key 다운로드 후)
//   3. Service Account 가 3 GA4 property 의 Viewer 권한 보유
//
// Insert pattern: ON CONFLICT(date, blog, page_path) DO NOTHING (idempotent re-run safe).
// Storage: avg_session_duration_sec ×100 / bounce_rate ×10000 / engagement_rate ×10000.

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import Database from 'better-sqlite3';
import { execSync } from 'node:child_process';

const {
  GA4_PROPERTY_ID_APT,
  GA4_PROPERTY_ID_HEALTH,
  GA4_PROPERTY_ID_TRIP,
  GA_SERVICE_ACCOUNT_KEY_PATH,
  DATABASE_PATH = './data/blog.db',
} = process.env;

if (!GA4_PROPERTY_ID_APT || !GA4_PROPERTY_ID_HEALTH || !GA4_PROPERTY_ID_TRIP) {
  console.error('Missing env: GA4_PROPERTY_ID_APT/HEALTH/TRIP');
  process.exit(1);
}

if (!GA_SERVICE_ACCOUNT_KEY_PATH) {
  console.error('Missing env: GA_SERVICE_ACCOUNT_KEY_PATH (사용자 GCP JSON key 다운로드 후 .env.local 박제)');
  process.exit(1);
}

const BLOGS = [
  { code: 'AS', propertyId: GA4_PROPERTY_ID_APT },
  { code: 'HS', propertyId: GA4_PROPERTY_ID_HEALTH },
  { code: 'TS', propertyId: GA4_PROPERTY_ID_TRIP },
];

const argDays = parseInt(
  process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? '1',
  10,
);

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function targetDates(n) {
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

function ensureMigrated() {
  try {
    execSync('pnpm drizzle-kit migrate', { stdio: 'pipe' });
  } catch (err) {
    console.warn('[analytics-fetch] migrate skipped:', err.message?.slice(0, 100));
  }
}

const analyticsClient = new BetaAnalyticsDataClient({
  keyFilename: GA_SERVICE_ACCOUNT_KEY_PATH,
});

async function fetchPropertyDate(blog, date) {
  const records = [];
  try {
    const [response] = await analyticsClient.runReport({
      property: `properties/${blog.propertyId}`,
      dateRanges: [{ startDate: date, endDate: date }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'sessions' },
        { name: 'averageSessionDuration' },
        { name: 'bounceRate' },
        { name: 'engagementRate' },
      ],
      limit: 1000,
    });

    for (const row of response.rows ?? []) {
      const pagePath = row.dimensionValues?.[0]?.value ?? '/';
      const [pv, sess, avgDur, bounce, eng] = (row.metricValues ?? []).map(
        (m) => parseFloat(m.value ?? '0'),
      );
      records.push({
        date,
        blog: blog.code,
        pagePath,
        pageviews: Math.round(pv),
        sessions: Math.round(sess),
        avgSessionDurationSec: Math.round(avgDur * 100),
        bounceRate: Math.round(bounce * 10000),
        engagementRate: Math.round(eng * 10000),
      });
    }
  } catch (err) {
    console.warn(`  [${blog.code} ${date}] fetch failed:`, err.message?.slice(0, 100));
  }
  return records;
}

function insertRecords(db, records) {
  const stmt = db.prepare(
    `INSERT INTO page_metrics (date, blog, page_path, pageviews, sessions, avg_session_duration_sec, bounce_rate, engagement_rate)
     VALUES (@date, @blog, @pagePath, @pageviews, @sessions, @avgSessionDurationSec, @bounceRate, @engagementRate)
     ON CONFLICT(date, blog, page_path) DO NOTHING`,
  );
  let inserted = 0;
  for (const r of records) {
    const result = stmt.run(r);
    if (result.changes > 0) inserted++;
  }
  return inserted;
}

async function main() {
  console.log('📊 GA4 daily fetch 시작...\n');
  ensureMigrated();

  const db = new Database(DATABASE_PATH);
  const dates = targetDates(argDays);
  console.log(`📅 대상 날짜: ${dates.join(', ')}\n`);

  let totalRecords = 0;
  let totalInserted = 0;

  for (const blog of BLOGS) {
    console.log(`📊 ${blog.code} (property: ${blog.propertyId})`);
    for (const date of dates) {
      const records = await fetchPropertyDate(blog, date);
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
