# blog-autopilot PR6 (auto-publish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR5 lib들을 묶어 cron 발화 가능한 `scripts/auto-publish.ts` 오케스트레이터 + GitHub Actions self-hosted workflow를 구축. 매일 01:17 KST에 3 niche × 3 slot = 9개 글을 WordPress/Blogger에 예약 발행.

**Architecture:**
- 단일 진입점 `scripts/auto-publish.ts` — healthcheck → trends → 9-slot sequential loop → DB INSERT → batch summary → DB 백업 → exit policy
- `.github/workflows/auto-publish.yml` — `schedule: '17 1 * * *'` + `workflow_dispatch` (niche/slot_count/mode inputs) + `runs-on: self-hosted`
- 단위 테스트는 PR5에 모두 있음 (367/367). PR6는 **통합 테스트 7 시나리오**로 오케스트레이터 검증
- 슬롯 간 격리: throw → catch → DB INSERT(failed) + dispatch issue → continue. 다른 슬롯 영향 0

**Tech Stack:**
- TypeScript + tsx (`pnpm tsx scripts/auto-publish.ts`)
- vitest + better-sqlite3 `:memory:` (통합 테스트)
- GitHub Actions self-hosted runner (Mac mini, LaunchAgent + pmset wake)
- claude CLI (PR5 `lib/llm.ts` 통해 spawn)

---

## File Structure

| 파일 | Action | 책임 |
|---|---|---|
| `scripts/auto-publish.ts` | Create | 오케스트레이터. CLI args, healthcheck, niche loop, 슬롯 sequential 처리, DB INSERT, 백업, exit policy |
| `scripts/__tests__/auto-publish.test.ts` | Create | 7 통합 시나리오. lib mock으로 검증 |
| `.github/workflows/auto-publish.yml` | Create | cron schedule + workflow_dispatch + self-hosted runner + secrets injection |
| `docs/runner-setup.md` | Create | self-hosted runner 등록 (gh + token), LaunchAgent yaml, pmset wake schedule, claude OAuth 셋업 |
| `docs/smoke-test.md` | Create | smoke test 절차 (사용자 컨펌 단계 포함) |
| `.gitignore` | Modify | `coverage/` 추가 |
| `package.json` | Modify | `tsx` devDep 추가 (이미 있으면 skip) |

**Spec coverage:**
- spec §5 PR6 — Workflow → H1 (auto-publish.ts), H8 (workflow.yml), H9 (runner-setup.md)
- spec §6 Data Flow → H2-H7 (각 단계 구현)
- spec §7 Error Handling → H7 (error path)
- spec §8 Testing — 통합 시나리오 7개 → H10
- spec §8 Smoke test → H11 (smoke-test.md)

---

## Dependency Graph

```
H1 (skeleton + CLI args)
   ↓
H2 (healthcheck) ──────────────────┐
   ↓                               │
H3 (trends → niche 큐)             │
   ↓                               │
H4 (9-slot loop + dedup)           │
   ↓                               │
H5 (writer-editor revision loop)   │
   ↓                               │  PR5 lib 의존
H6 (images + slot time)            │
   ↓                               │
H7 (publisher + DB INSERT)         │
   ↓                               │
H8 (error path)                    │
   ↓                               │
H9 (summary + backup + exit) ──────┘
   ↓
H10 (7 통합 시나리오 테스트) ← H1-H9 모두 끝나야 의미 있음
   ↓
H11 (workflow yaml)
   ↓
H12 (runner-setup.md)
   ↓
H13 (smoke-test.md)
   ↓
H14 (PR + review + land)
```

---

## Phase H — PR6 Auto-publish Orchestrator

### Task H1: scripts/auto-publish.ts 골격

**Files:**
- Create: `scripts/auto-publish.ts`

**의도:** CLI args parsing (`--niche`, `--slot-count`, `--mode`), 환경변수 로드, exit code 정의. healthcheck/loop는 후속 task에서 추가.

- [ ] **Step 1: 빈 entry point + CLI args 파싱**

```typescript
// scripts/auto-publish.ts
import { parseArgs } from 'node:util';

type Niche = 'WS' | 'TS' | 'AS';
type Mode = 'normal' | 'healthcheck-only';

interface CliArgs {
  niches: Niche[];
  slotCount: number;
  mode: Mode;
}

function parseCliArgs(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv.slice(2),
    options: {
      niche: { type: 'string', default: 'all' },
      'slot-count': { type: 'string', default: '3' },
      mode: { type: 'string', default: 'normal' },
    },
  });

  const nicheArg = values.niche as string;
  const niches: Niche[] = nicheArg === 'all'
    ? ['WS', 'TS', 'AS']
    : (nicheArg.split(',') as Niche[]);

  for (const n of niches) {
    if (!['WS', 'TS', 'AS'].includes(n)) {
      throw new Error(`Invalid niche: ${n}`);
    }
  }

  const slotCount = parseInt(values['slot-count'] as string, 10);
  if (isNaN(slotCount) || slotCount < 1 || slotCount > 10) {
    throw new Error(`Invalid slot-count: ${values['slot-count']}`);
  }

  const mode = values.mode as Mode;
  if (!['normal', 'healthcheck-only'].includes(mode)) {
    throw new Error(`Invalid mode: ${mode}`);
  }

  return { niches, slotCount, mode };
}

async function main(): Promise<number> {
  const args = parseCliArgs(process.argv);
  console.log(`[auto-publish] start mode=${args.mode} niches=${args.niches.join(',')} slotCount=${args.slotCount}`);
  // healthcheck/loop는 H2 이후 task에서 추가
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('[auto-publish] fatal:', err);
    process.exit(3);
  }
);
```

- [ ] **Step 2: smoke 실행으로 args 파싱 확인**

Run: `pnpm tsx scripts/auto-publish.ts --niche=WS --slot-count=1 --mode=healthcheck-only`
Expected: `[auto-publish] start mode=healthcheck-only niches=WS slotCount=1` 출력 후 exit 0

Run: `pnpm tsx scripts/auto-publish.ts --niche=invalid`
Expected: `[auto-publish] fatal: Error: Invalid niche: invalid` + exit 3

- [ ] **Step 3: tsx devDep 확인**

Run: `pnpm list tsx 2>&1 | grep tsx`
없으면: `pnpm add -D tsx`

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-publish.ts package.json pnpm-lock.yaml
git commit -m "feat(PR6): auto-publish.ts 골격 + CLI args 파싱 (H1)"
```

---

### Task H2: healthcheck integration

**Files:**
- Modify: `scripts/auto-publish.ts`

**의도:** `runHealthcheck()` 호출. fail 시 exit 2 (workflow ❌). `mode='healthcheck-only'` 시 healthcheck만 돌리고 exit 0.

- [ ] **Step 1: healthcheck 호출 추가**

`scripts/auto-publish.ts`의 `main()`을 수정:

```typescript
import { runHealthcheck } from '../src/lib/healthcheck';
// ... (기존 imports)

async function main(): Promise<number> {
  const args = parseCliArgs(process.argv);
  console.log(`[auto-publish] start mode=${args.mode} niches=${args.niches.join(',')} slotCount=${args.slotCount}`);

  // Step 1: healthcheck
  const hc = await runHealthcheck();
  console.log(`[auto-publish] healthcheck: ${hc.allPass ? 'PASS' : 'FAIL'}`);
  if (!hc.allPass) {
    for (const failed of hc.failed) {
      console.error(`  FAIL ${failed.service}: ${failed.reason}`);
    }
    return 2;  // workflow ❌, 9 슬롯 진입 안 함
  }

  if (args.mode === 'healthcheck-only') {
    console.log('[auto-publish] healthcheck-only mode, exit 0');
    return 0;
  }

  // 9-slot loop는 H3 이후 task에서 추가
  return 0;
}
```

- [ ] **Step 2: healthcheck 실제 호출 smoke**

Run: `pnpm tsx scripts/auto-publish.ts --mode=healthcheck-only`
Expected (.env.local 정상 시): `healthcheck: PASS` + exit 0
Expected (token 누락 시): `healthcheck: FAIL` + 서비스 reason 출력 + exit 2

⚠️ 주의: healthcheck는 실제 외부 API를 호출함. smoke 시점에서 .env.local에 토큰 모두 있는지 확인.

- [ ] **Step 3: lint pass 확인**

Run: `pnpm lint scripts/auto-publish.ts 2>&1 | tail -5`
Expected: error 0건

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-publish.ts
git commit -m "feat(PR6): healthcheck integration + exit 2 policy (H2)"
```

---

### Task H3: trends → niche 큐 준비

**Files:**
- Modify: `scripts/auto-publish.ts`

**의도:** `pickQueue(niche)` × N niche. 큐 비어있으면 logs + 다음 niche 진행 (전체 fail은 아님).

- [ ] **Step 1: trends 통합**

`scripts/auto-publish.ts`에 추가:

```typescript
import { pickQueue, type KeywordCandidate } from '../src/lib/trends';

interface NicheQueue {
  niche: Niche;
  keywords: KeywordCandidate[];  // 5개
}

async function pickAllQueues(niches: Niche[]): Promise<NicheQueue[]> {
  const queues: NicheQueue[] = [];
  for (const niche of niches) {
    const keywords = await pickQueue(niche);
    console.log(`[auto-publish] queue ${niche}: ${keywords.length} keywords`);
    if (keywords.length === 0) {
      console.warn(`[auto-publish] WARN ${niche} queue empty, skipping niche`);
      continue;
    }
    queues.push({ niche, keywords });
  }
  return queues;
}
```

`main()`의 healthcheck 후 추가:

```typescript
  // Step 2: trends → niche 큐 준비
  const queues = await pickAllQueues(args.niches);
  if (queues.length === 0) {
    console.error('[auto-publish] all queues empty, exit 1');
    return 1;
  }
```

- [ ] **Step 2: lint pass 확인**

Run: `pnpm lint scripts/auto-publish.ts 2>&1 | tail -5`
Expected: error 0건

- [ ] **Step 3: Commit**

```bash
git add scripts/auto-publish.ts
git commit -m "feat(PR6): trends pickQueue per niche (H3)"
```

---

### Task H4: 9-slot sequential loop + dedup

**Files:**
- Modify: `scripts/auto-publish.ts`

**의도:** 각 niche 큐를 처리하며 slotCount 만큼 슬롯 채우기. dedup 결과에 따라 skip / pass / slug_variant 처리. 큐 exhausted 시 logs + 다음 슬롯.

- [ ] **Step 1: SlotResult 타입 정의 + dedup loop**

```typescript
import { checkAndResolve } from '../src/lib/dedup';
import { getDb } from '../src/lib/db';  // Drizzle DB 인스턴스 (PR5에 있다고 가정 — 없으면 DB init step 추가)

type SlotStatus = 'published' | 'failed' | 'skipped';

interface SlotResult {
  niche: Niche;
  slotIdx: number;
  keyword?: string;
  slug?: string;
  status: SlotStatus;
  externalId?: string;
  externalUrl?: string;
  scheduledFor?: string;
  failureReason?: string;
}

interface NicheState {
  niche: Niche;
  queue: KeywordCandidate[];
  queueIdx: number;
  usedSlugs: Set<string>;
  usedSlotTimes: Set<string>;
}

async function processSlot(
  state: NicheState,
  slotIdx: number,
  db: ReturnType<typeof getDb>
): Promise<SlotResult> {
  const niche = state.niche;

  // 1. dedup-driven keyword pick (큐 소진까지 시도)
  while (state.queueIdx < state.queue.length) {
    const candidate = state.queue[state.queueIdx];
    state.queueIdx++;

    const dedupResult = await checkAndResolve(db, {
      niche,
      keyword: candidate.keyword,
      evergreen: candidate.evergreen ?? false,
    });

    if (dedupResult.action === 'skip') {
      console.log(`[${niche} slot${slotIdx}] dedup skip: ${candidate.keyword} (${dedupResult.reason})`);
      continue;  // 큐 다음 candidate
    }

    // pass / follow_up / slug_variant — H5에서 writer 진행
    return {
      niche,
      slotIdx,
      keyword: candidate.keyword,
      status: 'failed',  // placeholder, H5에서 채움
      failureReason: 'TODO_H5',
    };
  }

  // 큐 exhausted
  console.warn(`[${niche} slot${slotIdx}] queue exhausted`);
  return {
    niche,
    slotIdx,
    status: 'skipped',
    failureReason: 'queue_exhausted',
  };
}
```

`main()`에 9-slot loop 추가:

```typescript
  // Step 3: 9-slot sequential loop
  const db = getDb();
  const states: NicheState[] = queues.map(q => ({
    niche: q.niche,
    queue: q.keywords,
    queueIdx: 0,
    usedSlugs: new Set(),
    usedSlotTimes: new Set(),
  }));
  const results: SlotResult[] = [];

  for (const state of states) {
    for (let slotIdx = 1; slotIdx <= args.slotCount; slotIdx++) {
      try {
        const result = await processSlot(state, slotIdx, db);
        results.push(result);
      } catch (err) {
        console.error(`[${state.niche} slot${slotIdx}] uncaught:`, err);
        results.push({
          niche: state.niche,
          slotIdx,
          status: 'failed',
          failureReason: `uncaught: ${(err as Error).message}`,
        });
      }
    }
  }
```

- [ ] **Step 2: lint pass 확인**

Run: `pnpm lint scripts/auto-publish.ts 2>&1 | tail -5`
Expected: error 0건

- [ ] **Step 3: Commit**

```bash
git add scripts/auto-publish.ts
git commit -m "feat(PR6): 9-slot sequential loop + dedup integration (H4)"
```

---

### Task H5: writer + editor revision loop

**Files:**
- Modify: `scripts/auto-publish.ts`

**의도:** writer (claude CLI via llm.ts) → editor.review → revision loop max 2회. 둘 다 fail 시 throw `editor_reject_x2`.

- [ ] **Step 1: writeAndReview 함수 추가**

```typescript
import { callClaude } from '../src/lib/llm';
import { reviewDraft, type EditorReviewResult } from '../src/lib/editor';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'agents');

interface WriterDraft {
  title: string;
  slug: string;
  meta_description: string;
  content_html: string;
  image_slots: Array<{ slot_id: string; search_keywords: string }>;
  chart_slots: unknown[];
  faq_schema: unknown[];
  word_count: number;
}

async function writeAndReview(
  niche: Niche,
  keyword: string,
  contentType: string | undefined
): Promise<WriterDraft> {
  const writerPrompt = readFileSync(join(PROMPTS_DIR, 'content-writer.md'), 'utf8');
  const editorPrompt = readFileSync(join(PROMPTS_DIR, 'content-editor.md'), 'utf8');

  let draft: WriterDraft | null = null;
  let lastFeedback = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const userInput = JSON.stringify({
      niche,
      keyword,
      content_type: contentType,
      revision_feedback: attempt === 1 ? null : lastFeedback,
    });

    const writerOutput = await callClaude({
      systemPrompt: writerPrompt,
      userInput,
      expectJson: true,
      timeoutMs: 120000,
    });
    draft = JSON.parse(writerOutput as string) as WriterDraft;

    const review: EditorReviewResult = await reviewDraft(draft, editorPrompt);
    if (review.verdict === 'pass') {
      return draft;
    }

    console.log(`[${niche}] writer attempt ${attempt} revision_needed: ${review.feedback}`);
    lastFeedback = review.feedback ?? '';
  }

  throw new Error('editor_reject_x2');
}
```

- [ ] **Step 2: processSlot에 writer 통합**

`processSlot()`의 placeholder 부분 교체:

```typescript
    // pass / follow_up / slug_variant — writer 진행
    let draft: WriterDraft;
    try {
      draft = await writeAndReview(niche, candidate.keyword, dedupResult.suggested_content_type);
    } catch (err) {
      return {
        niche,
        slotIdx,
        keyword: candidate.keyword,
        status: 'failed',
        failureReason: `writer: ${(err as Error).message}`,
      };
    }

    // H6에서 images + slot_time, H7에서 publisher
    return {
      niche,
      slotIdx,
      keyword: candidate.keyword,
      slug: draft.slug,
      status: 'failed',  // placeholder, H7에서 published로 변경
      failureReason: 'TODO_H6_H7',
    };
```

- [ ] **Step 3: lint pass 확인**

Run: `pnpm lint scripts/auto-publish.ts 2>&1 | tail -5`
Expected: error 0건

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-publish.ts
git commit -m "feat(PR6): writer + editor revision loop (max 2회) (H5)"
```

---

### Task H6: images + slot time + slug 충돌 회피

**Files:**
- Modify: `scripts/auto-publish.ts`

**의도:**
1. `fetchForSlots(image_slots)` — Pexels → Pixabay → placeholder
2. slot_time = pickRandomSlot([09,11,13,15,17,19] - usedSlotTimes)
3. slug 충돌 시 in-memory `-2`, `-3` suffix
4. niche별 독립 state 유지

- [ ] **Step 1: pickSlotTime + assignSlug 헬퍼**

```typescript
import { fetchForSlots, type ImageSlotResult } from '../src/lib/images';

const PUBLISH_HOURS_KST = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00'];

function pickSlotTime(used: Set<string>): string {
  const available = PUBLISH_HOURS_KST.filter(h => !used.has(h));
  if (available.length === 0) {
    throw new Error('all_slots_used');
  }
  // 결정론 위해 sequential 선택 (첫 unused). spec은 random이지만 통합 테스트 안정성 위해 sequential.
  // 실제 사용 패턴: 한 cron에 niche당 3슬롯이라 충돌 가능성 낮음.
  return available[0];
}

function assignSlug(rawSlug: string, usedSlugs: Set<string>): string {
  if (!usedSlugs.has(rawSlug)) {
    usedSlugs.add(rawSlug);
    return rawSlug;
  }
  for (let i = 2; i <= 99; i++) {
    const candidate = `${rawSlug}-${i}`;
    if (!usedSlugs.has(candidate)) {
      usedSlugs.add(candidate);
      return candidate;
    }
  }
  throw new Error('slug_exhausted');
}

function toIsoUtc(slotTimeKst: string, baseDate: Date = new Date()): string {
  // 'HH:MM' KST → next day at HH:MM in UTC ISO
  const [hh, mm] = slotTimeKst.split(':').map(Number);
  const next = new Date(baseDate);
  next.setUTCHours(hh - 9, mm, 0, 0);  // KST = UTC+9
  if (next <= baseDate) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.toISOString();
}
```

- [ ] **Step 2: processSlot에 images + slot 통합**

writer 직후, publisher 호출 전에 추가:

```typescript
    // images
    const imageResults: ImageSlotResult[] = await fetchForSlots(draft.image_slots);

    // slug 충돌 회피
    const finalSlug = assignSlug(draft.slug, state.usedSlugs);

    // slot_time
    let slotTimeKst: string;
    try {
      slotTimeKst = pickSlotTime(state.usedSlotTimes);
      state.usedSlotTimes.add(slotTimeKst);
    } catch (err) {
      return {
        niche,
        slotIdx,
        keyword: candidate.keyword,
        slug: finalSlug,
        status: 'failed',
        failureReason: `slot: ${(err as Error).message}`,
      };
    }
    const scheduledFor = toIsoUtc(slotTimeKst);
```

- [ ] **Step 3: lint pass**

Run: `pnpm lint scripts/auto-publish.ts 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-publish.ts
git commit -m "feat(PR6): images + slot_time + slug 충돌 회피 (H6)"
```

---

### Task H7: publisher + DB INSERT (success path)

**Files:**
- Modify: `scripts/auto-publish.ts`

**의도:** WS/TS는 `wordpress.publishScheduled`, AS는 `blogger.publishScheduled`. 성공 시 DB INSERT(status='published').

- [ ] **Step 1: niche → publisher 라우팅**

```typescript
import { publishScheduled as wpPublish } from '../src/lib/wordpress';
import { publishScheduled as bloggerPublish } from '../src/lib/blogger';
import { publishedPosts } from '../src/lib/schema';

interface PublishedRecord {
  externalId: string;
  externalUrl: string;
  scheduledAt: string;
}

async function publishToPlatform(
  niche: Niche,
  draft: WriterDraft,
  finalSlug: string,
  imageResults: ImageSlotResult[],
  scheduledFor: string
): Promise<PublishedRecord> {
  // WS/TS → wordpress (멀티사이트 토큰)
  // AS → blogger
  if (niche === 'WS' || niche === 'TS') {
    return wpPublish({
      niche,
      title: draft.title,
      slug: finalSlug,
      htmlContent: draft.content_html,
      metaDescription: draft.meta_description,
      images: imageResults,
      scheduledFor,
    });
  } else {
    return bloggerPublish({
      title: draft.title,
      slug: finalSlug,
      htmlContent: draft.content_html,
      metaDescription: draft.meta_description,
      images: imageResults,
      scheduledFor,
    });
  }
}
```

- [ ] **Step 2: DB INSERT (published)**

`processSlot()`의 publisher 후:

```typescript
    let pubRecord: PublishedRecord;
    try {
      pubRecord = await publishToPlatform(niche, draft, finalSlug, imageResults, scheduledFor);
    } catch (err) {
      return {
        niche,
        slotIdx,
        keyword: candidate.keyword,
        slug: finalSlug,
        status: 'failed',
        failureReason: `publish: ${(err as Error).message}`,
      };
    }

    // DB INSERT (success)
    await db.insert(publishedPosts).values({
      niche,
      keyword: candidate.keyword,
      slug: finalSlug,
      title: draft.title,
      status: 'published',
      platform: niche === 'AS' ? 'blogger' : `wordpress_${niche.toLowerCase()}`,
      externalId: pubRecord.externalId,
      externalUrl: pubRecord.externalUrl,
      scheduledSlot: scheduledFor,
      publishedAt: new Date().toISOString(),
    });

    return {
      niche,
      slotIdx,
      keyword: candidate.keyword,
      slug: finalSlug,
      status: 'published',
      externalId: pubRecord.externalId,
      externalUrl: pubRecord.externalUrl,
      scheduledFor,
    };
```

- [ ] **Step 3: lint pass**

Run: `pnpm lint scripts/auto-publish.ts 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-publish.ts
git commit -m "feat(PR6): publisher routing + DB INSERT (published) (H7)"
```

---

### Task H8: error path — DB INSERT(failed) + dispatch

**Files:**
- Modify: `scripts/auto-publish.ts`

**의도:** 슬롯 폐기 시 DB INSERT(status='failed', failure_reason, draft_json) + GitHub Issue dispatch (gh CLI). dispatch는 `gh issue create` 사용.

- [ ] **Step 1: dispatchFailureIssue + DB INSERT(failed) 통합**

```typescript
import { execSync } from 'node:child_process';

function dispatchFailureIssue(
  niche: Niche,
  keyword: string | undefined,
  failureReason: string,
  draftJson: string | null
): void {
  if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
    console.warn('[dispatch] GITHUB_TOKEN/GH_TOKEN 없음, dispatch skip');
    return;
  }

  const body = [
    `niche: ${niche}`,
    `keyword: ${keyword ?? '(N/A)'}`,
    `폐기 사유: ${failureReason}`,
    '',
    '```json',
    draftJson ?? '(no draft)',
    '```',
    '',
    '권장 조치: 키워드 폐기 / 수동 트리거 / 페르소나 검토',
  ].join('\n');

  try {
    execSync(
      `gh issue create --title "[blog-autopilot] 게시물 폐기: ${niche} / ${keyword ?? 'N/A'}" --body ${JSON.stringify(body)} --label "blog-autopilot,auto-discard"`,
      { stdio: 'pipe' }
    );
    console.log(`[dispatch] issue created for ${niche}/${keyword}`);
  } catch (err) {
    console.error(`[dispatch] failed:`, (err as Error).message);
  }
}

async function recordFailure(
  db: ReturnType<typeof getDb>,
  result: SlotResult,
  draftJson: string | null
): Promise<void> {
  await db.insert(publishedPosts).values({
    niche: result.niche,
    keyword: result.keyword ?? null,
    slug: result.slug ?? null,
    status: 'failed',
    failureReason: result.failureReason ?? 'unknown',
    draftJson,
  });

  dispatchFailureIssue(result.niche, result.keyword, result.failureReason ?? 'unknown', draftJson);
}
```

- [ ] **Step 2: 9-slot loop의 catch에 recordFailure 호출**

`main()`의 loop 수정:

```typescript
    for (let slotIdx = 1; slotIdx <= args.slotCount; slotIdx++) {
      let result: SlotResult;
      try {
        result = await processSlot(state, slotIdx, db);
      } catch (err) {
        console.error(`[${state.niche} slot${slotIdx}] uncaught:`, err);
        result = {
          niche: state.niche,
          slotIdx,
          status: 'failed',
          failureReason: `uncaught: ${(err as Error).message}`,
        };
      }
      results.push(result);

      if (result.status === 'failed') {
        await recordFailure(db, result, null);  // draft_json은 H5에서 보존 안 했으면 null
      }
    }
```

- [ ] **Step 3: lint pass**

Run: `pnpm lint scripts/auto-publish.ts 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add scripts/auto-publish.ts
git commit -m "feat(PR6): error path — DB INSERT(failed) + dispatch issue (H8)"
```

---

### Task H9: batch summary + DB backup + exit policy

**Files:**
- Modify: `scripts/auto-publish.ts`

**의도:**
1. console + `~/logs/blog-autopilot.log` summary
2. DB 백업 (`cp ${DB_PATH} ~/backups/blog-autopilot-YYYYMMDD.db` + 30일 retention)
3. exit policy — 폐기 비율 ≥50% 시 exit 1, else exit 0

- [ ] **Step 1: summary + backup + exit policy 추가**

```typescript
import { appendFileSync, copyFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';

function writeSummary(results: SlotResult[]): { published: number; failed: number; skipped: number } {
  const published = results.filter(r => r.status === 'published').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  const line = `${new Date().toISOString()} success: ${published}, failed: ${failed}, skipped: ${skipped}`;
  console.log(`[auto-publish] ${line}`);

  try {
    const logDir = join(homedir(), 'logs');
    mkdirSync(logDir, { recursive: true });
    appendFileSync(join(logDir, 'blog-autopilot.log'), line + '\n');
  } catch (err) {
    console.warn('[summary] log write failed:', (err as Error).message);
  }

  return { published, failed, skipped };
}

function backupDb(): void {
  const dbPath = process.env.DB_PATH ?? './content-autopilot.db';
  const backupDir = join(homedir(), 'backups');
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const backupPath = join(backupDir, `blog-autopilot-${yyyymmdd}.db`);

  try {
    mkdirSync(backupDir, { recursive: true });
    copyFileSync(dbPath, backupPath);
    console.log(`[backup] ${backupPath}`);

    // 30일 retention
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const f of readdirSync(backupDir)) {
      if (!f.startsWith('blog-autopilot-') || !f.endsWith('.db')) continue;
      const fp = join(backupDir, f);
      if (statSync(fp).mtimeMs < cutoff) {
        unlinkSync(fp);
        console.log(`[backup] retention cleanup: ${f}`);
      }
    }
  } catch (err) {
    console.error('[backup] failed:', (err as Error).message);
    // 백업 실패는 cron 실패 아님 (소프트 에러)
  }
}

function decideExitCode(summary: { published: number; failed: number; skipped: number }): number {
  const total = summary.published + summary.failed + summary.skipped;
  if (total === 0) return 1;  // nothing happened
  const discardRatio = (summary.failed + summary.skipped) / total;
  if (discardRatio >= 0.5) {
    console.error(`[exit] discard ratio ${(discardRatio * 100).toFixed(0)}% >= 50%, exit 1`);
    return 1;
  }
  return 0;
}
```

`main()` 마지막에 추가:

```typescript
  // Step 4-6: summary + backup + exit policy
  const summary = writeSummary(results);
  backupDb();
  return decideExitCode(summary);
```

- [ ] **Step 2: lint pass**

Run: `pnpm lint scripts/auto-publish.ts 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add scripts/auto-publish.ts
git commit -m "feat(PR6): batch summary + DB backup (30d retention) + exit policy (H9)"
```

---

### Task H10: 통합 테스트 7 시나리오

**Files:**
- Create: `scripts/__tests__/auto-publish.test.ts`

**의도:** spec §8 통합 테스트 7 시나리오 검증. PR5 lib들을 mock으로 차단하고 오케스트레이터 흐름만 검증.

- [ ] **Step 1: 테스트 골격 + mock setup**

```typescript
// scripts/__tests__/auto-publish.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { publishedPosts } from '../../src/lib/schema';
import { sql } from 'drizzle-orm';

// PR5 lib mocks
vi.mock('../../src/lib/healthcheck', () => ({
  runHealthcheck: vi.fn(),
}));
vi.mock('../../src/lib/trends', () => ({
  pickQueue: vi.fn(),
}));
vi.mock('../../src/lib/dedup', () => ({
  checkAndResolve: vi.fn(),
}));
vi.mock('../../src/lib/llm', () => ({
  callClaude: vi.fn(),
}));
vi.mock('../../src/lib/editor', () => ({
  reviewDraft: vi.fn(),
}));
vi.mock('../../src/lib/images', () => ({
  fetchForSlots: vi.fn(),
}));
vi.mock('../../src/lib/wordpress', () => ({
  publishScheduled: vi.fn(),
}));
vi.mock('../../src/lib/blogger', () => ({
  publishScheduled: vi.fn(),
}));
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// In-memory DB factory
function makeDb() {
  const sqlite = new Database(':memory:');
  // PR5 마이그레이션 적용 (schema.ts의 published_posts 테이블)
  sqlite.exec(`
    CREATE TABLE published_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      niche TEXT NOT NULL,
      keyword TEXT,
      slug TEXT,
      title TEXT,
      status TEXT NOT NULL,
      platform TEXT,
      external_id TEXT,
      external_url TEXT,
      scheduled_slot TEXT,
      published_at TEXT,
      failure_reason TEXT,
      draft_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX idx_niche_slug ON published_posts(niche, slug) WHERE slug IS NOT NULL;
  `);
  return drizzle(sqlite);
}
```

- [ ] **Step 2: Scenario 1 — golden path**

```typescript
describe('auto-publish.ts 통합', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('Scenario 1: golden path — 1 niche 1 slot publish', async () => {
    const { runHealthcheck } = await import('../../src/lib/healthcheck');
    const { pickQueue } = await import('../../src/lib/trends');
    const { checkAndResolve } = await import('../../src/lib/dedup');
    const { callClaude } = await import('../../src/lib/llm');
    const { reviewDraft } = await import('../../src/lib/editor');
    const { fetchForSlots } = await import('../../src/lib/images');
    const { publishScheduled: wpPublish } = await import('../../src/lib/wordpress');

    vi.mocked(runHealthcheck).mockResolvedValue({ allPass: true, failed: [] });
    vi.mocked(pickQueue).mockResolvedValue([
      { keyword: 'test keyword', category: 'news', evergreen: false, priority_score: 50 } as any,
    ]);
    vi.mocked(checkAndResolve).mockResolvedValue({ action: 'pass', reason: 'first time' } as any);
    vi.mocked(callClaude).mockResolvedValue(JSON.stringify({
      title: 'Test Title', slug: 'test-slug', meta_description: 'm',
      content_html: '<p>x</p>', image_slots: [], chart_slots: [], faq_schema: [], word_count: 1500,
    }));
    vi.mocked(reviewDraft).mockResolvedValue({ verdict: 'pass', score: 90 } as any);
    vi.mocked(fetchForSlots).mockResolvedValue([]);
    vi.mocked(wpPublish).mockResolvedValue({
      externalId: 'wp-123', externalUrl: 'https://ws.example.com/test-slug', scheduledAt: '2026-04-27T00:00:00Z',
    });

    process.argv = ['node', 'auto-publish.ts', '--niche=WS', '--slot-count=1', '--mode=normal'];
    const { runMain } = await import('../auto-publish');  // refactor: export runMain for testability
    const code = await runMain();
    expect(code).toBe(0);
    // DB row 검증은 makeDb를 inject 가능하게 refactor 후 추가
  });
```

⚠️ **refactor 필요**: `main()`을 `runMain(db?)` 형태로 export해서 테스트에서 in-memory DB inject 가능하게. H1에서 `main()`을 직접 호출하는 대신 `runMain` export하도록 수정.

- [ ] **Step 3: Scenario 2-7 추가**

```typescript
  it('Scenario 2: editor reject 1회 후 2회차 pass', async () => {
    // setup: writer 2회 호출, editor 1회 revision 1회 pass
    // 검증: callClaude 2회, 최종 published
  });

  it('Scenario 3: editor reject 2회 → 폐기', async () => {
    // setup: writer 2회 호출, editor 2회 모두 revision_needed
    // 검증: status='failed', failure_reason='editor_reject_x2', dispatch 1회
  });

  it('Scenario 4: dedup skip 후 다음 keyword 진행', async () => {
    // setup: pickQueue 2개, dedup 1번째 skip, 2번째 pass
    // 검증: callClaude는 2번째 keyword로 1회 호출, published
  });

  it('Scenario 5: healthcheck fail → 9 슬롯 진입 안 함', async () => {
    // setup: runHealthcheck = { allPass: false, failed: [{service: 'WP-WS', reason: '401'}] }
    // 검증: pickQueue 호출 0회, exit code 2
  });

  it('Scenario 6: 모든 이미지 fail → placeholder 발행', async () => {
    // setup: fetchForSlots = [{slot_id: 's1', source: 'placeholder', image_url: '...'}]
    // 검증: published 정상, source='placeholder' 포함된 record
  });

  it('Scenario 7: batch slug 충돌 → -2 suffix', async () => {
    // setup: 같은 niche 슬롯 2개, writer 둘 다 'test-slug' 생성
    // 검증: 2번째 slot의 slug='test-slug-2', 둘 다 published
  });
});
```

각 시나리오마다 mock setup + assertion 명시. 코드는 위 패턴 따라 채움.

- [ ] **Step 4: vitest 실행 + 7개 모두 pass**

Run: `pnpm vitest run scripts/__tests__/auto-publish.test.ts`
Expected: 7 tests, 7 passed

- [ ] **Step 5: Commit**

```bash
git add scripts/__tests__/auto-publish.test.ts scripts/auto-publish.ts
git commit -m "test(PR6): 7 통합 시나리오 (golden path, revision, reject, dedup, healthcheck, image, slug 충돌) (H10)"
```

---

### Task H11: .github/workflows/auto-publish.yml

**Files:**
- Create: `.github/workflows/auto-publish.yml`

**의도:** cron 01:17 + workflow_dispatch + self-hosted runner + secrets injection.

- [ ] **Step 1: workflow yaml 작성**

```yaml
name: Auto-publish

on:
  schedule:
    - cron: '17 1 * * *'  # 매일 KST 10:17 (UTC 01:17)
  workflow_dispatch:
    inputs:
      niche:
        description: '대상 niche (all | WS | TS | AS)'
        type: choice
        options: [all, WS, TS, AS]
        default: all
      slot_count:
        description: 'niche당 슬롯 수'
        type: string
        default: '3'
      mode:
        description: '실행 모드'
        type: choice
        options: [normal, healthcheck-only]
        default: normal

jobs:
  publish:
    runs-on: self-hosted
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm tsx scripts/auto-publish.ts --niche=${{ inputs.niche || 'all' }} --slot-count=${{ inputs.slot_count || '3' }} --mode=${{ inputs.mode || 'normal' }}
        env:
          # 외부 API
          PIXABAY_API_KEY: ${{ secrets.PIXABAY_API_KEY }}
          PEXELS_API_KEY: ${{ secrets.PEXELS_API_KEY }}
          # WordPress 멀티사이트
          WORDPRESS_WS_ACCESS_TOKEN: ${{ secrets.WORDPRESS_WS_ACCESS_TOKEN }}
          WORDPRESS_WS_SITE_ID: ${{ secrets.WORDPRESS_WS_SITE_ID }}
          WORDPRESS_TS_ACCESS_TOKEN: ${{ secrets.WORDPRESS_TS_ACCESS_TOKEN }}
          WORDPRESS_TS_SITE_ID: ${{ secrets.WORDPRESS_TS_SITE_ID }}
          # Blogger
          GOOGLE_OAUTH_CLIENT_ID: ${{ secrets.GOOGLE_OAUTH_CLIENT_ID }}
          GOOGLE_OAUTH_CLIENT_SECRET: ${{ secrets.GOOGLE_OAUTH_CLIENT_SECRET }}
          GOOGLE_OAUTH_REFRESH_TOKEN: ${{ secrets.GOOGLE_OAUTH_REFRESH_TOKEN }}
          BLOGGER_AS_BLOG_ID: ${{ secrets.BLOGGER_AS_BLOG_ID }}
          # Trend (선택)
          NAVER_CLIENT_ID: ${{ secrets.NAVER_CLIENT_ID }}
          NAVER_CLIENT_SECRET: ${{ secrets.NAVER_CLIENT_SECRET }}
          # DB / 백업
          DB_PATH: ${{ secrets.DB_PATH }}
          # Issue dispatch
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

⚠️ secrets list는 PR5의 `.env.local` + healthcheck retro fix와 일치. **누락 secret 있으면 healthcheck 단계에서 fail로 잡힘** (정상 동작).

- [ ] **Step 2: yaml lint 확인**

Run: `npx -y yaml-lint .github/workflows/auto-publish.yml 2>&1 | tail -5`
또는 `act -l` (있으면) 또는 단순 `cat | python -c 'import yaml; yaml.safe_load(open("..."))'`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/auto-publish.yml
git commit -m "ci(PR6): auto-publish workflow (cron 01:17 + workflow_dispatch + self-hosted) (H11)"
```

---

### Task H12: docs/runner-setup.md

**Files:**
- Create: `docs/runner-setup.md`

**의도:** self-hosted runner 1회 셋업 가이드. 사용자가 이 문서 보고 직접 진행.

- [ ] **Step 1: runner-setup.md 작성**

```markdown
# Self-hosted Runner 셋업 (Mac mini)

## 1. GitHub runner 등록

```bash
# repo Settings → Actions → Runners → New self-hosted runner (macOS)
# 페이지에 표시된 명령 실행:

mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-osx-x64-2.x.x.tar.gz -L https://github.com/actions/runner/releases/download/...
tar xzf ./actions-runner-osx-x64-2.x.x.tar.gz
./config.sh --url https://github.com/kkyu92/content-autopilot --token <runner-token>
# label: blog-autopilot, work folder: _work, 그 외 default
```

등록 확인:
```bash
gh api repos/kkyu92/content-autopilot/actions/runners | jq '.runners[].status'
# → "online"
```

## 2. LaunchAgent (자동 시작 + KeepAlive)

```bash
mkdir -p ~/Library/LaunchAgents
cat > ~/Library/LaunchAgents/com.github.actions.runner.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.github.actions.runner</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/kyusikkim/actions-runner/run.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/kyusikkim/actions-runner</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/kyusikkim/logs/actions-runner.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/kyusikkim/logs/actions-runner.err</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.github.actions.runner.plist
launchctl list | grep actions.runner
```

## 3. pmset wake schedule (Mac mini sleep 시 깨우기)

```bash
# 매일 01:10 KST (= cron 01:17 보다 7분 전)에 wake
sudo pmset repeat wake MTWRFSU 01:10:00

# 확인
pmset -g sched
# → wakeorpoweron at 01:10:00 every day
```

## 4. claude CLI OAuth 셋업

```bash
# runner 사용자 셸에서 (pmset wake 후 자동 실행되는 그 사용자 환경)
claude login
# 브라우저 열림 → Anthropic 계정 로그인 → 토큰 저장
```

확인:
```bash
claude --version
echo "test" | claude -p "1 word reply" --model sonnet
# → 정상 응답
```

⚠️ OAuth 토큰 만료 시 `lib/healthcheck.ts`의 `pingClaudeCli`가 fail. 로그인 다시 필요.

## 5. 환경 변수 (.env.local)

`/Users/kyusikkim/projects/content-autopilot/.env.local`에 secrets 동일하게 존재 확인:

```
PIXABAY_API_KEY=...
PEXELS_API_KEY=...
WORDPRESS_WS_ACCESS_TOKEN=...
WORDPRESS_WS_SITE_ID=...
WORDPRESS_TS_ACCESS_TOKEN=...
WORDPRESS_TS_SITE_ID=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REFRESH_TOKEN=...
BLOGGER_AS_BLOG_ID=...
DB_PATH=/Users/kyusikkim/projects/content-autopilot/content-autopilot.db
GH_TOKEN=...  # gh CLI auth
```

GitHub repo Secrets에도 동일한 값 등록 (workflow injection용).

## 6. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `actions-runner.err`에 `not authorized` | runner token 만료 | runner 재등록 |
| cron 발화 안 함 | Mac mini sleep + pmset 미설정 | `sudo pmset repeat wake ...` |
| `claude: command not found` | LaunchAgent PATH 누락 | plist에 `EnvironmentVariables` 추가 |
| healthcheck 401 | OAuth/토큰 만료 | 해당 서비스 재로그인 (수동) |
```

- [ ] **Step 2: Commit**

```bash
git add docs/runner-setup.md
git commit -m "docs(PR6): self-hosted runner 셋업 가이드 (LaunchAgent + pmset wake + claude OAuth) (H12)"
```

---

### Task H13: docs/smoke-test.md

**Files:**
- Create: `docs/smoke-test.md`

**의도:** smoke test 절차 + 체크리스트. 사용자가 PR6 land 직전 직접 실행.

- [ ] **Step 1: smoke-test.md 작성**

```markdown
# Smoke Test 절차 (PR6 land 직전)

⚠️ **사용자 컨펌 후 실행**. 외부 API 호출 + 실제 발행 발생.

## 사전 조건

- [ ] `docs/runner-setup.md` 모든 단계 완료
- [ ] runner online: `gh api repos/kkyu92/content-autopilot/actions/runners | jq '.runners[].status'` → `"online"`
- [ ] secrets 모두 등록: repo Settings → Secrets → Actions
- [ ] PR6 PR이 main에 merge되어 workflow 활성화 또는 PR 브랜치에서 `gh workflow run` 가능

## Step 1: healthcheck-only 단독 실행

```bash
gh workflow run auto-publish.yml -f mode=healthcheck-only
```

확인:
```bash
gh run list --workflow=auto-publish.yml --limit 1
gh run view <run-id> --log
```

기대:
- status: success ✅
- log에 `healthcheck: PASS`
- 외부 발행 0건

❌ FAIL 시:
- log의 fail 서비스 확인 → 해당 토큰/엔드포인트 점검
- runner-setup.md 트러블슈팅 참조
- fix 후 재실행

## Step 2: 1건 smoke 발행

⚠️ **사용자 명시 컨펌 필요**. 실제 WordPress WS 사이트에 글 1개 게재됨.

```bash
gh workflow run auto-publish.yml -f niche=WS -f slot_count=1 -f mode=normal
```

확인:
```bash
gh run list --workflow=auto-publish.yml --limit 1
gh run view <run-id> --log | tail -20
```

기대:
- status: success ✅
- log에 `success: 1, failed: 0, skipped: 0`
- WordPress WS 사이트 (worldsignal.kr 등) → 다음 발행 시각 (예: 09:00 KST)에 글 1개 예약 발행됨
- DB: `sqlite3 ~/projects/content-autopilot/content-autopilot.db "SELECT * FROM published_posts ORDER BY id DESC LIMIT 1"` → row 1개, status='published'
- GitHub Issue 생성 0건 (정상)

❌ FAIL 시:
- log에서 fail 단계 확인 (writer / editor / images / publisher)
- DB의 failure_reason + draft_json 확인
- 폐기 Issue 자동 생성됐는지 확인 → 권장 조치 따름

## Step 3: cron 자연 발화 대기 (다음날 01:17 KST)

다음 날 아침 확인:

```bash
gh run list --workflow=auto-publish.yml --limit 1
# → 01:17 발화 status 확인
```

기대:
- 01:17 KST에 자동 발화
- success ratio ≥ 70% (3 niche × 3 slot = 9건 중 7건 이상 published)
- Issue 알림은 폐기 시에만 (예: 1-2건)

## Step 4: 1주 운영 관찰

매일 morning routine:
- [ ] `gh run list --workflow=auto-publish.yml --limit 7` — 최근 7일 status
- [ ] WordPress WS/TS, Blogger AS 사이트에 매일 3건씩 (총 9건) 게재 확인
- [ ] DB published_posts row 수 확인: 매일 9 row 추가
- [ ] Issue 알림 (있으면) 사유 확인 + 패턴 보고

✅ **합격 조건**:
- 매일 fail 비율 < 30%
- silent fail 0건 (모든 fail은 GitHub Issue 생성)
- DB 백업 30일 retention 자동 작동 (`ls ~/backups/blog-autopilot-*.db`)

## 합격 시: PR6 land 완료 → Phase 1 종료
```

- [ ] **Step 2: Commit**

```bash
git add docs/smoke-test.md
git commit -m "docs(PR6): smoke test 절차 + 1주 관찰 체크리스트 (H13)"
```

---

### Task H14: PR 작성 + review + land

**Files:**
- (no code change)

**의도:** PR6 PR을 main으로 푸시. CI test workflow (vitest) green 확인.

- [ ] **Step 1: 잔여 작업 확인**

```bash
git log --oneline main..HEAD
# → H1-H13 commit들 보임 (대략 13-15 commits)

git status
# → coverage/ 외 cleanly committed
```

`.gitignore`에 `coverage/` 추가 (drift 위험 #6):

```bash
echo "coverage/" >> .gitignore
git add .gitignore
git commit -m "chore(PR6): .gitignore에 coverage/ 추가"
```

- [ ] **Step 2: 로컬 vitest 전체 통과**

Run: `pnpm vitest run`
Expected: 367 + 7 = 374 tests, all passing

(PR5 367 + PR6 통합 7개)

- [ ] **Step 3: push + PR 생성**

```bash
git push -u origin pr6-auto-publish

gh pr create --title "PR6: auto-publish 오케스트레이터 + workflow + runner 셋업" --body "$(cat <<'EOF'
## Summary
- `scripts/auto-publish.ts` — healthcheck → trends → 9-slot loop → DB INSERT → 백업 → exit policy
- `.github/workflows/auto-publish.yml` — cron 01:17 + workflow_dispatch + self-hosted runner
- `docs/runner-setup.md`, `docs/smoke-test.md` — 사용자 셋업 + smoke 가이드
- 통합 테스트 7 시나리오 (vitest, lib mock)

## Test plan
- [ ] CI vitest workflow green (374 tests)
- [ ] runner-setup.md step 1-5 완료 (사용자)
- [ ] smoke-test.md Step 1 (healthcheck-only) ✅
- [ ] smoke-test.md Step 2 (1건 smoke) ✅ (사용자 컨펌)
- [ ] smoke-test.md Step 3 (cron 자연 발화) ✅
- [ ] smoke-test.md Step 4 (1주 관찰) — fail < 30%

## 주의
- PR merge ≠ 발행 시작. runner online + secrets 등록 + smoke 통과까지 완료해야 cron 의미 있음.
- merge 직후 첫 cron까지 healthcheck-only 모드로 실행해 안전 검증 권장.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: CI green 확인**

Run: `gh pr checks` (PR6 PR)
Expected: test pass, GitGuardian pass

- [ ] **Step 5: 사용자 review + smoke 진행 후 land**

```bash
# 사용자 single-approval 후
gh pr merge --merge --delete-branch=true
```

PR6 land 후 Phase 1 종료. 1주 운영 관찰 → Phase 1.5 backlog 진입 결정.

---

## Summary

PR6 = 14 task (H1~H14):
- H1-H9: `scripts/auto-publish.ts` 점진 구축 (9 commit)
- H10: 통합 테스트 7 시나리오 (1 commit)
- H11: workflow yaml (1 commit)
- H12: runner-setup.md (1 commit)
- H13: smoke-test.md (1 commit)
- H14: PR + smoke + land (1 commit + PR)

**예상 작업 시간:**
- H1-H10 코드 작업: 1-2 세션 (subagent-driven 권장)
- H11-H13 docs: 30-60분
- H14 smoke + 1주 관찰: 사용자 단계 + 7일 자연 발화

## Spec
- spec: `docs/superpowers/specs/2026-04-26-blog-autopilot-pr5-pr6-design.md`
- 이전 plan (PR5+PR6 high-level): `docs/superpowers/plans/2026-04-26-blog-autopilot-pr5-pr6.md`

## Test plan
- [ ] 7 통합 시나리오 모두 pass
- [ ] CI workflow (`test.yml`) green
- [ ] healthcheck-only smoke ✅
- [ ] 1건 smoke 발행 ✅ (사용자 컨펌)
- [ ] cron 자연 발화 ✅
- [ ] 1주 관찰: fail < 30%, silent fail 0, DB 백업 retention 작동

## 검증 체크포인트

### PR6 land 전 (smoke)
- [ ] self-hosted runner online
- [ ] healthcheck-only workflow ✅
- [ ] 1건 smoke 발행 → 사이트 노출 + DB row + dispatch 0건
- [ ] 다음날 cron 01:17 자연 발화 ✅

### 운영 안정성 검증 (PR6 land 후 1주)
- [ ] 매일 9건 중 fail 비율 < 30%
- [ ] silent fail 0건
- [ ] DB 백업 30일 retention 자동 작동
