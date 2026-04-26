import { parseArgs } from 'node:util';
import { runAll } from '../src/lib/healthcheck';
import { pickQueue, type KeywordCandidate } from '../src/lib/trends';
import { checkAndResolve } from '../src/lib/dedup';
import { getDb } from '../src/lib/db';

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

async function processSlot(
  state: NicheState,
  slotIdx: number,
  db: ReturnType<typeof getDb>,
): Promise<SlotResult> {
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

    // dedupResult.action ∈ {'pass', 'follow_up', 'slug_variant'} → 진행 (H5에서 구현)
    return {
      niche,
      slotIdx,
      keyword: candidate.keyword,
      status: 'failed', // placeholder, H5에서 채움
      failureReason: 'TODO_H5',
    };
  }

  console.warn(`[${niche} slot${slotIdx}] queue exhausted`);
  return {
    niche,
    slotIdx,
    status: 'skipped',
    failureReason: 'queue_exhausted',
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
          failureReason: `uncaught: ${(err as Error).message}`,
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
