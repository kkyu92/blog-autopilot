#!/usr/bin/env tsx
/**
 * 기존 AS 게시물 중 지역 키워드 포함 포스트에 국토교통부 실거래가 섹션 일괄 패치
 * 사용법: pnpm tsx scripts/patch-molit-data.ts [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { buildTransactionContext, extractRegion } from '../src/lib/molit.js';

const ENV_FILE = new URL('../.env.local', import.meta.url).pathname;

function loadEnv(path: string): Record<string, string> {
  const vars: Record<string, string> = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* ignore */ }
  return vars;
}

const env = loadEnv(ENV_FILE);
// Merge .env.local into process.env (for molit.ts which reads process.env.MOLIT_API_KEY)
for (const [k, v] of Object.entries(env)) {
  if (!process.env[k]) process.env[k] = v;
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const BLOG_ID = process.env.GOOGLE_BLOG_ID_APT ?? process.env.GOOGLE_BLOG_ID;
const DB_PATH = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'blog.db');

const IDEMPOTENCY_MARKER = '<!-- molit-realdata -->';

// 지역 키워드 목록 (DB WHERE 절과 동기화)
const REGION_KEYWORDS = [
  '강남','서초','송파','강동','마포','양천','목동','강서','영등포','용산',
  '성동','광진','분당','판교','수지','기흥','일산','하남','과천','광명',
  '동탄','위례','잠실','반포','압구정','대치','개포','마곡','여의도','미사',
  '고덕','노원','은평','구로','부천','남양주','구리','화성','수원','평택',
];

function makeTokenManager() {
  let token: string | null = null;
  let expiresAt = 0;
  return async function getToken(): Promise<string> {
    if (token && Date.now() < expiresAt - 30_000) return token;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: REFRESH_TOKEN!,
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json() as Record<string, unknown>;
    if (data.error) throw new Error(`Token refresh: ${JSON.stringify(data)}`);
    token = data.access_token as string;
    expiresAt = Date.now() + (data.expires_in as number) * 1000;
    return token;
  };
}

async function fetchPost(postId: string, getToken: () => Promise<string>) {
  const at = await getToken();
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/${postId}`,
    { headers: { Authorization: `Bearer ${at}` } },
  );
  const data = await res.json() as Record<string, unknown>;
  if (data.error) throw new Error(`Fetch post ${postId}: ${JSON.stringify(data.error)}`);
  return data as { id: string; title: string; content: string };
}

async function patchPost(
  postId: string,
  title: string,
  content: string,
  getToken: () => Promise<string>,
) {
  const at = await getToken();
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/${postId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    },
  );
  const data = await res.json() as Record<string, unknown>;
  if (data.error) throw new Error(`PATCH ${postId}: ${JSON.stringify(data.error)}`);
  return data;
}

function buildHtmlSection(transactionText: string): string {
  // Parse the text format from molit.ts into HTML
  const lines = transactionText.split('\n').filter((l) => l.trim());

  // Extract header line like "[서울 강남구 아파트 실거래가 — 2026년 4월 (국토교통부 공공데이터)]"
  const headerLine = lines[0]?.replace(/^\[/, '').replace(/\]$/, '') ?? '';
  const totalLine = lines[1] ?? '';

  // Find area stats section
  const areaLines: string[] = [];
  const tradeLines: string[] = [];
  const trendLine = lines.find((l) => l.includes('전월 대비'));

  let inArea = false;
  let inTrades = false;
  for (const line of lines.slice(2)) {
    if (line.startsWith('전용면적별')) { inArea = true; inTrades = false; continue; }
    if (line.startsWith('주요 거래')) { inArea = false; inTrades = true; continue; }
    if (line.startsWith('전월 대비') || line.startsWith('출처')) { inArea = false; inTrades = false; continue; }
    if (inArea && line.trim().startsWith('59') || inArea && line.trim().startsWith('60') || inArea && line.trim().startsWith('85')) areaLines.push(line.trim());
    if (inTrades && line.trim().startsWith('')) {
      const t = line.trim().replace(/^  /, '');
      if (t) tradeLines.push(t);
    }
  }

  // Re-parse more carefully
  const allAreaLines = lines.filter((l) => /59㎡|60~85㎡|85㎡ 초과/.test(l)).map((l) => l.trim());
  const allTradeLines = lines.filter((l) => /→ \d+억/.test(l)).map((l) => l.trim().replace(/^  /, ''));

  const tradeRows = allTradeLines.map((line) => {
    // "신현대11차 (압구정동, 전용 183.41㎡, 4층, 1983년 건축) → 90억 (2026.04.29 거래)"
    const [left, right] = line.split(' → ');
    const price = right?.split(' (')[0] ?? '';
    const date = right?.match(/\(([^)]+) 거래\)/)?.[1] ?? '';
    return `<tr>
      <td style="padding:8px 10px;color:#333;border-bottom:1px solid #EEE;">${left ?? ''}</td>
      <td style="padding:8px 10px;color:#1A1A1A;font-weight:600;border-bottom:1px solid #EEE;white-space:nowrap;">${price}</td>
      <td style="padding:8px 10px;color:#888;font-size:13px;border-bottom:1px solid #EEE;white-space:nowrap;">${date}</td>
    </tr>`;
  }).join('');

  const areaRows = allAreaLines.map((line) => {
    // "59㎡ 이하: 평균 13억 662만 (94건)"
    const m = line.match(/^(.+?):\s*평균\s*(.+?)\s*\((\d+건)\)$/);
    if (!m) return '';
    return `<tr>
      <td style="padding:8px 10px;color:#333;border-bottom:1px solid #EEE;">${m[1]}</td>
      <td style="padding:8px 10px;color:#1A1A1A;font-weight:600;border-bottom:1px solid #EEE;">${m[2]}</td>
      <td style="padding:8px 10px;color:#888;font-size:13px;border-bottom:1px solid #EEE;">${m[3]}</td>
    </tr>`;
  }).filter(Boolean).join('');

  return `
${IDEMPOTENCY_MARKER}
<div style="margin-top:40px;padding:24px;background:#F8F9FA;border-radius:8px;border:1px solid #E8E8E8;">
  <h2 style="font-size:20px;font-weight:700;color:#1A1A1A;margin:0 0 8px 0;padding-bottom:8px;border-bottom:2px solid #4285F4;">${headerLine}</h2>
  <p style="font-size:14px;color:#555;margin:0 0 16px 0;">${totalLine}${trendLine ? ` / ${trendLine}` : ''}</p>

  <h3 style="font-size:16px;font-weight:600;color:#333;margin:0 0 8px 0;">전용면적별 평균 거래가</h3>
  <div style="overflow-x:auto;margin:0 0 20px 0;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead><tr style="background:#EEE;">
        <th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">면적</th>
        <th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">평균 거래가</th>
        <th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">거래 건수</th>
      </tr></thead>
      <tbody>${areaRows}</tbody>
    </table>
  </div>

  <h3 style="font-size:16px;font-weight:600;color:#333;margin:0 0 8px 0;">주요 거래 사례 (고가 Top 5)</h3>
  <div style="overflow-x:auto;margin:0 0 16px 0;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead><tr style="background:#EEE;">
        <th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">단지 (동, 면적, 층, 건축연도)</th>
        <th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">거래가</th>
        <th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">거래일</th>
      </tr></thead>
      <tbody>${tradeRows}</tbody>
    </table>
  </div>

  <p style="font-size:13px;color:#888;margin:0;">
    출처: <a href="https://rt.molit.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">국토교통부 실거래가 공개시스템</a> (공공데이터 API)
  </p>
</div>`;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) throw new Error('Missing Google OAuth env');
  if (!BLOG_ID) throw new Error('Missing GOOGLE_BLOG_ID_APT');
  if (!process.env.MOLIT_API_KEY) throw new Error('Missing MOLIT_API_KEY');

  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}\n`);

  const db = new Database(DB_PATH, { readonly: true });
  const whereRegion = REGION_KEYWORDS.map((k) => `keyword LIKE '%${k}%'`).join(' OR ');
  const posts = db.prepare(`
    SELECT id, keyword, title, external_post_id, published_at
    FROM published_posts
    WHERE niche='AS' AND status='published'
    AND (${whereRegion})
    ORDER BY published_at DESC
  `).all() as Array<{ id: number; keyword: string; title: string; external_post_id: string; published_at: string }>;
  db.close();

  console.log(`대상 포스트: ${posts.length}건\n`);

  const getToken = makeTokenManager();
  let patched = 0, skipped = 0, failed = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    console.log(`[${i + 1}/${posts.length}] "${post.title.slice(0, 50)}" (keyword: ${post.keyword.slice(0, 30)})`);

    const region = extractRegion(post.keyword);
    if (!region) {
      console.log(`  → 지역 매핑 없음 — skip\n`);
      skipped++;
      continue;
    }
    console.log(`  지역: ${region.regionName} (${region.lawdCd})`);

    // Fetch current Blogger content
    let bloggerPost: { id: string; title: string; content: string };
    try {
      bloggerPost = await fetchPost(post.external_post_id, getToken);
    } catch (err) {
      console.error(`  ERROR fetch: ${err instanceof Error ? err.message : String(err)}\n`);
      failed++;
      await sleep(500);
      continue;
    }

    // Idempotency check
    if (bloggerPost.content.includes(IDEMPOTENCY_MARKER)) {
      console.log(`  → 이미 패치됨 — skip\n`);
      skipped++;
      continue;
    }

    // Fetch MOLIT data
    let transactionText: string | null = null;
    try {
      transactionText = await buildTransactionContext(post.keyword);
    } catch (err) {
      console.error(`  ERROR molit: ${err instanceof Error ? err.message : String(err)}\n`);
      failed++;
      continue;
    }

    if (!transactionText) {
      console.log(`  → MOLIT 데이터 없음 (지역 불일치 또는 API 오류) — skip\n`);
      skipped++;
      continue;
    }

    const htmlSection = buildHtmlSection(transactionText);
    const newContent = bloggerPost.content + '\n' + htmlSection;

    if (dryRun) {
      console.log(`  [DRY] 패치 예정 — ${transactionText.split('\n')[0]}\n`);
      patched++;
      continue;
    }

    try {
      await patchPost(post.external_post_id, bloggerPost.title, newContent, getToken);
      patched++;
      console.log(`  ✓ 패치 완료\n`);
    } catch (err) {
      console.error(`  ERROR patch: ${err instanceof Error ? err.message : String(err)}\n`);
      failed++;
    }

    await sleep(800);
  }

  console.log(`=== 완료: patched=${patched} skipped=${skipped} failed=${failed} ===`);
  if (dryRun) console.log('(DRY-RUN — 실제 변경 없음)');
}

main().catch((err) => { console.error('Fatal:', err.message); process.exit(1); });
