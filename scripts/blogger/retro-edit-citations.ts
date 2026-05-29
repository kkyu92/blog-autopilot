#!/usr/bin/env tsx
/**
 * Retro-edit published AS posts to boost citation/source quality.
 *
 * 5/29 AdSense reject family ("가치 있는 인벤토리 부족"): 기존 119건 글에 AI slop 패턴
 * (출처 전무 / URL 미제공 / 발화자 미명시 / URL-데이터 불일치) 살아있어 reviewer spot-check 시
 * 동일 reject 재발 위험. 본 스크립트는 누적 글을 batch 로 retro-edit 해서 citation 보강.
 *
 * Flow per post:
 *   1. GET full HTML from Blogger (posts.get)
 *   2. factcheck() → severity='critical' 이슈 추출
 *   3. critical 0건 → skip
 *   4. critical ≥1건 → callClaude "patch HTML adding inline citations" → returns revised HTML
 *   5. --apply 면 PUT 으로 Blogger 갱신
 *
 * Usage:
 *   pnpm tsx scripts/blogger/retro-edit-citations.ts                     # dry-run, limit 5 AS
 *   pnpm tsx scripts/blogger/retro-edit-citations.ts --limit 20 --apply  # 20건 apply
 *   pnpm tsx scripts/blogger/retro-edit-citations.ts --niche HS --limit 10 --apply
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { factcheck } from '../../src/lib/factcheck.js';
import { callClaude } from '../../src/lib/llm.js';
import { buildCurrentDateHeader } from '../../src/lib/current-date.js';

// Lightweight .env loader (no dotenv dep). --env-file= 또는 직접 export 환경 변수 모두 지원.
function loadEnvFile(p: string): void {
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf8');
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

interface CliArgs {
  niche: 'AS' | 'HS' | 'TS';
  limit: number;
  apply: boolean;
  sleepMs: number;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (name: string): string | undefined => {
    const eq = argv.find((a) => a.startsWith(`--${name}=`));
    if (eq) return eq.split('=', 2)[1];
    const idx = argv.indexOf(`--${name}`);
    if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
    return undefined;
  };
  const niche = (get('niche') ?? 'AS') as 'AS' | 'HS' | 'TS';
  if (!['AS', 'HS', 'TS'].includes(niche)) {
    throw new Error(`invalid --niche: ${niche}`);
  }
  return {
    niche,
    limit: Number(get('limit') ?? 5),
    apply: argv.includes('--apply'),
    sleepMs: Number(get('sleep') ?? 2000),
  };
}

const NICHE_BLOG_ID_ENV: Record<string, string> = {
  AS: 'GOOGLE_BLOG_ID_APT',
  HS: 'GOOGLE_BLOG_ID_HEALTH',
  TS: 'GOOGLE_BLOG_ID_TRIP',
};

function getBlogId(niche: string): string {
  const key = NICHE_BLOG_ID_ENV[niche];
  const id = process.env[key] ?? process.env.GOOGLE_BLOG_ID;
  if (!id) throw new Error(`env ${key} (or GOOGLE_BLOG_ID) not set`);
  return id;
}

async function fetchAccessToken(): Promise<string> {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('GOOGLE_REFRESH_TOKEN / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`token refresh fail: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// 5/29 evidence: 50-post run 의 21건째부터 fetch_fail 전부 발생 = 60분 만료.
// [[feedback_long_running_batch_token_refresh]] 매뉴얼 inline refresh.
// 50min 단위 강제 refresh (60min TTL 안전 margin).
const TOKEN_TTL_MS = 50 * 60 * 1000;
class TokenManager {
  private token: string | null = null;
  private fetchedAt = 0;
  async get(): Promise<string> {
    const now = Date.now();
    if (this.token && now - this.fetchedAt < TOKEN_TTL_MS) return this.token;
    this.token = await fetchAccessToken();
    this.fetchedAt = now;
    console.log(`[auth] access token (re)fetched at ${new Date(this.fetchedAt).toISOString()}`);
    return this.token;
  }
}

interface BloggerPost {
  id: string;
  title: string;
  content: string;
  url?: string;
}

async function getPost(token: string, blogId: string, postId: string): Promise<BloggerPost> {
  const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${postId}?view=ADMIN`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`get post ${postId} fail: ${res.status} ${await res.text()}`);
  return (await res.json()) as BloggerPost;
}

async function patchPost(
  token: string,
  blogId: string,
  postId: string,
  content: string,
): Promise<BloggerPost> {
  const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${postId}?fetchBody=false`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`patch post ${postId} fail: ${res.status} ${await res.text()}`);
  return (await res.json()) as BloggerPost;
}

const RETRO_PROMPT = `You are a Korean blog citation editor. Goal: patch the given HTML to fix CITATION / SOURCE quality issues that AdSense reviewers flag as "AI slop" / "low-value inventory".

CRITICAL ISSUES TO FIX (provided as list):
- "출처 전무" / "구체적 출처 없음": numeric claim with no source → add inline citation
- "URL 미제공": refers to an institution/system but no URL → add canonical URL inline
- "URL-데이터 불일치": linked URL doesn't actually host the claimed data → replace with correct URL
- "발화자 미명시": blockquote without attribution → either remove blockquote, OR add attribution
- "발화자·소속·출처 전혀 없음": unsourced quote → either remove quote, OR add concrete attribution

EDIT RULES:
1. Edit IN PLACE — keep paragraph structure, headings, image tags, lists exactly as-is
2. For numeric stats: append "(출처: <기관명> <URL>)" inline OR rewrite to remove the bare number
3. For institution mentions without URL: add <a href="https://..."> with canonical official URL
4. For unsourced blockquotes: rewrite as plain paragraph + attribution OR delete entirely
5. Use ONLY real, verifiable URLs from Korean government / institutional sites:
   - 국토교통부 통계: https://stat.molit.go.kr (NOT rt.molit.go.kr — that is 실거래가 only)
   - 국토교통부 실거래가: https://rt.molit.go.kr
   - 국세청: https://www.nts.go.kr
   - 한국부동산원: https://www.reb.or.kr
   - DART (전자공시): https://dart.fss.or.kr
   - 통계청 KOSIS: https://kosis.kr
   - 국민건강보험공단: https://www.nhis.or.kr
   - 질병관리청: https://www.kdca.go.kr
6. DO NOT add new content beyond fixing citations. Length ≈ original ± 10%.
7. DO NOT change image src, alt, or layout.
8. DO NOT touch <table>, <iframe>, <script>, <style> tags.

OUTPUT FORMAT (strict JSON):
{
  "revised_html": "<html string with fixes applied>",
  "fixes": [
    { "issue": "<original critical description>", "fix": "<what you changed>" }
  ],
  "no_fix_possible": [] // critical issues you could not address (explain)
}`;

interface RetroFixResult {
  revised_html: string;
  fixes: Array<{ issue: string; fix: string }>;
  no_fix_possible?: string[];
}

async function callRetroFixer(
  html: string,
  title: string,
  keyword: string,
  criticalIssues: Array<{ description: string; suggested_fix: string }>,
): Promise<RetroFixResult> {
  const userMessage = JSON.stringify({
    title,
    keyword,
    critical_issues: criticalIssues,
    content_html: html,
  });

  // 5/29 dry-run evidence: Sonnet drift (revised_html 키 누락 또는 raw HTML 반환) 1/3 사례.
  // 1회 retry — 다른 seed 라 자연 회복 가능. 2회 째에도 fail 이면 throw.
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await callClaude({
      systemPrompt: buildCurrentDateHeader() + RETRO_PROMPT,
      userMessage,
      expectJson: true,
    });
    let parsed: RetroFixResult;
    try {
      parsed = JSON.parse(raw) as RetroFixResult;
    } catch (e) {
      lastErr = new Error(`retro-fixer JSON parse fail (attempt ${attempt}): ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (typeof parsed.revised_html === 'string' && parsed.revised_html.length >= 200) {
      return parsed;
    }
    lastErr = new Error(`retro-fixer invalid revised_html (attempt ${attempt}, len=${parsed.revised_html?.length ?? 'undef'})`);
    console.warn(`  [retro-fixer] ${lastErr.message} — retry`);
  }
  throw lastErr ?? new Error('retro-fixer: unknown failure');
}

interface DbPost {
  id: number;
  external_post_id: string;
  title: string;
  keyword: string;
  slug: string;
  published_at: string;
}

function selectPosts(dbPath: string, niche: string, limit: number): DbPost[] {
  const db = new Database(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT id, external_post_id, title, keyword, slug, published_at
       FROM published_posts
       WHERE niche = ? AND status = 'published' AND external_post_id IS NOT NULL AND external_post_id != ''
       ORDER BY published_at DESC
       LIMIT ?`,
    )
    .all(niche, limit) as DbPost[];
  db.close();
  return rows;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface Summary {
  postId: string;
  title: string;
  url?: string;
  status: 'skipped_no_critical' | 'fixed_dry' | 'fixed_apply' | 'fix_fail' | 'fetch_fail';
  criticalCount?: number;
  fixesApplied?: number;
  noFixPossible?: number;
  error?: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const blogId = getBlogId(args.niche);
  const dbPath = process.env.DATABASE_PATH ?? './data/blog.db';

  console.log(`[retro-edit] niche=${args.niche} blogId=${blogId} limit=${args.limit} apply=${args.apply} sleep=${args.sleepMs}ms db=${dbPath}`);

  const posts = selectPosts(path.resolve(dbPath), args.niche, args.limit);
  console.log(`[retro-edit] DB returned ${posts.length} posts (most recent first)`);
  if (posts.length === 0) return;

  const tokenMgr = new TokenManager();
  const summary: Summary[] = [];

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const tag = `[${i + 1}/${posts.length}] ${p.published_at.slice(0, 10)} ${p.title.slice(0, 50)}`;
    console.log(`\n${tag}`);

    let full: BloggerPost;
    try {
      const token = await tokenMgr.get();
      full = await getPost(token, blogId, p.external_post_id);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error(`  ✗ fetch fail: ${err}`);
      summary.push({ postId: p.external_post_id, title: p.title, status: 'fetch_fail', error: err });
      continue;
    }

    const fc = await factcheck({
      niche: args.niche as 'HS' | 'AS',
      draft: { content_html: full.content, title: full.title, keyword: p.keyword },
    });
    const critical = (fc.issues ?? []).filter((iss) => iss.severity === 'critical');

    if (critical.length === 0) {
      console.log(`  ✓ no critical issues (factcheck verdict=${fc.verdict}, total issues=${fc.issues?.length ?? 0}) — skip`);
      summary.push({ postId: p.external_post_id, title: p.title, url: full.url, status: 'skipped_no_critical' });
      await sleep(args.sleepMs);
      continue;
    }

    console.log(`  ⚠ ${critical.length} critical issue(s):`);
    for (const c of critical) console.log(`    - ${c.description}`);

    let fixed: RetroFixResult;
    try {
      fixed = await callRetroFixer(full.content, full.title, p.keyword, critical);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error(`  ✗ retro-fix fail: ${err}`);
      summary.push({ postId: p.external_post_id, title: p.title, url: full.url, status: 'fix_fail', criticalCount: critical.length, error: err });
      await sleep(args.sleepMs);
      continue;
    }

    console.log(`  → ${fixed.fixes.length} fix(es) applied, ${fixed.no_fix_possible?.length ?? 0} not addressable`);
    for (const f of fixed.fixes) console.log(`    + ${f.fix.slice(0, 100)}`);

    if (!args.apply) {
      console.log(`  (DRY-RUN — no Blogger PATCH performed)`);
      summary.push({
        postId: p.external_post_id,
        title: p.title,
        url: full.url,
        status: 'fixed_dry',
        criticalCount: critical.length,
        fixesApplied: fixed.fixes.length,
        noFixPossible: fixed.no_fix_possible?.length ?? 0,
      });
      await sleep(args.sleepMs);
      continue;
    }

    try {
      const tokenForPatch = await tokenMgr.get();
      await patchPost(tokenForPatch, blogId, p.external_post_id, fixed.revised_html);
      console.log(`  ✓ PATCH 성공`);
      summary.push({
        postId: p.external_post_id,
        title: p.title,
        url: full.url,
        status: 'fixed_apply',
        criticalCount: critical.length,
        fixesApplied: fixed.fixes.length,
        noFixPossible: fixed.no_fix_possible?.length ?? 0,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.error(`  ✗ PATCH fail: ${err}`);
      summary.push({ postId: p.external_post_id, title: p.title, url: full.url, status: 'fix_fail', criticalCount: critical.length, error: err });
    }

    await sleep(args.sleepMs);
  }

  console.log('\n[summary]');
  const counts = summary.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1;
    return acc;
  }, {});
  console.table(counts);
  console.table(
    summary.map((s) => ({
      status: s.status,
      critical: s.criticalCount ?? '',
      fixes: s.fixesApplied ?? '',
      title: s.title.slice(0, 40),
    })),
  );
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
