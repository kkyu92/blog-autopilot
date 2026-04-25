# blog-autopilot PR5/PR6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** blog-autopilot Phase 1 파이프라인 구현 — 매일 9개 게시물 (3 niche × 3 slot, niche=WS/TS/AS) 자동 발행 시스템. self-hosted GitHub Actions runner + claude CLI spawn 기반.

**Architecture:** spec `docs/superpowers/specs/2026-04-26-blog-autopilot-pr5-pr6-design.md` (commit 8baca59) §4 Architecture 참조. 핵심: 인터페이스=GitHub, 실행=PC(self-hosted runner), 상태=SQLite, 외부 API native scheduled_for 활용.

**Tech Stack:** Node.js, TypeScript, Vitest, Drizzle (SQLite), better-sqlite3, GitHub Actions self-hosted runner, claude CLI (`--dangerously-skip-permissions`), WordPress.com REST API, Blogger v3 API, Pexels/Pixabay API.

**Scope:**
- **PR5** (이 plan에서 detailed) — lib + 테스트 + schema + CI test workflow. 외부 영향 0.
- **PR6** (이 plan에서 high-level outline) — workflow yaml + scripts/auto-publish.ts + smoke. PR5 land 후 detail 추가 plan 작성.

**Spec 결정 인덱스**: spec §3 통합 결정 매트릭스 16개 + §1 Background의 D1~D7 (plan-eng-review) + C1~C9 (Codex outside voice).

---

## File Structure

### PR5 (외부 영향 0)

| 파일 | 종류 | 책임 | spec 참조 |
|---|---|---|---|
| `drizzle/migrations/0001_pr5_schema_boost.sql` | Create | status enum, failure_reason, draft_json, scheduled_slot, metadata.evergreen, UNIQUE(niche, slug) | spec §3, §5 |
| `src/lib/llm.ts` | Create | claude CLI spawn wrapper (`--dangerously-skip-permissions`, `--model sonnet`) | spec §3 D5 / §5 |
| `src/lib/healthcheck.ts` | Create | 6종 ping (Pixabay/Pexels/WP-WS/WP-TS/Blogger-AS + **claude CLI C4**) | spec §5, C4 |
| `src/lib/dedup.ts` | Modify | 4단계 (slug 영구 + 24h strict + 7d loose with 트렌드 override + evergreen 90d) | spec §3 / 기존 PR4 확장 |
| `src/lib/slug.ts` | Create | slug 생성 + batch 충돌 변형 (-2 suffix) | spec §3 / brainstorming gap 2 |
| `src/lib/factcheck.ts` | Create | YMYL 사실 검증 (WS/AS niche에 한해, source citation·정책 최신성·면책 문구) | spec §3 C1 |
| `src/lib/editor.ts` | Create | QA gate + revision feedback. WS/AS면 factcheck 호출 | spec §5, C1 |
| `src/lib/images.ts` | Create | Pexels → Pixabay → placeholder (UA `blog-autopilot/1.0`) | spec §5 |
| `src/lib/wordpress.ts` | Modify | 멀티사이트 지원 (`publishScheduled(niche, post, slot_time)` — niche로 토큰 라우팅) + WordPress.com `status=future` 1단계 | spec §3 C2/C3 |
| `src/lib/blogger.ts` | Modify | Blogger 2단계 발행 (`posts.insert` draft → `posts.publish` with `publishDate`) | spec §3 C3 |
| `src/lib/tokens.ts` | Modify | niche별 토큰 라우팅 (`getWordPressToken(niche): {token, blogId}`) | spec §3 C2 |
| `src/lib/trends.ts` | Modify | `pickQueue(niche, count=5)` evergreen flag 출력. dedup pre-filter | spec §3 C6 (간단한 부분만) |
| `prompts/agents/trend-hunter.md` | Create | paperclip `agents/trend-hunter/AGENTS.md` 그대로 복사 | spec §3 |
| `prompts/agents/content-writer.md` | Create | 동일 | spec §3 |
| `prompts/agents/content-editor.md` | Create | 동일 | spec §3 |
| `prompts/agents/image-curator.md` | Create | 동일 | spec §3 |
| `prompts/agents/publisher.md` | Create | 동일 | spec §3 |
| `niches/worldsignal.yaml` | Modify | env var 키 보강 (`WORDPRESS_WS_TOKEN`, `WORDPRESS_WS_BLOG_ID`) | spec §3 C2 |
| `niches/travelsignal.yaml` | Modify | 동일 (`WORDPRESS_TS_*`) | spec §3 C2 |
| `niches/aptsignal.yaml` | Modify | `BLOGGER_AS_*` 표준화 | spec §3 C2 |
| `src/lib/claude.ts` | **Delete** | dead code (PR1-4 이후 사용처 0) | spec D5 |
| `package.json` | Modify | `@anthropic-ai/sdk` dep 제거 | spec D5 |
| `tests/lib/__tests__/*.test.ts` × 9 | Create | Vitest 단위 (각 lib 모듈) | spec §8 |
| `.github/workflows/test.yml` | Create | CI vitest run + coverage (외부 API 0, ubuntu-latest) | spec §8 |
| **기존 드리프트 정리** | Modify | `tests/schema.test.ts:35`, `tests/api-validation.test.ts:95` (wordpress invalid platform 제거) | spec C9 |

### PR6 (외부 영향 ON, 별도 plan)

| 파일 | 종류 | 책임 |
|---|---|---|
| `scripts/auto-publish.ts` | Create | 오케스트레이터. healthcheck → trend → 9 슬롯 → DB INSERT → batch summary + DB 백업 + exit policy |
| `.github/workflows/auto-publish.yml` | Create | `schedule: '17 1 * * *'` + `workflow_dispatch` (niche choice) + `runs-on: self-hosted` + `timeout-minutes: 45` |
| `docs/runner-setup.md` | Create | pmset wake schedule + LaunchAgent + claude OAuth 설정 1회 가이드 |
| smoke test (manual) | - | `gh workflow run auto-publish.yml -f niche=WS -f slot_count=1` 컨펌 후 실행 |

---

## Dependency Graph

```
[Phase A: 기준선 정리 (codex C9)]
    ↓
[Phase B: Schema 보강]
    ↓
[Phase C: 신규 lib 추가] ←─── prompts/agents/*.md (Phase E1)
    ├─ llm.ts (independent)
    ├─ healthcheck.ts (uses fetch)
    ├─ slug.ts (pure)
    ├─ dedup.ts (uses db)
    ├─ factcheck.ts (uses llm)
    ├─ editor.ts (uses llm, factcheck)
    └─ images.ts (uses fetch)
    ↓
[Phase D: 기존 lib 수정 (멀티사이트 + Blogger 2단계)]
    ├─ tokens.ts (independent)
    ├─ wordpress.ts (uses tokens)
    ├─ blogger.ts (uses tokens)
    └─ trends.ts (uses dedup)
    ↓
[Phase E: 페르소나 + dep 정리]
    ├─ prompts/agents/*.md (5 파일)
    ├─ niches/*.yaml env vars
    └─ claude.ts 삭제 + dep 제거
    ↓
[Phase F: CI test workflow]
    ↓
[Phase G: PR5 land]
    ↓
[Phase H: PR6 (별도 plan)]
```

---

## Phase A — 기준선 정리 (codex C9)

### Task A1: 기존 vitest setup 검증 + wordpress invalid platform 제거

**Files:**
- Modify: `tests/schema.test.ts:35` 부근
- Modify: `tests/api-validation.test.ts:95` 부근
- Verify: `package.json` (vitest 이미 있는지)

- [ ] **Step 1: 기존 상태 확인**

```bash
cd ~/projects/content-autopilot
grep -n "wordpress" tests/schema.test.ts tests/api-validation.test.ts
grep -E "vitest|@vitest" package.json
ls vitest.config.* 2>/dev/null
```

Expected: vitest dep 이미 있음, vitest.config.ts 또는 vite.config.ts 존재. wordpress가 invalid platform으로 처리되는 라인 식별.

- [ ] **Step 2: wordpress를 valid platform으로 인정**

기존 `tests/schema.test.ts:35` 부근의 invalid platform 검증에서 `'wordpress'` 또는 `'wordpress_ws'` / `'wordpress_ts'` 제거. valid platform 목록에 추가.

```ts
// tests/schema.test.ts
const validPlatforms = ['wordpress_ws', 'wordpress_ts', 'blogger_as'];
// 'wordpress'를 invalid 목록에서 제거
```

`tests/api-validation.test.ts:95` 부근 동일.

- [ ] **Step 3: vitest 실행 — 기존 테스트 다 통과**

```bash
pnpm vitest run --reporter=verbose
```

Expected: 모든 기존 테스트 PASS. fail이 있으면 추가 드리프트 식별 후 수정.

- [ ] **Step 4: commit**

```bash
git add tests/schema.test.ts tests/api-validation.test.ts
git commit -m "test: 기존 드리프트 정리 — wordpress 멀티사이트 platform valid 인정 (codex C9)"
```

---

## Phase B — Schema 보강

### Task B1: Drizzle migration 0001 — status enum + failure_reason + UNIQUE

**Files:**
- Create: `drizzle/migrations/0001_pr5_schema_boost.sql`
- Modify: `src/lib/schema.ts` (Drizzle schema)

- [ ] **Step 1: schema.ts에 새 컬럼 추가**

```ts
// src/lib/schema.ts (published_posts 테이블에 추가)
status: text('status', { enum: ['published', 'failed'] }).notNull().default('published'),
failure_reason: text('failure_reason'),
draft_json: text('draft_json'),
scheduled_slot: text('scheduled_slot'),  // 'HH:MM' 문자열 ('09:00' 등)
// metadata 컬럼은 이미 있음 (JSONB) — evergreen은 metadata.evergreen으로 저장

// 인덱스
import { uniqueIndex } from 'drizzle-orm/sqlite-core';
// 테이블 정의 끝에:
}, (table) => ({
  uniqueNicheSlug: uniqueIndex('idx_pp_niche_slug').on(table.niche, table.slug),
}));
```

- [ ] **Step 2: migration 생성**

```bash
pnpm drizzle-kit generate
```

생성된 migration이 `0001_*.sql` 형태인지 확인. 파일명 변경: `0001_pr5_schema_boost.sql`.

- [ ] **Step 3: migration 적용 (in-memory) + 검증 테스트**

```ts
// src/lib/__tests__/schema.test.ts
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

describe('0001_pr5_schema_boost', () => {
  it('UNIQUE(niche, slug) constraint 강제', () => {
    const sqlite = new Database(':memory:');
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: './drizzle/migrations' });
    
    sqlite.exec(`INSERT INTO published_posts (niche, slug, title, ...) VALUES ('WS', 'foo', 't', ...)`);
    expect(() => sqlite.exec(`INSERT INTO published_posts (niche, slug, title, ...) VALUES ('WS', 'foo', 't2', ...)`)).toThrow();
  });
  
  it('status enum 강제', () => {
    // status='invalid' INSERT → throw
  });
});
```

- [ ] **Step 4: 테스트 실행**

```bash
pnpm vitest run src/lib/__tests__/schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add drizzle/migrations/0001_pr5_schema_boost.sql src/lib/schema.ts src/lib/__tests__/schema.test.ts
git commit -m "feat(PR5): schema 보강 — status enum, failure_reason, draft_json, scheduled_slot, UNIQUE(niche, slug)"
```

---

## Phase C — 신규 lib 추가 (TDD per file)

### Task C1: lib/llm.ts — claude CLI spawn wrapper

**Files:**
- Create: `src/lib/llm.ts`
- Create: `src/lib/__tests__/llm.test.ts`

- [ ] **Step 1: 테스트 작성**

```ts
// src/lib/__tests__/llm.test.ts
import { describe, it, expect, vi } from 'vitest';
import { callClaude } from '../llm';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('callClaude', () => {
  it('정상 stdout 반환', async () => {
    const { spawn } = await import('node:child_process');
    (spawn as any).mockReturnValue({
      stdout: { on: (e: string, cb: any) => e === 'data' && cb(Buffer.from('hello')) },
      stderr: { on: vi.fn() },
      on: (e: string, cb: any) => e === 'close' && cb(0),
    });
    const result = await callClaude({ systemPrompt: 'sys', userMessage: 'hi' });
    expect(result).toBe('hello');
  });
  
  it('exit code 1 → throw', async () => { /* ... */ });
  it('expectJson + invalid JSON → throw', async () => { /* ... */ });
});
```

- [ ] **Step 2: 테스트 실행 — fail**

```bash
pnpm vitest run src/lib/__tests__/llm.test.ts
```

Expected: FAIL with "callClaude is not defined".

- [ ] **Step 3: lib/llm.ts 구현**

```ts
// src/lib/llm.ts
import { spawn } from 'node:child_process';

export interface CallClaudeOptions {
  systemPrompt: string;
  userMessage: string;
  model?: 'sonnet' | 'opus';  // default 'sonnet' (sonnet-4-6)
  expectJson?: boolean;
}

export async function callClaude(opts: CallClaudeOptions): Promise<string> {
  const model = opts.model ?? 'sonnet';
  return new Promise((resolve, reject) => {
    // claude CLI는 systemPrompt를 stdin으로, userMessage를 -p arg로
    // 또는 prompts를 합쳐서 -p arg로 전달
    const fullPrompt = `${opts.systemPrompt}\n\n---\n\n${opts.userMessage}`;
    const child = spawn('claude', ['-p', fullPrompt, '--dangerously-skip-permissions', '--model', model], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`claude CLI exit ${code}: ${stderr}`));
      if (opts.expectJson) {
        try { JSON.parse(stdout); } catch (e) { return reject(new Error(`invalid JSON: ${e}`)); }
      }
      resolve(stdout.trim());
    });
    child.on('error', reject);
  });
}
```

- [ ] **Step 4: 테스트 PASS 확인**

```bash
pnpm vitest run src/lib/__tests__/llm.test.ts
```

Expected: PASS (모든 케이스).

- [ ] **Step 5: commit**

```bash
git add src/lib/llm.ts src/lib/__tests__/llm.test.ts
git commit -m "feat(PR5): lib/llm.ts — claude CLI spawn wrapper (sonnet-4-6 default)"
```

### Task C2: lib/healthcheck.ts — 6종 ping (claude CLI 추가, codex C4)

**Files:**
- Create: `src/lib/healthcheck.ts`
- Create: `src/lib/__tests__/healthcheck.test.ts`

- [ ] **Step 1: 테스트 작성 — 6종 케이스**

```ts
// src/lib/__tests__/healthcheck.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAll } from '../healthcheck';

beforeEach(() => { vi.restoreAllMocks(); });

describe('healthcheck.runAll', () => {
  it('6종 모두 200 → pass', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as any);
    vi.mock('./llm', () => ({ callClaude: vi.fn().mockResolvedValue('hello') }));
    const report = await runAll();
    expect(report.allPassed).toBe(true);
    expect(report.results).toHaveLength(6);
  });
  
  it('Pexels 401 → fail with 서비스명', async () => { /* ... */ });
  it('claude CLI 호출 fail → fail', async () => { /* ... */ });
  it('timeout → fail', async () => { /* ... */ });
});
```

- [ ] **Step 2: fail 확인**

```bash
pnpm vitest run src/lib/__tests__/healthcheck.test.ts
```

- [ ] **Step 3: lib/healthcheck.ts 구현**

```ts
// src/lib/healthcheck.ts
import { callClaude } from './llm';

interface HealthResult { service: string; ok: boolean; reason?: string; }
export interface HealthReport { allPassed: boolean; results: HealthResult[]; }

const UA = 'blog-autopilot/1.0';

async function pingPixabay(): Promise<HealthResult> {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return { service: 'Pixabay', ok: false, reason: 'PIXABAY_API_KEY missing' };
  try {
    const res = await fetch(`https://pixabay.com/api/?key=${key}&q=test&per_page=3`, { headers: { 'User-Agent': UA } });
    return { service: 'Pixabay', ok: res.ok, reason: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) { return { service: 'Pixabay', ok: false, reason: String(e) }; }
}

async function pingPexels(): Promise<HealthResult> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return { service: 'Pexels', ok: false, reason: 'PEXELS_API_KEY missing' };
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=test&per_page=1`, { 
      headers: { Authorization: key, 'User-Agent': UA }
    });
    return { service: 'Pexels', ok: res.ok, reason: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) { return { service: 'Pexels', ok: false, reason: String(e) }; }
}

async function pingWordPress(niche: 'WS' | 'TS'): Promise<HealthResult> {
  const token = process.env[`WORDPRESS_${niche}_TOKEN`];
  const blogId = process.env[`WORDPRESS_${niche}_BLOG_ID`];
  if (!token || !blogId) return { service: `WP-${niche}`, ok: false, reason: 'env missing' };
  try {
    const res = await fetch(`https://public-api.wordpress.com/rest/v1.1/sites/${blogId}/posts?number=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return { service: `WP-${niche}`, ok: res.ok, reason: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) { return { service: `WP-${niche}`, ok: false, reason: String(e) }; }
}

async function pingBlogger(): Promise<HealthResult> {
  // OAuth refresh + GET /blogs/{id}/posts?maxResults=1
  // ... (구현)
}

async function pingClaudeCli(): Promise<HealthResult> {
  try {
    const res = await callClaude({ systemPrompt: 'You are a healthcheck.', userMessage: 'reply with exactly: OK' });
    return { service: 'claude-cli', ok: res.includes('OK'), reason: res.includes('OK') ? undefined : `unexpected: ${res.slice(0, 50)}` };
  } catch (e) { return { service: 'claude-cli', ok: false, reason: String(e) }; }
}

export async function runAll(): Promise<HealthReport> {
  const results = await Promise.all([
    pingPixabay(), pingPexels(), pingWordPress('WS'), pingWordPress('TS'), pingBlogger(), pingClaudeCli()
  ]);
  return { allPassed: results.every(r => r.ok), results };
}
```

- [ ] **Step 4: 테스트 PASS**

- [ ] **Step 5: commit**

```bash
git add src/lib/healthcheck.ts src/lib/__tests__/healthcheck.test.ts
git commit -m "feat(PR5): lib/healthcheck.ts — 6종 ping (5 외부 서비스 + claude CLI, codex C4)"
```

### Task C3: lib/dedup.ts — 4단계 (slug 영구 + 24h + 7d + evergreen 90d)

**Files:**
- Modify: `src/lib/dedup.ts` (PR4 기본 → 4단계 확장)
- Create: `src/lib/__tests__/dedup.test.ts`

- [ ] **Step 1: 테스트 작성 — 5 케이스**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { checkAndResolve } from '../dedup';
import { publishedPosts } from '../schema';

let db: any;
beforeEach(() => {
  const sqlite = new Database(':memory:');
  db = drizzle(sqlite);
  migrate(db, { migrationsFolder: './drizzle/migrations' });
});

describe('dedup.checkAndResolve', () => {
  it('L1: 같은 slug 영구 차단', async () => {
    await db.insert(publishedPosts).values({ niche: 'WS', slug: 'foo-bar', /* ... */ });
    // 같은 slug 새로 시도 → slug_variant return
    const result = await checkAndResolve(db, { niche: 'WS', keyword: '다른키워드', evergreen: false, proposedSlug: 'foo-bar' });
    expect(result.action).toBe('slug_variant');
  });
  
  it('L2: 24h strict — 트렌드 점수 무시', async () => {
    await db.insert(publishedPosts).values({ 
      niche: 'WS', slug: 'a-b', keyword: '봄나들이', published_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString()
    });
    const result = await checkAndResolve(db, { niche: 'WS', keyword: '봄나들이', evergreen: false, trend: { search_volume_trend: '급상승', priority_score: 95 } });
    expect(result.action).toBe('skip');
  });
  
  it('L3 follow_up: 7d 내 + 급상승 + score≥80 → 후속 글 허용', async () => {
    // ...
    expect(result.action).toBe('follow_up');
    expect(result.suggested_content_type).not.toBe(recent.content_type);
  });
  
  it('L3 skip: 7d 내 + 일반 트렌드 → skip', async () => { /* ... */ });
  
  it('L4: evergreen 키워드 90d strict', async () => {
    await db.insert(publishedPosts).values({
      niche: 'WS', slug: 'c', keyword: '청약통장 만들기',
      metadata: JSON.stringify({ evergreen: true }),
      published_at: new Date(Date.now() - 80 * 24 * 3600 * 1000).toISOString()
    });
    const result = await checkAndResolve(db, { niche: 'WS', keyword: '청약통장 만들기', evergreen: true });
    expect(result.action).toBe('skip');
  });
});
```

- [ ] **Step 2: fail 확인**

- [ ] **Step 3: lib/dedup.ts 구현**

```ts
// src/lib/dedup.ts
import { sql } from 'drizzle-orm';
import { publishedPosts } from './schema';

export interface DedupInput {
  niche: 'WS' | 'TS' | 'AS';
  keyword: string;
  evergreen: boolean;
  proposedSlug?: string;
  trend?: { search_volume_trend: '급상승' | '상승' | '안정'; priority_score: number };
}

export type DedupAction = 'pass' | 'skip' | 'follow_up' | 'slug_variant';

export interface DedupResult {
  action: DedupAction;
  reason: string;
  recent_post?: any;
  suggested_content_type?: string;
  suggested_slug?: string;  // slug_variant 시
}

export async function checkAndResolve(db: any, input: DedupInput): Promise<DedupResult> {
  // L1: slug 영구
  if (input.proposedSlug) {
    const existing = await db.select().from(publishedPosts)
      .where(sql`niche = ${input.niche} AND slug = ${input.proposedSlug}`)
      .limit(1);
    if (existing.length > 0) {
      // suffix 시도 (-2, -3 ...)
      for (let i = 2; i <= 10; i++) {
        const variant = `${input.proposedSlug}-${i}`;
        const dup = await db.select().from(publishedPosts)
          .where(sql`niche = ${input.niche} AND slug = ${variant}`).limit(1);
        if (dup.length === 0) return { action: 'slug_variant', reason: 'slug 영구 차단', suggested_slug: variant };
      }
      return { action: 'skip', reason: 'slug variant 10회 시도 모두 충돌' };
    }
  }
  
  // 가장 최근 같은 keyword 게시물
  const recent = await db.select().from(publishedPosts)
    .where(sql`niche = ${input.niche} AND keyword = ${input.keyword}`)
    .orderBy(sql`published_at DESC`).limit(1);
  
  if (recent.length === 0) return { action: 'pass', reason: '신규 키워드' };
  
  const r = recent[0];
  const hoursPassed = (Date.now() - new Date(r.published_at).getTime()) / 3600 / 1000;
  
  // L4: evergreen 90d strict
  if (input.evergreen && hoursPassed < 90 * 24) {
    return { action: 'skip', reason: 'evergreen 90d window', recent_post: r };
  }
  
  // L2: 24h strict
  if (hoursPassed < 24) {
    return { action: 'skip', reason: '24h strict window', recent_post: r };
  }
  
  // L3: 7d loose with 트렌드 override
  if (hoursPassed < 7 * 24) {
    if (input.trend?.search_volume_trend === '급상승' && input.trend.priority_score >= 80) {
      // content_type 차별화
      const oldType = (r.metadata && JSON.parse(r.metadata).content_type) ?? '정보형';
      const types = ['정보형', 'how-to', '비교형', '리스트형', '뉴스형'];
      const newType = types.find(t => t !== oldType) ?? 'how-to';
      return { action: 'follow_up', reason: '급상승+priority≥80 후속 허용', recent_post: r, suggested_content_type: newType };
    }
    return { action: 'skip', reason: '7d window, 트렌드 강도 부족', recent_post: r };
  }
  
  // 7d 이후 자유
  return { action: 'pass', reason: '7d window 만료' };
}
```

- [ ] **Step 4: 테스트 PASS**

- [ ] **Step 5: commit**

```bash
git add src/lib/dedup.ts src/lib/__tests__/dedup.test.ts
git commit -m "feat(PR5): lib/dedup.ts — 4단계 (slug 영구 + 24h strict + 7d loose with 트렌드 override + evergreen 90d)"
```

### Task C4: lib/slug.ts

**Files:**
- Create: `src/lib/slug.ts`
- Create: `src/lib/__tests__/slug.test.ts`

- [ ] **Step 1: 테스트 작성**

```ts
import { describe, it, expect } from 'vitest';
import { makeSlug, resolveBatchCollisions } from '../slug';

describe('makeSlug', () => {
  it('한글 제목 → 영문 slug', () => {
    expect(makeSlug('봄나들이 좋은 명소 5곳')).toMatch(/[a-z0-9-]+/);
  });
  it('특수문자·이모지 제거', () => {
    expect(makeSlug('★ Hot 키워드 🔥')).not.toMatch(/[★🔥]/);
  });
  it('소문자 + 하이픈', () => { /* ... */ });
});

describe('resolveBatchCollisions', () => {
  it('같은 slug 2개 → 두 번째에 -2 suffix', () => {
    const result = resolveBatchCollisions(['foo-bar', 'foo-bar', 'baz']);
    expect(result).toEqual(['foo-bar', 'foo-bar-2', 'baz']);
  });
  it('3개 같으면 -2, -3', () => {
    expect(resolveBatchCollisions(['a', 'a', 'a'])).toEqual(['a', 'a-2', 'a-3']);
  });
});
```

- [ ] **Step 2: fail 확인**

- [ ] **Step 3: 구현**

```ts
// src/lib/slug.ts
import slugify from 'slugify';  // npm i slugify (이미 있을 수 있음, 확인)

export function makeSlug(title: string): string {
  return slugify(title, { lower: true, strict: true, trim: true });
}

export function resolveBatchCollisions(slugs: string[]): string[] {
  const seen = new Set<string>();
  return slugs.map(slug => {
    let candidate = slug;
    let i = 2;
    while (seen.has(candidate)) {
      candidate = `${slug}-${i}`;
      i++;
    }
    seen.add(candidate);
    return candidate;
  });
}
```

- [ ] **Step 4: 테스트 PASS**

- [ ] **Step 5: commit**

```bash
git add src/lib/slug.ts src/lib/__tests__/slug.test.ts package.json
git commit -m "feat(PR5): lib/slug.ts — slug 생성 + batch 충돌 자동 변형"
```

### Task C5: lib/factcheck.ts — YMYL 사실 검증 (codex C1)

**Files:**
- Create: `src/lib/factcheck.ts`
- Create: `src/lib/__tests__/factcheck.test.ts`
- Create: `prompts/agents/fact-checker.md` (또는 editor.md에 통합)

- [ ] **Step 1: 페르소나 prompt 작성**

```bash
cat > prompts/agents/fact-checker.md <<'EOF'
You are the Fact Checker — YMYL (Your Money Your Life) 콘텐츠 검증.

대상: WS (의료·건강), AS (부동산·금융) niche 글.

검증:
1. **출처 명시**: 통계·수치·정책·법령 인용 시 source URL 또는 발행 기관 명시 강제
2. **정책 최신성**: 부동산 정책·세법·의료 가이드라인이 2026 기준인지 확인
3. **면책 문구**: "이 글은 정보 제공 목적이며, 전문 의료/법률/세무 상담을 대체하지 않습니다." 자동 삽입 (없으면 추가)
4. **금지 표현**: 진단·처방·치료 약속, 수익 보장, 절세 보장 등 단정 표현 검출

Output JSON:
{
  "verdict": "pass" | "needs_revision",
  "issues": [{"type": "source|recency|disclaimer|forbidden", "description": "...", "suggested_fix": "..."}],
  "disclaimer_added": true | false,
  "modified_html": "..." (disclaimer 추가된 결과 HTML, 있을 때)
}
EOF
```

- [ ] **Step 2: 테스트 작성**

```ts
import { describe, it, expect, vi } from 'vitest';
import { factcheck } from '../factcheck';

vi.mock('./llm', () => ({ callClaude: vi.fn() }));

describe('factcheck', () => {
  it('WS niche — 통과 시 verdict=pass', async () => {
    const { callClaude } = await import('../llm');
    (callClaude as any).mockResolvedValue(JSON.stringify({ verdict: 'pass', issues: [], disclaimer_added: false }));
    const result = await factcheck({ niche: 'WS', draft: { content_html: '...' } });
    expect(result.verdict).toBe('pass');
  });
  
  it('AS niche — 면책 누락 시 자동 삽입', async () => {
    /* ... */
    expect(result.disclaimer_added).toBe(true);
    expect(result.modified_html).toContain('정보 제공 목적');
  });
  
  it('TS niche — skip (YMYL 아님)', async () => {
    const result = await factcheck({ niche: 'TS', draft: { content_html: '...' } });
    expect(result.verdict).toBe('skipped');
  });
});
```

- [ ] **Step 3: fail 확인**

- [ ] **Step 4: 구현**

```ts
// src/lib/factcheck.ts
import { callClaude } from './llm';
import fs from 'node:fs';
import path from 'node:path';

const PROMPT_PATH = path.join(process.cwd(), 'prompts/agents/fact-checker.md');
const PROMPT = fs.readFileSync(PROMPT_PATH, 'utf-8');

export interface FactCheckInput {
  niche: 'WS' | 'TS' | 'AS';
  draft: { content_html: string; title: string; keyword: string };
}

export interface FactCheckResult {
  verdict: 'pass' | 'needs_revision' | 'skipped';
  issues?: Array<{ type: string; description: string; suggested_fix: string }>;
  disclaimer_added?: boolean;
  modified_html?: string;
}

export async function factcheck(input: FactCheckInput): Promise<FactCheckResult> {
  if (input.niche === 'TS') return { verdict: 'skipped' };  // YMYL 아님
  
  const userMessage = JSON.stringify({
    niche: input.niche,
    title: input.draft.title,
    keyword: input.draft.keyword,
    content_html: input.draft.content_html,
  });
  
  const raw = await callClaude({
    systemPrompt: PROMPT,
    userMessage,
    expectJson: true,
  });
  
  return JSON.parse(raw);
}
```

- [ ] **Step 5: 테스트 PASS + commit**

```bash
git add src/lib/factcheck.ts src/lib/__tests__/factcheck.test.ts prompts/agents/fact-checker.md
git commit -m "feat(PR5): lib/factcheck.ts — YMYL 사실 검증 (WS/AS, codex C1)"
```

### Task C6: lib/editor.ts — QA gate + revision feedback

**Files:**
- Create: `src/lib/editor.ts`
- Create: `src/lib/__tests__/editor.test.ts`

- [ ] **Step 1: 테스트 작성**

```ts
describe('editor.review', () => {
  it('word_count ≥ 1200 + image_slots ≥ 2 → pass', async () => { /* ... */ });
  it('word_count < 1200 → revision_needed + feedback', async () => {
    const result = await review({ word_count: 800, image_slots: [...], ...});
    expect(result.verdict).toBe('revision_needed');
    expect(result.feedback).toContain('1200');
  });
  it('WS niche → factcheck 호출', async () => { /* ... */ });
  it('factcheck needs_revision → editor revision_needed', async () => { /* ... */ });
});
```

- [ ] **Step 2-5**: 구현 + 테스트 + commit (편의상 압축)

```ts
// src/lib/editor.ts (skeleton)
import { callClaude } from './llm';
import { factcheck } from './factcheck';
import fs from 'node:fs';
import path from 'node:path';

const PROMPT = fs.readFileSync(path.join(process.cwd(), 'prompts/agents/content-editor.md'), 'utf-8');

export async function review(draft: any, niche: 'WS' | 'TS' | 'AS') {
  // 1. 정량 검증 (word_count, image_slots count, FAQ 존재 등)
  const issues: string[] = [];
  if (draft.word_count < 1200) issues.push('word_count < 1200, 더 길게 써야 함');
  if (!draft.image_slots || draft.image_slots.length < 2) issues.push('image_slots 최소 2개 필요');
  // ...
  
  // 2. WS/AS면 factcheck
  if (niche === 'WS' || niche === 'AS') {
    const fc = await factcheck({ niche, draft });
    if (fc.verdict === 'needs_revision') {
      issues.push(`factcheck: ${fc.issues?.map(i => i.description).join('; ')}`);
    }
    // disclaimer 자동 삽입은 fc.modified_html을 draft에 반영
    if (fc.disclaimer_added && fc.modified_html) draft.content_html = fc.modified_html;
  }
  
  // 3. LLM-based 정성 검증 (톤·구조·CTA)
  const llmReview = await callClaude({
    systemPrompt: PROMPT,
    userMessage: JSON.stringify(draft),
    expectJson: true,
  });
  const llmResult = JSON.parse(llmReview);
  
  if (issues.length > 0 || llmResult.verdict === 'revision_needed') {
    return {
      verdict: 'revision_needed' as const,
      score: llmResult.score ?? 60,
      reason: issues.join('; ') + (llmResult.reason ? ` / ${llmResult.reason}` : ''),
      feedback: issues.join('\n') + '\n' + (llmResult.feedback ?? ''),
    };
  }
  return { verdict: 'pass' as const, score: llmResult.score ?? 85 };
}
```

```bash
git add src/lib/editor.ts src/lib/__tests__/editor.test.ts
git commit -m "feat(PR5): lib/editor.ts — QA gate (정량 + factcheck + LLM 정성) + revision feedback"
```

### Task C7: lib/images.ts — Pexels → Pixabay → placeholder

**Files:**
- Create: `src/lib/images.ts`
- Create: `src/lib/__tests__/images.test.ts`

- [ ] **Steps 1-5**: 테스트 → 구현 → 테스트 → commit (요약)

```ts
// src/lib/images.ts (skeleton)
const UA = 'blog-autopilot/1.0';

export interface ImageSlot { slot_id: string; search_query: string; alt_text: string; }
export interface ImageResult {
  slot_id: string;
  image_url: string;
  photographer: string | null;
  source: 'pexels' | 'pixabay' | 'placeholder';
  alt_text: string;
}

async function tryPexels(query: string): Promise<{ url: string; photographer: string } | null> {
  const key = process.env.PEXELS_API_KEY!;
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3`, {
    headers: { Authorization: key, 'User-Agent': UA }
  });
  if (!res.ok) return null;
  const data = await res.json() as any;
  if (!data.photos?.length) return null;
  const p = data.photos[0];
  return { url: p.src.large, photographer: p.photographer };
}

async function tryPixabay(query: string) { /* ... 동일 패턴 */ }

const PLACEHOLDER_URL = 'https://via.placeholder.com/1200x630.png?text=No+Image';

export async function fetchForSlots(slots: ImageSlot[]): Promise<ImageResult[]> {
  return Promise.all(slots.map(async (slot) => {
    const pexels = await tryPexels(slot.search_query);
    if (pexels) return { slot_id: slot.slot_id, image_url: pexels.url, photographer: pexels.photographer, source: 'pexels', alt_text: slot.alt_text };
    const pixabay = await tryPixabay(slot.search_query);
    if (pixabay) return { slot_id: slot.slot_id, image_url: pixabay.url, photographer: pixabay.photographer, source: 'pixabay', alt_text: slot.alt_text };
    return { slot_id: slot.slot_id, image_url: PLACEHOLDER_URL, photographer: null, source: 'placeholder', alt_text: slot.alt_text };
  }));
}
```

```bash
git commit -m "feat(PR5): lib/images.ts — Pexels → Pixabay → placeholder fallback (UA 헤더 필수)"
```

---

## Phase D — 기존 lib 수정 (멀티사이트 + Blogger 2단계, codex C2/C3)

### Task D1: lib/tokens.ts — niche별 토큰 라우팅 (codex C2)

**Files:**
- Modify: `src/lib/tokens.ts`
- Modify: `src/lib/__tests__/tokens.test.ts` (또는 신규)

- [ ] **Step 1: 테스트 작성**

```ts
describe('getWordPressToken', () => {
  it('WS niche → WORDPRESS_WS_TOKEN + WORDPRESS_WS_BLOG_ID', () => {
    process.env.WORDPRESS_WS_TOKEN = 'ws-token';
    process.env.WORDPRESS_WS_BLOG_ID = '253891859';
    const result = getWordPressToken('WS');
    expect(result).toEqual({ token: 'ws-token', blogId: '253891859' });
  });
  it('TS niche → WORDPRESS_TS_TOKEN + WORDPRESS_TS_BLOG_ID', () => { /* ... */ });
  it('env missing → throw', () => { /* ... */ });
});

describe('getBloggerCredentials', () => {
  it('AS niche → BLOGGER_AS_REFRESH_TOKEN + BLOGGER_AS_BLOG_ID', () => { /* ... */ });
});
```

- [ ] **Steps 2-5**: 구현 + 테스트 + commit

```ts
// src/lib/tokens.ts (추가)
export function getWordPressToken(niche: 'WS' | 'TS'): { token: string; blogId: string } {
  const token = process.env[`WORDPRESS_${niche}_TOKEN`];
  const blogId = process.env[`WORDPRESS_${niche}_BLOG_ID`];
  if (!token || !blogId) throw new Error(`WordPress ${niche} credentials missing`);
  return { token, blogId };
}

export function getBloggerCredentials(niche: 'AS'): { refreshToken: string; blogId: string; clientId: string; clientSecret: string } {
  const refreshToken = process.env[`BLOGGER_${niche}_REFRESH_TOKEN`];
  const blogId = process.env[`BLOGGER_${niche}_BLOG_ID`];
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!refreshToken || !blogId || !clientId || !clientSecret) throw new Error(`Blogger ${niche} credentials missing`);
  return { refreshToken, blogId, clientId, clientSecret };
}
```

```bash
git commit -m "feat(PR5): lib/tokens.ts — niche별 토큰 라우팅 (멀티사이트 OAuth, codex C2)"
```

### Task D2: lib/wordpress.ts — 멀티사이트 publishScheduled (status=future, codex C3)

**Files:**
- Modify: `src/lib/wordpress.ts`
- Modify: `src/lib/__tests__/wordpress.test.ts`

- [ ] **Steps 1-5**:

```ts
// src/lib/wordpress.ts (추가/교체)
import { getWordPressToken } from './tokens';

export interface WPScheduledPost {
  title: string;
  content: string;  // HTML
  slug: string;
  excerpt?: string;
  categories?: string[];
  tags?: string[];
}

export async function publishScheduled(
  niche: 'WS' | 'TS',
  post: WPScheduledPost,
  scheduledFor: Date  // KST 09:00 등을 UTC ISO timestamp로 변환해서 전달
): Promise<{ externalId: string; externalUrl: string; scheduledAt: string }> {
  const { token, blogId } = getWordPressToken(niche);
  
  const body = {
    title: post.title,
    content: post.content,
    slug: post.slug,
    status: 'future',  // WordPress.com 1단계 스케줄
    date: scheduledFor.toISOString(),  // ISO 8601 UTC
    excerpt: post.excerpt,
    categories: post.categories,
    tags: post.tags,
  };
  
  // retry 3 with exp backoff (1s, 2s, 4s)
  let lastErr: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://public-api.wordpress.com/rest/v1.1/sites/${blogId}/posts/new`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`WP-${niche} HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json() as any;
      return { externalId: String(data.ID), externalUrl: data.URL, scheduledAt: data.date };
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}
```

```bash
git commit -m "feat(PR5): lib/wordpress.ts — 멀티사이트 publishScheduled (status=future + retry exp backoff, codex C2/C3)"
```

### Task D3: lib/blogger.ts — 2단계 발행 (codex C3)

**Files:**
- Modify: `src/lib/blogger.ts`
- Modify: `src/lib/__tests__/blogger.test.ts`

- [ ] **Steps 1-5**:

```ts
// src/lib/blogger.ts (Blogger 2단계: posts.insert draft → posts.publish with publishDate)
import { getBloggerCredentials } from './tokens';

async function getAccessToken(niche: 'AS'): Promise<string> {
  const { refreshToken, clientId, clientSecret } = getBloggerCredentials(niche);
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
  if (!res.ok) throw new Error(`Blogger token refresh fail: ${res.status}`);
  const data = await res.json() as any;
  return data.access_token;
}

export async function publishScheduled(
  niche: 'AS',
  post: { title: string; content: string; labels?: string[] },
  scheduledFor: Date
): Promise<{ externalId: string; externalUrl: string; scheduledAt: string }> {
  const { blogId } = getBloggerCredentials(niche);
  const accessToken = await getAccessToken(niche);
  
  // Step 1: draft 생성 (isDraft=true)
  const draftRes = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?isDraft=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: post.title, content: post.content, labels: post.labels }),
  });
  if (!draftRes.ok) throw new Error(`Blogger draft fail: ${draftRes.status}`);
  const draft = await draftRes.json() as any;
  
  // Step 2: publish with publishDate (예약 발행)
  const pubRes = await fetch(
    `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${draft.id}/publish?publishDate=${encodeURIComponent(scheduledFor.toISOString())}`,
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!pubRes.ok) throw new Error(`Blogger publish fail: ${pubRes.status}`);
  const published = await pubRes.json() as any;
  
  return { externalId: published.id, externalUrl: published.url, scheduledAt: published.published };
}
```

```bash
git commit -m "feat(PR5): lib/blogger.ts — 2단계 발행 (draft → publish with publishDate, codex C3)"
```

### Task D4: lib/trends.ts — 큐 5개 + evergreen flag

**Files:**
- Modify: `src/lib/trends.ts`
- Modify: `src/lib/__tests__/trends.test.ts`

- [ ] **Steps 1-5**:

기존 `pickQueue` 함수 시그니처 변경:

```ts
// src/lib/trends.ts (확장)
export interface KeywordCandidate {
  keyword: string;
  category: string;
  content_type: '정보형' | 'how-to' | '비교형' | '리스트형' | '뉴스형';
  search_volume_trend: '급상승' | '상승' | '안정';
  priority_score: number;
  evergreen: boolean;  // ← 신규 필드
  image_keywords: string[];
}

export async function pickQueue(niche: 'WS' | 'TS' | 'AS', count = 5): Promise<KeywordCandidate[]> {
  // Trend Hunter prompt 호출 (prompts/agents/trend-hunter.md)
  // niche별 niches/*.yaml 시드 + Google Trends RSS + 시즌 캘린더 boost
  // ... 기존 로직 + evergreen 필드 추가 (LLM이 판단)
}
```

```bash
git commit -m "feat(PR5): lib/trends.ts — 큐 크기 5 + evergreen flag (LLM 판단)"
```

---

## Phase E — 페르소나 + dep 정리

### Task E1: prompts/agents/*.md 5개 paperclip 복사

**Files:**
- Create: `prompts/agents/{trend-hunter,content-writer,content-editor,image-curator,publisher}.md`

- [ ] **Step 1: paperclip AGENTS.md 5개 복사**

```bash
mkdir -p ~/projects/content-autopilot/prompts/agents
for agent in trend-hunter content-writer content-editor image-curator publisher; do
  cp ~/projects/company-package/agents/$agent/AGENTS.md ~/projects/content-autopilot/prompts/agents/$agent.md
done
ls ~/projects/content-autopilot/prompts/agents/
```

Expected: 5 파일 생성됨.

- [ ] **Step 2: commit**

```bash
git add prompts/agents/
git commit -m "feat(PR5): paperclip 5 페르소나 복사 (trend-hunter/content-writer/content-editor/image-curator/publisher)"
```

### Task E2: niches/*.yaml env vars 보강 (codex C2)

**Files:**
- Modify: `niches/worldsignal.yaml` (`WORDPRESS_WS_*`)
- Modify: `niches/travelsignal.yaml` (`WORDPRESS_TS_*`)
- Modify: `niches/aptsignal.yaml` (`BLOGGER_AS_*`)

- [ ] **Step 1**: 각 yaml에 `env_vars` 섹션 추가 또는 기존 키 명명 정리

```yaml
# niches/worldsignal.yaml에 추가/정리
platform:
  type: wordpress
  env_prefix: WORDPRESS_WS  # → WORDPRESS_WS_TOKEN, WORDPRESS_WS_BLOG_ID
  blog_id_env: WORDPRESS_WS_BLOG_ID
  token_env: WORDPRESS_WS_TOKEN
```

(travelsignal.yaml, aptsignal.yaml 동일 패턴)

- [ ] **Step 2: .env.local 키 이름 검증** (실제 .env.local에 이 키들이 있는지 확인)

```bash
grep -E "WORDPRESS_WS|WORDPRESS_TS|BLOGGER_AS" .env.local | head -5
```

기존 키 이름이 다르면 .env.local + niches yaml 동시 정렬.

- [ ] **Step 3: commit**

```bash
git commit -m "feat(PR5): niches/*.yaml env_vars 표준화 (멀티사이트 토큰 라우팅, codex C2)"
```

### Task E3: lib/claude.ts 삭제 + @anthropic-ai/sdk dep 제거 (D5)

**Files:**
- Delete: `src/lib/claude.ts`
- Modify: `package.json` (`@anthropic-ai/sdk` 제거)

- [ ] **Step 1: 사용처 0건 재확인**

```bash
grep -rln "from.*['\"].*claude['\"]" src/ scripts/ tests/ 2>/dev/null
```

Expected: 0건.

- [ ] **Step 2: 삭제 + dep 제거**

```bash
git rm src/lib/claude.ts
pnpm remove @anthropic-ai/sdk
```

- [ ] **Step 3: vitest 전체 통과 재확인**

```bash
pnpm vitest run
```

Expected: 모두 PASS.

- [ ] **Step 4: commit**

```bash
git add -u
git commit -m "chore(PR5): lib/claude.ts 삭제 + @anthropic-ai/sdk dep 제거 (D5, dead code)"
```

---

## Phase F — CI test workflow

### Task F1: .github/workflows/test.yml

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: workflow yaml 작성**

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm vitest run --coverage
      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/
```

- [ ] **Step 2: 로컬에서 실행 검증**

```bash
pnpm vitest run --coverage
```

Expected: 모두 PASS, coverage 80%+.

- [ ] **Step 3: commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci(PR5): vitest CI workflow (외부 API 0, ubuntu-latest, coverage)"
```

---

## Phase G — PR5 마무리

### Task G1: PR5 PR 작성

- [ ] **Step 1: 브랜치 push**

```bash
git push -u origin pr5-pr6-llm-pipeline
```

- [ ] **Step 2: PR 생성**

```bash
gh pr create --title "feat: PR5 — lib + 테스트 (claude CLI + 멀티사이트 + Blogger 2단계 + factcheck + 4단계 dedup)" \
  --body "$(cat <<'EOF'
## Summary
- 신규 lib 7개: llm.ts, healthcheck.ts (6종 ping), dedup.ts (4단계), slug.ts, factcheck.ts (YMYL), editor.ts, images.ts
- 기존 lib 수정 4개: wordpress.ts (멀티사이트 + status=future), blogger.ts (2단계 발행), tokens.ts (niche 라우팅), trends.ts (큐 5 + evergreen)
- 페르소나: paperclip 5개 (trend-hunter/content-writer/content-editor/image-curator/publisher) + factcheck.md
- Schema: published_posts에 status enum + failure_reason + draft_json + scheduled_slot + UNIQUE(niche, slug)
- claude.ts dead code 제거 + @anthropic-ai/sdk dep 제거
- 기준선 정리: vitest setup + wordpress invalid platform fix
- CI: .github/workflows/test.yml (외부 API 0)

## Spec
- design spec: docs/superpowers/specs/2026-04-26-blog-autopilot-pr5-pr6-design.md
- implementation plan: docs/superpowers/plans/2026-04-26-blog-autopilot-pr5-pr6.md
- C 풀 코스: brainstorming + plan-eng-review + codex outside voice 모두 통과 (16 결정 통합)

## Test plan
- [ ] CI vitest workflow green (lib 80% coverage)
- [ ] 통합 시나리오 7+1=8개 PASS (golden + revision + reject + skip + healthcheck fail + placeholder + slug 충돌 + 큐 exhausted)
- [ ] 외부 영향 0 — 발행은 PR6에서

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3**: PR URL 반환, review 요청

### Task G2: PR5 review + land

- [ ] CI green 대기
- [ ] `/gstack-review` 실행 또는 사용자 직접 검토
- [ ] approve 후 `gh pr merge --squash`

---

## Phase H — PR6 (high-level outline, PR5 land 후 별도 plan 작성)

### Task H1: scripts/auto-publish.ts (오케스트레이터)

**핵심 로직**:
1. `healthcheck.runAll()` — fail 시 `process.exit(2)` (workflow ❌)
2. `trends.pickQueue` × 3 niche
3. 9 슬롯 sequential — dedup → writer (revision 2회) → editor (factcheck 포함) → images → batch slug 변형 → publisher
4. DB INSERT (status='published' 또는 'failed')
5. DB 백업 (`cp content-autopilot.db ~/backups/blog-autopilot-YYYYMMDD.db` + 30일 retention)
6. exit policy: 폐기 비율 ≥50% 시 `exit 1` (workflow ❌), 그 외 `exit 0`
7. 통합 테스트 #8 (큐 exhausted) 포함

### Task H2: .github/workflows/auto-publish.yml

```yaml
name: Auto-publish

on:
  schedule: [{ cron: '17 1 * * *' }]
  workflow_dispatch:
    inputs:
      niche: { type: choice, options: [all, WS, TS, AS], default: all }
      slot_count: { type: string, default: '3' }
      mode: { type: choice, options: [normal, healthcheck-only], default: normal }

jobs:
  publish:
    runs-on: self-hosted
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm tsx scripts/auto-publish.ts --niche="${{ inputs.niche || 'all' }}" --slot-count="${{ inputs.slot_count || '3' }}" --mode="${{ inputs.mode || 'normal' }}"
        env:
          PIXABAY_API_KEY: ${{ secrets.PIXABAY_API_KEY }}
          # ... 모든 secrets
```

### Task H3: docs/runner-setup.md

- self-hosted runner 등록 (gh + token)
- LaunchAgent yaml 명세 (KeepAlive, RunAtLoad)
- pmset wake schedule: `sudo pmset repeat wake MTWRFSU 01:10:00`
- claude OAuth 셋업 (CLI `claude login`)

### Task H4: smoke test 절차 + 사용자 컨펌

```bash
# 1. runner 등록 확인
gh api repos/kkyu92/blog-autopilot/actions/runners | jq

# 2. healthcheck only
gh workflow run auto-publish.yml -f mode=healthcheck-only

# 3. 1건 smoke (사용자 컨펌 후)
gh workflow run auto-publish.yml -f niche=WS -f slot_count=1
```

### Task H5: PR6 PR 작성 + review + land

PR5 land 후 별도 detailed plan 추가 작성 시점에 step별 명세.

---

## Phase 1.5 backlog (별도 PR, PR5/PR6 land 후)

| # | 항목 | 사유 |
|---|---|---|
| C6 | 큐 재보충 로직 (5개 모두 dedup skip 시 추가 fetch) | trend subsystem 개편 일부 |
| C7 | Trend subsystem 신규 구축 (sns_topics, naver_realtime_search, 국토부_보도자료, 한국부동산원_시세, seasonal boost, evergreen 분류, category balancing) | paperclip 22일 검증 패턴 보존, 큰 변경 |

## Phase 2 backlog

| 항목 | 사유 |
|---|---|
| C8 reconciliation job (예약 발행 후 플랫폼 측 취소·실패·지연 동기화) | 운영 데이터 누적 후 |
| AdSense 수익 모니터링 | WP/Blogger 어드민 native 활용 |
| DB 백업 cloud upload | PR5 로컬 백업 1차로 충분 |
| Emergency unpublish 자동화 | 사람 수동 |
| 페르소나 A/B testing | 운영 데이터 보고 |
| WordPress 401 토큰 자동 갱신 | 헬스체크 통합 필요 |
| publisher 5xx 30분 후 단발 재시도 | 코드 복잡도 |
| repository_dispatch (Playbook hub 통합) | PLAN_v2 §3.6 |

---

## 검증 체크포인트

### PR5 land 전 (CI + 로컬)
- [ ] `pnpm vitest run --coverage` → lib/ 80%+ coverage, 모두 PASS
- [ ] CI workflow `.github/workflows/test.yml` green
- [ ] dead code 0건 (`grep -rln "from.*claude.ts"` empty)
- [ ] schema 마이그레이션 in-memory 검증 PASS

### PR6 land 전 (smoke)
- [ ] self-hosted runner online
- [ ] healthcheck-only workflow ✅
- [ ] 1건 smoke 발행 → WordPress/Blogger 사이트 노출 확인 + DB row INSERT 확인
- [ ] 다음날 cron 01:17 자동 발화 확인 (1주 관찰)

### 운영 안정성 검증 (PR6 land 후 1주)
- [ ] 매일 9건 중 fail 비율 < 30%
- [ ] silent fail 0건 (모든 fail은 GitHub Issue 생성)
- [ ] DB 백업 30일 retention 자동 작동
- [ ] pmset wake schedule 5일 연속 작동
