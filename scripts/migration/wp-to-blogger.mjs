#!/usr/bin/env node
/**
 * WP → Blogger 일괄 마이그레이션 스크립트 (5/5 cut-over용)
 *
 * 기존 WP.com 발행분 (TS 28 + WS 27)을 신규 Blogger 도메인 (travel-signal/health-signal)에 재발행 +
 * DB published_posts 신규 INSERT (legacy WP 행은 그대로 유지 — 이력 박제).
 *
 * 모드:
 *   --dry-run (default) — fetch + transform 결과만 log, 실제 발행 X
 *   --apply             — 실제 발행 + DB INSERT
 *
 * Usage:
 *   node --env-file=.env.local scripts/migration/wp-to-blogger.mjs [--dry-run | --apply]
 *
 * Env:
 *   WORDPRESS_TS_ACCESS_TOKEN, WORDPRESS_TS_BLOG_ID
 *   WORDPRESS_WS_ACCESS_TOKEN, WORDPRESS_WS_BLOG_ID
 *   GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   GOOGLE_BLOG_ID_TRAVEL  (TS 신규 — travel-signal.blogspot.com)
 *   GOOGLE_BLOG_ID_HEALTH  (WS 신규 — health-signal.blogspot.com)
 *   DATABASE_PATH          (data/blog.db default)
 */

import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const DRY_RUN = !process.argv.includes('--apply');
const RATE_LIMIT_MS = 1000; // Blogger API 1 QPS

const SOURCES = [
  {
    niche: 'TS',
    sourcePlatform: 'wordpress_ts',
    targetPlatform: 'blogger_travel',
    wpToken: process.env.WORDPRESS_TS_ACCESS_TOKEN,
    wpBlogId: process.env.WORDPRESS_TS_BLOG_ID,
    targetBlogId: process.env.GOOGLE_BLOG_ID_TRAVEL,
  },
  {
    niche: 'WS',
    sourcePlatform: 'wordpress_ws',
    targetPlatform: 'blogger_health',
    wpToken: process.env.WORDPRESS_WS_ACCESS_TOKEN,
    wpBlogId: process.env.WORDPRESS_WS_BLOG_ID,
    targetBlogId: process.env.GOOGLE_BLOG_ID_HEALTH,
  },
];

function validateEnv() {
  const missing = [];
  if (!process.env.GOOGLE_REFRESH_TOKEN) missing.push('GOOGLE_REFRESH_TOKEN');
  if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  for (const src of SOURCES) {
    if (!src.wpToken) missing.push(`WORDPRESS_${src.niche}_ACCESS_TOKEN`);
    if (!src.wpBlogId) missing.push(`WORDPRESS_${src.niche}_BLOG_ID`);
    if (!DRY_RUN && !src.targetBlogId) missing.push(`GOOGLE_BLOG_ID_${src.niche === 'TS' ? 'TRAVEL' : 'HEALTH'}`);
  }
  if (missing.length) {
    console.error('❌ Missing env:', missing.join(', '));
    process.exit(1);
  }
}

async function getBloggerAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Blogger token refresh fail: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function fetchWPPosts(src) {
  const posts = [];
  let offset = 0;
  while (true) {
    const url = `https://public-api.wordpress.com/rest/v1.1/sites/${src.wpBlogId}/posts?context=edit&number=100&offset=${offset}&status=publish`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${src.wpToken}` } });
    if (!res.ok) {
      throw new Error(`WP fetch fail (${src.niche}): HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    for (const p of data.posts || []) {
      posts.push({
        id: p.ID,
        title: p.title,
        slug: p.slug,
        content: p.content || '',
        date: p.date,
        categories: Object.keys(p.categories || {}),
        tags: Object.keys(p.tags || {}),
      });
    }
    if ((data.posts || []).length < 100) break;
    offset += 100;
  }
  return posts;
}

async function publishToBlogger({ accessToken, blogId, title, html, labels }) {
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        kind: 'blogger#post',
        title,
        content: html,
        labels: labels || [],
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Blogger publish fail: ${res.status}: ${err}`);
  }
  const data = await res.json();
  return { id: data.id, url: data.url, published: data.published };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getDb() {
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'blog.db');
  return new Database(dbPath);
}

function lookupNicheKeyword(db, sourcePlatform, sourcePostId) {
  // Find matching legacy row by platform + external_post_id (string equality)
  const row = db
    .prepare(
      "SELECT niche, keyword, category, slug, title, scheduled_slot, quality_score, metadata FROM published_posts WHERE platform = ? AND external_post_id = ? LIMIT 1",
    )
    .get(sourcePlatform, String(sourcePostId));
  return row || null;
}

function insertNewRow(db, fields) {
  db.prepare(
    `INSERT INTO published_posts
      (niche, category, keyword, title, slug, platform, external_post_id, external_url, published_at, scheduled_slot, quality_score, metadata, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')`,
  ).run(
    fields.niche,
    fields.category,
    fields.keyword,
    fields.title,
    fields.slug,
    fields.platform,
    fields.externalPostId,
    fields.externalUrl,
    fields.publishedAt,
    fields.scheduledSlot,
    fields.qualityScore,
    fields.metadata,
  );
}

async function main() {
  console.log(`mode: ${DRY_RUN ? 'dry-run' : 'apply'}`);
  validateEnv();

  const accessToken = DRY_RUN ? null : await getBloggerAccessToken();
  const db = DRY_RUN ? null : getDb();

  const log = {
    started_at: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'apply',
    sources: [],
  };

  for (const src of SOURCES) {
    console.log(`\n━━━ ${src.niche} (${src.sourcePlatform} → ${src.targetPlatform}) ━━━`);
    const wpPosts = await fetchWPPosts(src);
    console.log(`  WP fetched: ${wpPosts.length} posts`);

    const srcLog = {
      niche: src.niche,
      sourcePlatform: src.sourcePlatform,
      targetPlatform: src.targetPlatform,
      fetched: wpPosts.length,
      published: [],
      skipped: [],
      failed: [],
    };

    for (const wp of wpPosts) {
      const labels = [...wp.categories, ...wp.tags].slice(0, 20);
      const item = {
        wp_id: wp.id,
        title: wp.title,
        slug: wp.slug,
        wp_published: wp.date,
        labels,
      };

      if (DRY_RUN) {
        console.log(`  [dry-run] ${wp.id}: "${wp.title}" (slug=${wp.slug}, labels=${labels.length})`);
        srcLog.published.push(item);
        continue;
      }

      try {
        // Lookup legacy DB row to copy niche/keyword/category/scheduled_slot/quality_score/metadata
        const legacy = lookupNicheKeyword(db, src.sourcePlatform, wp.id);
        if (!legacy) {
          console.warn(`  ⚠️  ${wp.id}: no legacy DB row found — skipping (manual review)`);
          srcLog.skipped.push({ ...item, reason: 'no legacy DB row' });
          continue;
        }

        // Publish to Blogger
        const pub = await publishToBlogger({
          accessToken,
          blogId: src.targetBlogId,
          title: wp.title,
          html: wp.content,
          labels,
        });

        // INSERT new published_posts row (slug 충돌 회피 — 신규 platform이라 idx_pp_slug_platform OK,
        // idx_pp_niche_slug 충돌 가능 → suffix 처리)
        let newSlug = legacy.slug;
        const existing = db
          .prepare('SELECT 1 FROM published_posts WHERE niche = ? AND slug = ?')
          .get(legacy.niche, newSlug);
        if (existing) {
          newSlug = `${legacy.slug}-migrated`;
        }

        insertNewRow(db, {
          niche: legacy.niche,
          category: legacy.category,
          keyword: legacy.keyword,
          title: wp.title,
          slug: newSlug,
          platform: src.targetPlatform,
          externalPostId: String(pub.id),
          externalUrl: pub.url,
          publishedAt: pub.published || new Date().toISOString(),
          scheduledSlot: legacy.scheduled_slot,
          qualityScore: legacy.quality_score,
          metadata: legacy.metadata,
        });

        console.log(`  ✓ ${wp.id} → ${pub.id} (${pub.url})`);
        srcLog.published.push({ ...item, blogger_id: pub.id, blogger_url: pub.url, new_slug: newSlug });

        await sleep(RATE_LIMIT_MS);
      } catch (e) {
        console.error(`  ✗ ${wp.id}: ${e.message}`);
        srcLog.failed.push({ ...item, error: e.message });
      }
    }

    log.sources.push(srcLog);
    console.log(
      `  result: ${srcLog.published.length} published, ${srcLog.skipped.length} skipped, ${srcLog.failed.length} failed`,
    );
  }

  log.ended_at = new Date().toISOString();

  // Write log
  const logDir = path.join(process.cwd(), 'docs', 'migration');
  mkdirSync(logDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(logDir, `${today}-batch.json`);
  writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`\nlog → ${logPath}`);

  if (db) db.close();
}

main().catch((e) => {
  console.error('❌ Fatal:', e);
  process.exit(1);
});
