#!/usr/bin/env node
/**
 * AS 라벨 통합 스크립트 — 21개 fragmented 라벨 → 6개 통합
 *
 * AdSense 사이트 주제 통일성 어필 + thin content 신호 해소.
 * Blogger API v3 posts.patch 로 labels 일괄 정정 + DB published_posts.category 동기화.
 *
 * 모드:
 *   --dry-run (default) — 매핑 결과만 출력, API 호출 X
 *   --apply             — 실제 Blogger 라벨 변경 + DB UPDATE
 *
 * Usage:
 *   node --env-file=.env.local scripts/migration/relabel-as.mjs [--dry-run | --apply]
 *
 * Env:
 *   GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   GOOGLE_BLOG_ID_APT     (= AS 도메인 apt-signal)
 *   DATABASE_PATH          (data/blog.db default)
 */

import Database from 'better-sqlite3';
import path from 'node:path';

const DRY_RUN = !process.argv.includes('--apply');
const RATE_LIMIT_MS = 1500;

const LABEL_MAP = {
  '청약': ['청약', '청약정보', '아파트 청약', '청약·부동산', '아파트 분양'],
  '재건축·재개발': ['재건축', '재건축·재개발', '재개발·재건축'],
  '세금·절세': ['부동산 세금', '부동산세금', '부동산·세금', '세금·절세', '부동산 절세'],
  '시장분석': ['부동산', '부동산 시장분석', '부동산 투자 분석', '부동산 트렌드'],
  '정책·법령': ['부동산정책', '임대·분양'],
  '대출·전세': ['부동산/대출 정보', '부동산/전세'],
};

function buildReverseMap() {
  const r = new Map();
  for (const [target, sources] of Object.entries(LABEL_MAP)) {
    for (const src of sources) r.set(src, target);
  }
  return r;
}

function validateEnv() {
  const missing = [];
  if (!process.env.GOOGLE_REFRESH_TOKEN) missing.push('GOOGLE_REFRESH_TOKEN');
  if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  if (!DRY_RUN && !process.env.GOOGLE_BLOG_ID_APT) missing.push('GOOGLE_BLOG_ID_APT');
  if (missing.length) {
    console.error('❌ Missing env:', missing.join(', '));
    process.exit(1);
  }
}

async function preflightSmoke() {
  if (DRY_RUN) return;
  const token = await getAccessToken();
  const blogId = process.env.GOOGLE_BLOG_ID_APT;
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${blogId}?fields=id,name`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    console.error(`❌ Preflight fail: blogId=${blogId} HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const blog = await res.json();
  console.log(`✓ Preflight OK: ${blog.name} (${blog.id})`);
}

async function getAccessToken() {
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
  if (!res.ok) throw new Error(`Token refresh fail: HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function patchLabels(blogId, postId, labels, accessToken) {
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${postId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ labels }),
    },
  );
  if (!res.ok) {
    throw new Error(`Patch fail postId=${postId}: HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getDb() {
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'blog.db');
  return new Database(dbPath);
}

async function main() {
  console.log(`\n=== AS 라벨 통합 ${DRY_RUN ? '[dry-run]' : '[APPLY]'} ===\n`);

  validateEnv();
  await preflightSmoke();

  const reverse = buildReverseMap();
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, external_post_id, category, title
     FROM published_posts
     WHERE niche='AS' AND status='published' AND platform='blogger_as'
     ORDER BY id`,
  ).all();

  console.log(`총 ${rows.length}건 대상\n`);

  const plan = [];
  const unmapped = [];

  for (const row of rows) {
    const target = reverse.get(row.category);
    if (!target) {
      unmapped.push(row);
      continue;
    }
    plan.push({ ...row, target });
  }

  console.log('## 매핑 결과 (현재 → 통합)\n');
  const grouped = {};
  for (const p of plan) {
    if (!grouped[p.target]) grouped[p.target] = [];
    grouped[p.target].push(p);
  }
  for (const [target, items] of Object.entries(grouped)) {
    console.log(`  ${target} (${items.length}건):`);
    const seen = new Set();
    for (const it of items) {
      if (!seen.has(it.category)) {
        const cnt = items.filter((x) => x.category === it.category).length;
        console.log(`    - ${it.category} → ${target} (${cnt}건)`);
        seen.add(it.category);
      }
    }
  }

  if (unmapped.length) {
    console.log(`\n⚠️  매핑 안 된 카테고리 ${unmapped.length}건:`);
    for (const u of unmapped) console.log(`  id=${u.id} category="${u.category}" title="${u.title.slice(0, 40)}"`);
    console.log('  → LABEL_MAP 재정의 필요. 종료.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] 실제 변경 없음. --apply 로 실행하면 Blogger + DB 적용.');
    return;
  }

  // ── APPLY 모드 ──────────────────────────────────────────────
  const blogId = process.env.GOOGLE_BLOG_ID_APT;
  const updateDbStmt = db.prepare('UPDATE published_posts SET category = ? WHERE id = ?');

  console.log(`\n## APPLY: ${plan.length}건 처리 (${RATE_LIMIT_MS}ms/post 간격)\n`);

  let ok = 0, fail = 0;
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    if (!p.external_post_id) {
      console.log(`  [${i + 1}/${plan.length}] id=${p.id} SKIP — external_post_id 없음`);
      fail++;
      continue;
    }
    try {
      // 매 호출 직전 fresh token (60분+ batch RC 메모리 박제)
      const token = await getAccessToken();
      await patchLabels(blogId, p.external_post_id, [p.target], token);
      updateDbStmt.run(p.target, p.id);
      console.log(`  [${i + 1}/${plan.length}] id=${p.id} "${p.category}" → "${p.target}" ✓`);
      ok++;
    } catch (e) {
      console.log(`  [${i + 1}/${plan.length}] id=${p.id} FAIL: ${e.message}`);
      fail++;
    }
    if (i < plan.length - 1) await sleep(RATE_LIMIT_MS);
  }

  console.log(`\n=== 완료: ${ok} OK / ${fail} FAIL ===\n`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('❌ Unexpected error:', e);
  process.exit(1);
});
