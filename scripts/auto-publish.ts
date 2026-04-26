import { parseArgs } from 'node:util';
import { runAll } from '../src/lib/healthcheck';

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

  // 9-slot loop는 H3 이후 task에서 추가
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error('[auto-publish] fatal:', err);
    process.exit(3);
  }
);
