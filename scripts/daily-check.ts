#!/usr/bin/env tsx
// scripts/daily-check.ts
// KST 07:17 cron — 오늘 12게시물 달성 검증. 부족 시 자동 보충 dispatch (fire-and-forget). RC 분석 + 리포트.
//
// flow:
//   1. 오늘 KST cron run 찾기 (auto-publish.yml, started ~6h ago)
//   2. DB count per niche
//   3. 부족 시 dispatch fill (1 slot/niche, 최대 3회) — 대기 X (단일 self-hosted runner 점유 시 fill 들이 queue stuck → timeout deadlock)
//   4. RC pattern 분석 (cron fail 시만; fill 은 익일 daily-check 에서 검증)
//   5. 결과 출력 + 이슈 생성 (불완전 시)

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NICHES = ['HS', 'TS', 'AS'] as const;
const TARGET_PER_NICHE = 4;
const TARGET_TOTAL = 12;
const MAX_FILL_DISPATCHES = 3;

type Niche = (typeof NICHES)[number];

interface RunSummary {
  databaseId: number;
  conclusion: string;
  createdAt: string;
  status?: string;
}

function todayKstDate(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function ghJson<T>(cmd: string): T {
  const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out) as T;
}

function findTodayCronRun(): RunSummary | null {
  const runs = ghJson<RunSummary[]>(
    `gh run list --workflow=auto-publish.yml --limit 5 --json databaseId,conclusion,createdAt,status`,
  );
  const today = todayKstDate();
  return (
    runs.find((r) => {
      const kstDate = new Date(new Date(r.createdAt).getTime() + 9 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      return kstDate === today;
    }) ?? null
  );
}

function countByNicheFromDb(): Record<Niche, number> {
  const dbPath = process.env.DATABASE_PATH ?? 'data/blog.db';
  const today = todayKstDate();
  const out = execSync(
    `sqlite3 "${dbPath}" "SELECT niche, COUNT(*) FROM published_posts WHERE date(published_at,'localtime')='${today}' AND status='published' GROUP BY niche"`,
    { encoding: 'utf8' },
  );
  const counts: Record<Niche, number> = { HS: 0, TS: 0, AS: 0 };
  for (const line of out.trim().split('\n').filter(Boolean)) {
    const [niche, cnt] = line.split('|');
    if (niche === 'HS' || niche === 'TS' || niche === 'AS') {
      counts[niche] = parseInt(cnt, 10);
    }
  }
  return counts;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function dispatchFill(niche: Niche): Promise<number> {
  console.log(`[daily-check] dispatching fill: niche=${niche} slot_count=1`);
  execSync(
    `gh workflow run auto-publish.yml -f niche=${niche} -f slot_count=1 -f mode=normal -f runner=home`,
    { stdio: 'inherit' },
  );
  await sleep(6000);
  const runs = ghJson<RunSummary[]>(
    `gh run list --workflow=auto-publish.yml --limit 1 --json databaseId,status,createdAt,conclusion`,
  );
  return runs[0].databaseId;
}

interface RcMatch {
  pattern: string;
  hint: string;
}

function analyzeFailureRc(runId: number): RcMatch[] {
  let log = '';
  try {
    log = execSync(`gh run view ${runId} --log 2>&1`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } catch {
    return [];
  }
  const rcs: RcMatch[] = [];
  if (/lost communication with the server/i.test(log)) {
    rcs.push({
      pattern: 'runner_sleep',
      hint: 'macOS self-hosted runner sleep stuck. launchctl kickstart 필요.',
    });
  }
  if (/claude CLI timeout after 900000ms/i.test(log)) {
    rcs.push({
      pattern: 'writer_timeout',
      hint: 'writer 15min hard timeout. bdca69f retry 적용됨 — 1차 fail 시 자동 재시도.',
    });
  }
  if (/queue exhausted/i.test(log)) {
    rcs.push({
      pattern: 'queue_exhausted',
      hint: 'LLM 이 count 미만 반환. 7f0787f fallback 적용됨 — 부족분 추가 호출.',
    });
  }
  if (/You've hit your limit/i.test(log) || /usage limit/i.test(log)) {
    rcs.push({
      pattern: 'sonnet_quota',
      hint: 'sonnet 한도 도달. workflow yml 에 BLOG_LLM_MODEL_OVERRIDE: opus 임시 추가 필요.',
    });
  }
  if (/claude CLI exit 1:/i.test(log) && !/timeout/i.test(log)) {
    rcs.push({
      pattern: 'claude_cli_exit1',
      hint: 'claude CLI 즉시 종료 (empty stderr). 보통 sonnet quota 또는 transient. retry 로 회복 가능.',
    });
  }
  return rcs;
}

function createIssue(title: string, body: string): void {
  const tmpFile = join(tmpdir(), `daily-check-body-${Date.now()}.md`);
  writeFileSync(tmpFile, body);
  try {
    execSync(`gh issue create --title "${title.replace(/"/g, '\\"')}" --body-file "${tmpFile}"`, {
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn(`[daily-check] gh issue create failed: ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  const today = todayKstDate();
  console.log(`[daily-check] start ${today} KST`);

  const cronRun = findTodayCronRun();
  if (cronRun) {
    console.log(
      `[daily-check] today cron: run=${cronRun.databaseId} conclusion=${cronRun.conclusion} status=${cronRun.status ?? '?'}`,
    );
    if (cronRun.status && cronRun.status !== 'completed') {
      console.warn(`[daily-check] cron still running — abort, retry tomorrow`);
      return;
    }
  } else {
    console.warn(`[daily-check] no cron run found for ${today} — proceed with DB check`);
  }

  const initialCounts = countByNicheFromDb();
  const initialTotal = initialCounts.HS + initialCounts.TS + initialCounts.AS;
  console.log(
    `[daily-check] initial counts: HS=${initialCounts.HS} TS=${initialCounts.TS} AS=${initialCounts.AS} total=${initialTotal}/${TARGET_TOTAL}`,
  );

  const fillRuns: { niche: Niche; runId: number; conclusion: string }[] = [];
  let dispatches = 0;

  for (const niche of NICHES) {
    const shortage = TARGET_PER_NICHE - initialCounts[niche];
    if (shortage <= 0) continue;
    for (let i = 0; i < shortage; i++) {
      if (dispatches >= MAX_FILL_DISPATCHES) {
        console.warn(`[daily-check] max ${MAX_FILL_DISPATCHES} fills reached — stop`);
        break;
      }
      const runId = await dispatchFill(niche);
      dispatches++;
      console.log(
        `[daily-check] fill ${niche} run=${runId} dispatched (fire-and-forget; executes after this workflow exits)`,
      );
      fillRuns.push({ niche, runId, conclusion: 'dispatched' });
    }
    if (dispatches >= MAX_FILL_DISPATCHES) break;
  }

  const finalCounts = countByNicheFromDb();
  const finalTotal = finalCounts.HS + finalCounts.TS + finalCounts.AS;
  console.log(
    `[daily-check] final counts: HS=${finalCounts.HS} TS=${finalCounts.TS} AS=${finalCounts.AS} total=${finalTotal}/${TARGET_TOTAL}`,
  );

  // RC analysis: cron fail 만 (fill 은 fire-and-forget, 익일 daily-check 에서 검증)
  const rcSources: { source: string; rcs: RcMatch[] }[] = [];
  if (cronRun && cronRun.conclusion !== 'success') {
    rcSources.push({ source: `cron run ${cronRun.databaseId}`, rcs: analyzeFailureRc(cronRun.databaseId) });
  }

  // Report
  const lines: string[] = [];
  lines.push(`## ${today} Daily Check — ${finalTotal}/${TARGET_TOTAL}`);
  lines.push('');
  if (cronRun) {
    lines.push(`- Cron run: \`${cronRun.databaseId}\` conclusion=\`${cronRun.conclusion}\``);
  } else {
    lines.push(`- Cron run: not found`);
  }
  lines.push(
    `- Initial: HS=${initialCounts.HS} TS=${initialCounts.TS} AS=${initialCounts.AS} (total ${initialTotal})`,
  );
  if (fillRuns.length > 0) {
    lines.push('- Fill dispatches (fire-and-forget — execute after this workflow exits; 익일 daily-check 가 검증):');
    for (const fr of fillRuns) {
      lines.push(`  - ${fr.niche} run \`${fr.runId}\` → ${fr.conclusion}`);
    }
  } else {
    lines.push(`- Fill dispatches: none`);
  }
  lines.push(
    `- Final: HS=${finalCounts.HS} TS=${finalCounts.TS} AS=${finalCounts.AS} (total ${finalTotal})`,
  );
  if (rcSources.length > 0) {
    lines.push('- RC analysis:');
    for (const rs of rcSources) {
      if (rs.rcs.length === 0) {
        lines.push(`  - ${rs.source}: no known pattern matched`);
      } else {
        for (const rc of rs.rcs) {
          lines.push(`  - ${rs.source}: \`${rc.pattern}\` — ${rc.hint}`);
        }
      }
    }
  }

  const body = lines.join('\n');
  console.log('\n' + body);

  if (finalTotal < TARGET_TOTAL || rcSources.length > 0) {
    createIssue(`[daily-check] ${today}: ${finalTotal}/${TARGET_TOTAL}`, body);
  } else {
    console.log(`[daily-check] all good — no issue created`);
  }
}

main().catch((err) => {
  console.error(`[daily-check] fatal: ${(err as Error).message}`);
  console.error((err as Error).stack);
  process.exit(1);
});
