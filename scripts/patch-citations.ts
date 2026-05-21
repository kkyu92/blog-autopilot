#!/usr/bin/env tsx
/**
 * AS 기존 게시물 전체에 citation 박스 + 실거래가 섹션 일괄 패치
 *
 * - 지역 키워드 있는 포스트  → 해당 지역 실거래가
 * - 지역 키워드 없는 포스트  → 서울 주요 3구(강남·서초·송파) 요약
 * - 전체 → 참고 자료 citation 박스 추가
 * - molit-realdata 마커 있는 포스트는 skip (이미 패치됨)
 *
 * 사용법: pnpm tsx scripts/patch-citations.ts [--dry-run]
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
for (const [k, v] of Object.entries(env)) {
  if (!process.env[k]) process.env[k] = v;
}

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const BLOG_ID = process.env.GOOGLE_BLOG_ID_APT ?? process.env.GOOGLE_BLOG_ID;
const DB_PATH = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'blog.db');

const MOLIT_MARKER = '<!-- molit-realdata -->';
const CITATION_MARKER = '<!-- citation-box -->';

// 참고 자료 citation 박스 (AS 고정)
const CITATION_BOX =
  `\n${CITATION_MARKER}\n` +
  '<div style="margin-top:32px;padding:20px 24px;background:#F8F9FA;border-radius:8px;border:1px solid #E8E8E8;">' +
  '<p style="margin:0 0 12px 0;font-size:14px;font-weight:700;color:#1A1A1A;">📎 참고 자료</p>' +
  '<ul style="margin:0;padding-left:20px;">' +
  '<li style="font-size:14px;color:#555;line-height:1.8;margin-bottom:4px;"><a href="https://rt.molit.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">국토교통부 실거래가 공개시스템</a> — 아파트 매매·전월세 실거래가</li>' +
  '<li style="font-size:14px;color:#555;line-height:1.8;margin-bottom:4px;"><a href="https://www.applyhome.co.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">청약홈</a> — 분양·청약 일정 및 당첨자 발표</li>' +
  '<li style="font-size:14px;color:#555;line-height:1.8;margin-bottom:4px;"><a href="https://www.reb.or.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">한국부동산원</a> — 아파트 가격 동향·통계</li>' +
  '<li style="font-size:14px;color:#555;line-height:1.8;"><a href="https://apply.lh.or.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">LH 청약센터</a> — 공공주택 청약 정보</li>' +
  '</ul></div>';

// 서울 주요 3구 시장 요약 섹션 생성
function buildMultiRegionSection(
  gangnam: string | null,
  seocho: string | null,
  songpa: string | null,
): string {
  const parseStats = (text: string | null) => {
    if (!text) return null;
    const header = text.match(/\[(.+?) 아파트 실거래가 — (.+?)\]/)?.[2] ?? '';
    const total = text.match(/총 거래 건수: (\d+)건/)?.[1] ?? '0';
    const medium = text.match(/60~85㎡: 평균 (.+?) \(/)?.[1] ?? '-';
    const large = text.match(/85㎡ 초과: 평균 (.+?) \(/)?.[1] ?? '-';
    const trend = text.match(/전월 대비 평균 거래가:.+?→.+?(\S+)\n/)?.[1] ?? '';
    return { header, total, medium, large, trend };
  };

  const g = parseStats(gangnam);
  const s = parseStats(seocho);
  const sp = parseStats(songpa);

  // 헤더에서 기간 추출 (모두 같은 월)
  const period = g?.header ?? s?.header ?? sp?.header ?? '';

  let html = `\n${MOLIT_MARKER}\n`;
  html +=
    '<div style="margin-top:40px;padding:24px;background:#F8F9FA;border-radius:8px;border:1px solid #E8E8E8;">';
  html +=
    `<h2 style="font-size:20px;font-weight:700;color:#1A1A1A;margin:0 0 8px 0;padding-bottom:8px;border-bottom:2px solid #4285F4;">서울 주요 지역 아파트 실거래가 현황 (${period})</h2>`;
  html +=
    '<p style="font-size:14px;color:#555;margin:0 0 16px 0;">국토교통부 실거래가 공개시스템 기준 서울 강남권 3개 구 매매 거래 현황입니다.</p>';

  html += '<div style="overflow-x:auto;margin:0 0 16px 0;">';
  html +=
    '<table style="width:100%;border-collapse:collapse;font-size:14px;">';
  html +=
    '<thead><tr style="background:#EEE;">' +
    '<th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">지역</th>' +
    '<th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">거래 건수</th>' +
    '<th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">전용 60~85㎡ 평균</th>' +
    '<th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">전용 85㎡ 초과 평균</th>' +
    '<th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">전월 대비</th>' +
    '</tr></thead><tbody>';

  for (const [name, stat] of [['서울 강남구', g], ['서울 서초구', s], ['서울 송파구', sp]] as const) {
    if (!stat) continue;
    const trendColor = stat.trend.includes('상승') ? '#D32F2F' : stat.trend.includes('하락') ? '#1565C0' : '#555';
    html +=
      `<tr>` +
      `<td style="padding:8px 10px;color:#333;border-bottom:1px solid #EEE;font-weight:600;">${name}</td>` +
      `<td style="padding:8px 10px;color:#333;border-bottom:1px solid #EEE;">${stat.total}건</td>` +
      `<td style="padding:8px 10px;color:#1A1A1A;font-weight:600;border-bottom:1px solid #EEE;">${stat.medium}</td>` +
      `<td style="padding:8px 10px;color:#1A1A1A;font-weight:600;border-bottom:1px solid #EEE;">${stat.large}</td>` +
      `<td style="padding:8px 10px;border-bottom:1px solid #EEE;color:${trendColor};font-weight:600;">${stat.trend || '-'}</td>` +
      `</tr>`;
  }

  html += '</tbody></table></div>';
  html +=
    '<p style="font-size:13px;color:#888;margin:0;">' +
    '출처: <a href="https://rt.molit.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">국토교통부 실거래가 공개시스템</a> (공공데이터 API)' +
    '</p></div>';

  return html;
}

// 지역 실거래가 섹션 (patch-molit-data.ts의 buildHtmlSection 재사용)
function buildRegionSection(transactionText: string): string {
  const lines = transactionText.split('\n').filter((l) => l.trim());
  const headerLine = lines[0]?.replace(/^\[/, '').replace(/\]$/, '') ?? '';
  const totalLine = lines[1] ?? '';
  const trendLine = lines.find((l) => l.includes('전월 대비'));
  const allAreaLines = lines.filter((l) => /59㎡|60~85㎡|85㎡ 초과/.test(l)).map((l) => l.trim());
  const allTradeLines = lines.filter((l) => /→ \d/.test(l)).map((l) => l.trim());

  const areaRows = allAreaLines.map((line) => {
    const m = line.match(/^(.+?):\s*평균\s*(.+?)\s*\((\d+건)\)$/);
    if (!m) return '';
    return `<tr><td style="padding:8px 10px;color:#333;border-bottom:1px solid #EEE;">${m[1]}</td><td style="padding:8px 10px;color:#1A1A1A;font-weight:600;border-bottom:1px solid #EEE;">${m[2]}</td><td style="padding:8px 10px;color:#888;font-size:13px;border-bottom:1px solid #EEE;">${m[3]}</td></tr>`;
  }).filter(Boolean).join('');

  const tradeRows = allTradeLines.map((line) => {
    const [left, right] = line.split(' → ');
    const price = right?.split(' (')[0] ?? '';
    const date = right?.match(/\(([^)]+) 거래\)/)?.[1] ?? '';
    return `<tr><td style="padding:8px 10px;color:#333;border-bottom:1px solid #EEE;">${left ?? ''}</td><td style="padding:8px 10px;color:#1A1A1A;font-weight:600;border-bottom:1px solid #EEE;white-space:nowrap;">${price}</td><td style="padding:8px 10px;color:#888;font-size:13px;border-bottom:1px solid #EEE;white-space:nowrap;">${date}</td></tr>`;
  }).join('');

  return `\n${MOLIT_MARKER}\n` +
    '<div style="margin-top:40px;padding:24px;background:#F8F9FA;border-radius:8px;border:1px solid #E8E8E8;">' +
    `<h2 style="font-size:20px;font-weight:700;color:#1A1A1A;margin:0 0 8px 0;padding-bottom:8px;border-bottom:2px solid #4285F4;">${headerLine}</h2>` +
    `<p style="font-size:14px;color:#555;margin:0 0 16px 0;">${totalLine}${trendLine ? ` / ${trendLine}` : ''}</p>` +
    '<h3 style="font-size:16px;font-weight:600;color:#333;margin:0 0 8px 0;">전용면적별 평균 거래가</h3>' +
    '<div style="overflow-x:auto;margin:0 0 20px 0;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="background:#EEE;"><th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">면적</th><th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">평균 거래가</th><th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">거래 건수</th></tr></thead><tbody>' +
    areaRows +
    '</tbody></table></div>' +
    '<h3 style="font-size:16px;font-weight:600;color:#333;margin:0 0 8px 0;">주요 거래 사례 (고가 Top 5)</h3>' +
    '<div style="overflow-x:auto;margin:0 0 16px 0;"><table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="background:#EEE;"><th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">단지 (동, 면적, 층, 건축연도)</th><th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">거래가</th><th style="padding:8px 10px;text-align:left;font-weight:600;color:#1A1A1A;">거래일</th></tr></thead><tbody>' +
    tradeRows +
    '</tbody></table></div>' +
    '<p style="font-size:13px;color:#888;margin:0;">출처: <a href="https://rt.molit.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">국토교통부 실거래가 공개시스템</a> (공공데이터 API)</p>' +
    '</div>';
}

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
    if (data.error) throw new Error(`Token: ${JSON.stringify(data)}`);
    token = data.access_token as string;
    expiresAt = Date.now() + (data.expires_in as number) * 1000;
    return token;
  };
}

async function fetchPost(postId: string, getToken: () => Promise<string>) {
  const at = await getToken();
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/${postId}?view=ADMIN`,
    { headers: { Authorization: `Bearer ${at}` } },
  );
  const data = await res.json() as Record<string, unknown>;
  if (data.error) throw new Error(`Fetch ${postId}: ${JSON.stringify(data.error)}`);
  return data as { id: string; title: string; content: string };
}

async function patchPost(postId: string, title: string, content: string, getToken: () => Promise<string>) {
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
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) throw new Error('Missing Google OAuth env');
  if (!BLOG_ID) throw new Error('Missing GOOGLE_BLOG_ID_APT');
  if (!process.env.MOLIT_API_KEY) throw new Error('Missing MOLIT_API_KEY');

  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}\n`);

  // 서울 3구 데이터 사전 fetch (generic 포스트용)
  console.log('서울 강남권 3구 실거래가 사전 조회...');
  const [gangnam, seocho, songpa] = await Promise.all([
    buildTransactionContext('강남구 아파트'),
    buildTransactionContext('서초구 아파트'),
    buildTransactionContext('송파구 아파트'),
  ]);
  const multiSection = buildMultiRegionSection(gangnam, seocho, songpa);
  console.log(`  강남: ${gangnam?.split('\n')[1] ?? 'null'}`);
  console.log(`  서초: ${seocho?.split('\n')[1] ?? 'null'}`);
  console.log(`  송파: ${songpa?.split('\n')[1] ?? 'null'}\n`);

  const db = new Database(DB_PATH, { readonly: true });
  const posts = db.prepare(`
    SELECT id, keyword, title, external_post_id
    FROM published_posts
    WHERE niche='AS' AND status='published'
    ORDER BY published_at DESC
  `).all() as Array<{ id: number; keyword: string; title: string; external_post_id: string }>;
  db.close();

  console.log(`전체 AS 게시물: ${posts.length}건\n`);

  const getToken = makeTokenManager();
  let patched = 0, skipped = 0, failed = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    process.stdout.write(`[${i + 1}/${posts.length}] "${post.title.slice(0, 45)}"...\n`);

    let bloggerPost: { id: string; title: string; content: string };
    try {
      bloggerPost = await fetchPost(post.external_post_id, getToken);
    } catch (err) {
      console.error(`  ERROR fetch: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
      await sleep(500);
      continue;
    }

    const content = bloggerPost.content;

    // 이미 두 마커 모두 있으면 완전 skip
    if (content.includes(MOLIT_MARKER) && content.includes(CITATION_MARKER)) {
      process.stdout.write(`  → 이미 완료 skip\n`);
      skipped++;
      continue;
    }

    // 추가할 섹션 결정
    let molitSection = '';
    if (!content.includes(MOLIT_MARKER)) {
      const region = extractRegion(post.keyword);
      if (region) {
        // 지역 특정 데이터
        const txData = await buildTransactionContext(post.keyword).catch(() => null);
        if (txData) {
          molitSection = buildRegionSection(txData);
          process.stdout.write(`  실거래가: ${region.regionName}\n`);
        } else {
          molitSection = multiSection;
          process.stdout.write(`  실거래가: 서울 3구 (region API null fallback)\n`);
        }
      } else {
        molitSection = multiSection;
        process.stdout.write(`  실거래가: 서울 3구 (generic)\n`);
      }
    }

    const citationSection = content.includes(CITATION_MARKER) ? '' : CITATION_BOX;

    if (!molitSection && !citationSection) {
      process.stdout.write(`  → 추가할 내용 없음 skip\n`);
      skipped++;
      continue;
    }

    // author box 앞에 삽입 (있으면), 없으면 그냥 append
    const AUTHOR_BOX_PATTERN = 'apt-signal 운영자';
    let newContent: string;
    if (content.includes(AUTHOR_BOX_PATTERN)) {
      const idx = content.lastIndexOf('<div', content.indexOf(AUTHOR_BOX_PATTERN) - 10);
      newContent =
        content.slice(0, idx) +
        molitSection +
        citationSection + '\n' +
        content.slice(idx);
    } else {
      newContent = content + molitSection + citationSection;
    }

    if (dryRun) {
      process.stdout.write(`  [DRY] molit=${!!molitSection} citation=${!!citationSection}\n\n`);
      patched++;
      continue;
    }

    try {
      await patchPost(post.external_post_id, bloggerPost.title, newContent, getToken);
      patched++;
      process.stdout.write(`  ✓ 완료\n\n`);
    } catch (err) {
      console.error(`  ERROR patch: ${err instanceof Error ? err.message : String(err)}\n`);
      failed++;
    }

    await sleep(800);
  }

  console.log(`\n=== 완료: patched=${patched} skipped=${skipped} failed=${failed} ===`);
  if (dryRun) console.log('(DRY-RUN)');
}

main().catch((err) => { console.error('Fatal:', err.message); process.exit(1); });
