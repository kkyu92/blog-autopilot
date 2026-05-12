// One-shot publish from a pre-validated draft JSON.
// Bypasses writer LLM, editor.review, image fetch. Used to recover from writer-stage failures
// where the LLM draft is valid content-wise but failed JSON.parse due to escape drift.
//
// Usage:
//   bash -c 'set -a; source .env.local; set +a; pnpm tsx scripts/blogger/publish-from-draft.ts \
//     --draft=/tmp/ts-draft-fixed.json --niche=TS --slot-kst=17:00'

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { publishScheduled } from '../../src/lib/blogger';
import { getDb } from '../../src/lib/db';
import { publishedPosts } from '../../src/lib/schema';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    draft: { type: 'string' },
    niche: { type: 'string' },
    'slot-kst': { type: 'string' },
  },
});

const draftPath = values.draft as string;
const niche = values.niche as 'AS' | 'TS' | 'HS';
const slotKst = values['slot-kst'] as string;
if (!draftPath || !niche || !slotKst) {
  console.error('Usage: --draft=<path> --niche=AS|TS|HS --slot-kst=HH:MM');
  process.exit(1);
}

const draft = JSON.parse(readFileSync(draftPath, 'utf8')) as {
  title: string;
  slug: string;
  meta_description?: string;
  content_html: string;
  category?: string;
  labels?: string[];
  keyword: string;
};

function toIsoUtc(slotKstHHMM: string): string {
  const [h, m] = slotKstHHMM.split(':').map(Number);
  const now = new Date();
  const target = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    h - 9,
    m,
    0,
  ));
  if (target.getTime() < now.getTime() + 60_000) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.toISOString();
}

async function main() {
  const scheduledFor = toIsoUtc(slotKst);
  console.log(`[publish-from-draft] niche=${niche} slot=${slotKst} KST → ${scheduledFor}`);
  console.log(`[publish-from-draft] title: ${draft.title}`);
  console.log(`[publish-from-draft] slug: ${draft.slug}`);
  console.log(`[publish-from-draft] content length: ${draft.content_html.length}`);

  const pubResult = await publishScheduled(
    niche,
    { title: draft.title, content: draft.content_html, labels: draft.labels },
    new Date(scheduledFor),
  );
  console.log(`[publish-from-draft] published externalId=${pubResult.externalId}`);
  console.log(`[publish-from-draft] externalUrl=${pubResult.externalUrl}`);

  const platformForNiche = { AS: 'blogger_as', TS: 'blogger_trip', HS: 'blogger_health' }[niche];
  const db = getDb();
  await db.insert(publishedPosts).values({
    niche,
    category: draft.category ?? null,
    keyword: draft.keyword,
    slug: draft.slug,
    title: draft.title,
    platform: platformForNiche,
    externalPostId: pubResult.externalId,
    externalUrl: pubResult.externalUrl,
    publishedAt: new Date().toISOString(),
    scheduledSlot: scheduledFor,
    status: 'published',
  });
  console.log('[publish-from-draft] DB row inserted ✓');
}

main().catch((err) => {
  console.error('[publish-from-draft] FAIL:', err);
  process.exit(1);
});
