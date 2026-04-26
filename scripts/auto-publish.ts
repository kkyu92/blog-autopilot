import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runAll } from '../src/lib/healthcheck';
import { pickQueue, type KeywordCandidate } from '../src/lib/trends';
import { checkAndResolve, type DedupResult } from '../src/lib/dedup';
import { getDb } from '../src/lib/db';
import { callClaude } from '../src/lib/llm';
import { review, type EditorReviewResult } from '../src/lib/editor';
import { fetchForSlots, type ImageResult } from '../src/lib/images';

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'agents');
const WRITER_PROMPT = readFileSync(join(PROMPTS_DIR, 'content-writer.md'), 'utf8');
const REQUIRED_DRAFT_FIELDS = ['title', 'slug', 'meta_description', 'content_html', 'word_count'] as const;
// Note: 슬롯은 sequential pick (테스트 결정성). 모든 niche가 동일하게 09:00→11:00→13:00 순서로 채움 —
// niche 간 wall-clock stagger 없음. H7 publisher는 동시 호출 가능성 인지 필요.
const PUBLISH_HOURS_KST = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00'] as const;

function pickSlotTime(used: Set<string>): string {
  const available = PUBLISH_HOURS_KST.filter((h) => !used.has(h));
  if (available.length === 0) {
    throw new Error('all_slots_used');
  }
  // sequential pick (deterministic for tests; niche당 3슬롯이라 충돌 가능성 낮음)
  const picked = available[0];
  used.add(picked); // mutate internally for symmetry with assignSlug
  return picked;
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

// 'HH:MM' KST → next available UTC ISO instant.
// Example: baseDate=2026-04-26 02:00 UTC (= 11:00 KST), slotTimeKst='13:00'
//   → 2026-04-26 04:00 UTC (= 13:00 KST today, no rollover)
// Example: baseDate=2026-04-26 05:00 UTC (= 14:00 KST), slotTimeKst='13:00'
//   → 2026-04-27 04:00 UTC (= 13:00 KST tomorrow, rolled over)
function toIsoUtc(slotTimeKst: string, baseDate: Date = new Date()): string {
  // 'HH:MM' KST → next available UTC ISO (KST = UTC+9)
  const [hh, mm] = slotTimeKst.split(':').map(Number);
  const next = new Date(baseDate);
  next.setUTCHours(hh - 9, mm, 0, 0);
  if (next <= baseDate) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.toISOString();
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

type Niche = 'WS' | 'TS' | 'AS';
type Mode = 'normal' | 'healthcheck-only';

interface CliArgs {
  niches: Niche[];
  slotCount: number;
  mode: Mode;
}

interface NicheQueue {
  niche: Niche;
  keywords: KeywordCandidate[];
}

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

async function pickAllQueues(niches: Niche[]): Promise<NicheQueue[]> {
  const queues: NicheQueue[] = [];
  for (const niche of niches) {
    const keywords = await pickQueue({ niche });
    console.log(`[auto-publish] queue ${niche}: ${keywords.length} keywords`);
    if (keywords.length === 0) {
      console.warn(`[auto-publish] WARN ${niche} queue empty, skipping niche`);
      continue;
    }
    queues.push({ niche, keywords });
  }
  return queues;
}

async function pickViableCandidate(
  state: NicheState,
  slotIdx: number,
  db: ReturnType<typeof getDb>,
): Promise<{ candidate: KeywordCandidate; dedupResult: DedupResult } | null> {
  const niche = state.niche;

  while (state.queueIdx < state.queue.length) {
    const candidate = state.queue[state.queueIdx];
    state.queueIdx++;

    const dedupResult = await checkAndResolve(db, {
      niche,
      keyword: candidate.keyword,
      evergreen: candidate.evergreen ?? false,
      trend: {
        search_volume_trend: candidate.search_volume_trend,
        priority_score: candidate.priority_score,
      },
    });

    if (dedupResult.action === 'skip') {
      console.log(
        `[${niche} slot${slotIdx}] dedup skip: ${candidate.keyword} (${dedupResult.reason})`,
      );
      continue;
    }

    // dedupResult.action ∈ {'pass', 'follow_up', 'slug_variant'} → 진행
    return { candidate, dedupResult };
  }

  return null;
}

interface WriterDraft {
  title: string;
  slug: string;
  meta_description: string;
  content_html: string;
  image_slots: Array<{ slot_id: string; search_query: string; alt_text: string }>;
  chart_slots: unknown[];
  faq_schema: unknown[];
  word_count: number;
  keyword: string; // editor.review() requires this; we backfill from input keyword
}

async function writeAndReview(
  niche: Niche,
  keyword: string,
  contentType: string | undefined,
): Promise<{ draft: WriterDraft; review: EditorReviewResult }> {
  let lastFeedback = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const userMessage = JSON.stringify({
      niche,
      keyword,
      content_type: contentType,
      revision_feedback: attempt === 1 ? null : lastFeedback,
    });

    const writerOutput = await callClaude({
      systemPrompt: WRITER_PROMPT,
      userMessage,
      expectJson: true,
    });
    const parsed = JSON.parse(writerOutput) as Record<string, unknown>;
    for (const field of REQUIRED_DRAFT_FIELDS) {
      if (parsed[field] == null) {
        throw new Error(`writer: missing field ${field}`);
      }
    }
    // LLM occasionally drifts from persona schema; backfill defensively
    if (parsed.keyword == null) {
      console.warn(`[${niche}] writer omitted keyword field (LLM drift); backfilling from input`);
    }
    const draft: WriterDraft = {
      ...(parsed as Partial<WriterDraft> & {
        title: string;
        slug: string;
        meta_description: string;
        content_html: string;
        word_count: number;
        image_slots: Array<{ slot_id: string; search_query: string; alt_text: string }>;
        chart_slots: unknown[];
        faq_schema: unknown[];
      }),
      keyword: (parsed.keyword as string | undefined) ?? keyword,
    };

    // Spread satisfies EditorReviewInput's index signature; WriterDraft is structurally compatible
    const result = await review({ draft: { ...draft }, niche });

    if (result.verdict === 'pass') {
      return { draft, review: result };
    }

    const feedback = result.feedback ?? result.reason ?? '';
    console.log(
      `[${niche}] writer attempt ${attempt} revision_needed (score=${result.score}): ${feedback}`,
    );
    lastFeedback = feedback;
  }

  // Both attempts produced revision_needed
  throw new Error('editor_reject_x2');
}

// 주의: state.queueIdx를 mutation (pickViableCandidate 내부). 슬롯 순차 처리 가정. 병렬화 시 재설계 필요.
async function processSlot(
  state: NicheState,
  slotIdx: number,
  db: ReturnType<typeof getDb>,
): Promise<SlotResult> {
  const niche = state.niche;
  const picked = await pickViableCandidate(state, slotIdx, db);
  if (picked === null) {
    console.warn(`[${niche} slot${slotIdx}] queue exhausted`);
    return { niche, slotIdx, status: 'skipped', failureReason: 'queue_exhausted' };
  }

  const { candidate, dedupResult } = picked;

  // H5: writer + editor revision loop (max 2 attempts)
  let draft: WriterDraft;
  try {
    const out = await writeAndReview(
      niche,
      candidate.keyword,
      dedupResult.suggested_content_type,
    );
    draft = out.draft;
  } catch (err) {
    return {
      niche,
      slotIdx,
      keyword: candidate.keyword,
      status: 'failed',
      failureReason: `writer: ${errMessage(err)}`,
    };
  }

  // H6: images
  let imageResults: ImageResult[];
  try {
    imageResults = await fetchForSlots(draft.image_slots);
  } catch (err) {
    return {
      niche,
      slotIdx,
      keyword: candidate.keyword,
      slug: draft.slug,
      status: 'failed',
      failureReason: `images: ${errMessage(err)}`,
    };
  }
  void imageResults; // consumed by H7 publisher

  // H6: slug 충돌 회피 (in-memory niche state)
  const finalSlug = assignSlug(draft.slug, state.usedSlugs);

  // H6: slot_time (KST) → UTC ISO
  let slotTimeKst: string;
  try {
    slotTimeKst = pickSlotTime(state.usedSlotTimes);
  } catch (err) {
    return {
      niche,
      slotIdx,
      keyword: candidate.keyword,
      slug: finalSlug,
      status: 'failed',
      failureReason: `slot: ${errMessage(err)}`,
    };
  }
  const scheduledFor = toIsoUtc(slotTimeKst);

  // H7: publish (placeholder)
  return {
    niche,
    slotIdx,
    keyword: candidate.keyword,
    slug: finalSlug,
    scheduledFor,
    status: 'failed',
    failureReason: 'TODO_H7',
  };
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

  // Step 1: healthcheck
  const hc = await runAll();
  console.log(`[auto-publish] healthcheck: ${hc.allPassed ? 'PASS' : 'FAIL'}`);
  if (!hc.allPassed) {
    for (const failed of hc.results.filter(r => !r.ok)) {
      console.error(`  FAIL ${failed.service}: ${failed.reason ?? 'unknown reason'}`);
    }
    return 2;  // workflow ❌, 9 슬롯 진입 안 함
  }

  if (args.mode === 'healthcheck-only') {
    console.log('[auto-publish] healthcheck-only mode, exit 0');
    return 0;
  }

  // Step 2: trends → niche 큐 준비
  const queues = await pickAllQueues(args.niches);
  if (queues.length === 0) {
    console.error('[auto-publish] all queues empty, exit 1');
    return 1;
  }

  // Step 3: 9-slot sequential loop (각 niche × slotCount)
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
          failureReason: `uncaught: ${errMessage(err)}`,
        });
      }
    }
  }

  const published = results.filter(r => r.status === 'published').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  console.log(
    `[auto-publish] slot results: published=${published} failed=${failed} skipped=${skipped} (total=${results.length})`,
  );

  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('[auto-publish] fatal:', err);
    process.exit(3);
  }
);
