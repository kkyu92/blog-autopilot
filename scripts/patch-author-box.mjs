#!/usr/bin/env node
/**
 * 기존 Blogger 포스트에 author box 일괄 패치
 * 사용법: node scripts/patch-author-box.mjs [--niche AS|TS|HS] [--dry-run]
 */
import { readFileSync } from 'fs';
import { URL } from 'url';

const ENV_FILE = new URL('../.env.local', import.meta.url).pathname;

function loadEnv(path) {
  const vars = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
  return vars;
}

const env = loadEnv(ENV_FILE);
const CLIENT_ID = env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = env.GOOGLE_REFRESH_TOKEN;

const BLOG_IDS = {
  AS: env.GOOGLE_BLOG_ID_APT ?? env.GOOGLE_BLOG_ID,
  TS: env.GOOGLE_BLOG_ID_TRIP,
  HS: env.GOOGLE_BLOG_ID_HEALTH,
};

// 동일한 author box HTML (editor.ts AUTHOR_BOX_BY_NICHE과 동기화)
const AUTHOR_BOX_BY_NICHE = {
  AS:
    '<div style="margin-top:40px;padding:20px 24px;background:#F8F9FA;border-radius:8px;border:1px solid #E8E8E8;">' +
    '<p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#888888;letter-spacing:0.04em;">글쓴이</p>' +
    '<p style="margin:0 0 6px 0;font-size:15px;font-weight:700;color:#1A1A1A;">시그널 에디터 | apt-signal</p>' +
    '<p style="margin:0;font-size:14px;color:#555555;line-height:1.7;">수도권 아파트 분양·청약 시장을 분석하는 부동산 정보 블로그 apt-signal 운영자입니다. ' +
    '<a href="https://rt.molit.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">국토교통부 실거래가 데이터</a>와 ' +
    '<a href="https://www.applyhome.co.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">청약홈 통계</a>를 기반으로 콘텐츠를 작성합니다.</p>' +
    '</div>',
  HS:
    '<div style="margin-top:40px;padding:20px 24px;background:#F8F9FA;border-radius:8px;border:1px solid #E8E8E8;">' +
    '<p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#888888;letter-spacing:0.04em;">글쓴이</p>' +
    '<p style="margin:0 0 6px 0;font-size:15px;font-weight:700;color:#1A1A1A;">헬스 에디터 | health-signal</p>' +
    '<p style="margin:0;font-size:14px;color:#555555;line-height:1.7;">' +
    '<a href="https://www.mohw.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">보건복지부</a>·' +
    '<a href="https://www.kdca.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">질병관리청</a> 공식 가이드라인과 의학 연구를 기반으로 건강 정보를 큐레이션하는 health-signal 운영자입니다. ' +
    '이 블로그의 콘텐츠는 전문가 상담을 대체하지 않으며, 정확한 정보 전달을 목표로 합니다.</p>' +
    '</div>',
  TS:
    '<div style="margin-top:40px;padding:20px 24px;background:#F8F9FA;border-radius:8px;border:1px solid #E8E8E8;">' +
    '<p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#888888;letter-spacing:0.04em;">글쓴이</p>' +
    '<p style="margin:0 0 6px 0;font-size:15px;font-weight:700;color:#1A1A1A;">트립 에디터 | trip-signal</p>' +
    '<p style="margin:0;font-size:14px;color:#555555;line-height:1.7;">국내외 여행 정보와 실용적인 여행 팁을 큐레이션하는 trip-signal 운영자입니다. ' +
    '<a href="https://www.visitkorea.or.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">한국관광공사</a> 공식 데이터와 직접 수집한 여행 정보를 바탕으로 콘텐츠를 제작합니다.</p>' +
    '</div>',
};

// idempotency 체크 패턴 (editor.ts AUTHOR_BOX_PATTERN과 동기화)
const AUTHOR_BOX_PATTERNS = ['apt-signal 운영자', 'health-signal 운영자', 'trip-signal 운영자'];

function hasAuthorBox(content) {
  return AUTHOR_BOX_PATTERNS.some(p => content.includes(p));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// 만료 여유 30초
function makeTokenManager() {
  let token = null;
  let expiresAt = 0;
  return async function getToken() {
    if (token && Date.now() < expiresAt - 30_000) return token;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: REFRESH_TOKEN,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(`Token refresh: ${JSON.stringify(data)}`);
    token = data.access_token;
    expiresAt = Date.now() + data.expires_in * 1000;
    return token;
  };
}

async function fetchAllPosts(blogId, getToken) {
  const posts = [];
  let pageToken = '';
  do {
    const accessToken = await getToken();
    const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?maxResults=50&status=live${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (data.error) throw new Error(`List posts failed: ${JSON.stringify(data.error)}`);
    if (data.items) posts.push(...data.items);
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return posts;
}

async function updatePost(blogId, postId, title, content, getToken) {
  const accessToken = await getToken();
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${postId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, content }),
    },
  );
  const data = await res.json();
  if (data.error) throw new Error(`Post update failed (${postId}): ${JSON.stringify(data.error)}`);
  return data;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const nicheFilter = args.includes('--niche') ? args[args.indexOf('--niche') + 1] : null;
const targetNiches = nicheFilter ? [nicheFilter] : ['AS', 'TS', 'HS'];

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('Missing env: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN');
  }

  const getToken = makeTokenManager();
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'} | Niches: ${targetNiches.join(',')}\n`);

  let totalPatched = 0;
  let totalSkipped = 0;

  for (const niche of targetNiches) {
    const blogId = BLOG_IDS[niche];
    if (!blogId) {
      console.warn(`[${niche}] BLOG_ID missing — skip`);
      continue;
    }

    console.log(`[${niche}] Fetching all live posts...`);
    const posts = await fetchAllPosts(blogId, getToken);
    console.log(`[${niche}] ${posts.length} posts fetched`);

    let patched = 0;
    let skipped = 0;

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const content = post.content ?? '';

      if (hasAuthorBox(content)) {
        skipped++;
        continue;
      }

      const newContent = content + AUTHOR_BOX_BY_NICHE[niche];

      if (dryRun) {
        console.log(`  [DRY] [${i + 1}/${posts.length}] "${post.title?.slice(0, 50)}"`);
        patched++;
        continue;
      }

      try {
        await updatePost(blogId, post.id, post.title, newContent, getToken);
        patched++;
        process.stdout.write(`  [${i + 1}/${posts.length}] patched: "${post.title?.slice(0, 40)}"\n`);
      } catch (err) {
        console.error(`  ERROR (${post.id}): ${err.message}`);
      }

      // Rate limit: 100 writes/100sec per user. 400ms delay = ~2.5/sec → safe.
      await sleep(400);
    }

    totalPatched += patched;
    totalSkipped += skipped;
    console.log(`[${niche}] done — patched=${patched} skipped(already_had_box)=${skipped}\n`);
  }

  console.log(`=== Total: patched=${totalPatched} skipped=${totalSkipped} ===`);
  if (dryRun) console.log('(DRY-RUN — no actual changes made)');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
