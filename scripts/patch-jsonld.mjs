#!/usr/bin/env node
/**
 * 기존 Blogger 포스트에 JSON-LD (Article + FAQPage) schema 일괄 패치
 * 사용법: node scripts/patch-jsonld.mjs [--niche AS|TS|HS] [--dry-run]
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

const NICHE_SITE_META = {
  AS: { siteName: 'apt-signal', siteUrl: 'https://apt-signal.blogspot.com', authorName: '시그널 에디터', authorUrl: 'https://apt-signal.blogspot.com/p/blog-page.html' },
  HS: { siteName: 'health-signal', siteUrl: 'https://health-signal.blogspot.com', authorName: '헬스 에디터', authorUrl: 'https://health-signal.blogspot.com/p/health-signal.html' },
  TS: { siteName: 'trip-signal', siteUrl: 'https://trip-signal.blogspot.com', authorName: '트립 에디터', authorUrl: 'https://trip-signal.blogspot.com/p/trip-signal.html' },
};

function buildJsonLd(title, niche, dateIso) {
  const meta = NICHE_SITE_META[niche];
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    author: { '@type': 'Person', name: meta.authorName, url: meta.authorUrl },
    publisher: { '@type': 'Organization', name: meta.siteName, url: meta.siteUrl },
    datePublished: dateIso,
    dateModified: dateIso,
    mainEntityOfPage: { '@type': 'WebPage', '@id': meta.siteUrl },
  };
  return `<script type="application/ld+json">\n${JSON.stringify(articleSchema, null, 2)}\n</script>`;
}

function hasJsonLd(content) {
  return content.includes('application/ld+json') && content.includes('BlogPosting');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function makeTokenManager() {
  let token = null, expiresAt = 0;
  return async function getToken() {
    if (token && Date.now() < expiresAt - 30_000) return token;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: REFRESH_TOKEN, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token' }),
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
    const at = await getToken();
    const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?maxResults=50&status=live${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${at}` } });
    const data = await res.json();
    if (data.error) throw new Error(`List posts: ${JSON.stringify(data.error)}`);
    if (data.items) posts.push(...data.items);
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return posts;
}

async function patchPost(blogId, post, niche, getToken) {
  const at = await getToken();
  const jsonLd = buildJsonLd(post.title, niche, post.published ?? new Date().toISOString());
  const newContent = (post.content ?? '') + '\n' + jsonLd;
  const res = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${post.id}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: post.title, content: newContent }),
    },
  );
  const data = await res.json();
  if (data.error) throw new Error(`PATCH ${post.id}: ${JSON.stringify(data.error)}`);
  return data;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const nicheFilter = args.includes('--niche') ? args[args.indexOf('--niche') + 1] : null;
const targetNiches = nicheFilter ? [nicheFilter] : ['AS', 'TS', 'HS'];

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) throw new Error('Missing env');
  const getToken = makeTokenManager();
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'} | Niches: ${targetNiches.join(',')}\n`);

  let totalPatched = 0, totalSkipped = 0;

  for (const niche of targetNiches) {
    const blogId = BLOG_IDS[niche];
    if (!blogId) { console.warn(`[${niche}] BLOG_ID missing`); continue; }

    console.log(`[${niche}] Fetching posts...`);
    const posts = await fetchAllPosts(blogId, getToken);
    console.log(`[${niche}] ${posts.length} posts`);

    let patched = 0, skipped = 0;
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      if (hasJsonLd(post.content ?? '')) { skipped++; continue; }
      if (dryRun) { process.stdout.write(`  [DRY] [${i+1}/${posts.length}] "${post.title?.slice(0,50)}"\n`); patched++; continue; }
      try {
        await patchPost(blogId, post, niche, getToken);
        patched++;
        process.stdout.write(`  [${i+1}/${posts.length}] patched: "${post.title?.slice(0,40)}"\n`);
      } catch (err) {
        console.error(`  ERROR: ${err.message}`);
      }
      await sleep(700);
    }

    totalPatched += patched; totalSkipped += skipped;
    console.log(`[${niche}] done — patched=${patched} skipped=${skipped}\n`);
  }

  console.log(`=== Total: patched=${totalPatched} skipped=${totalSkipped} ===`);
  if (dryRun) console.log('(DRY-RUN)');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
