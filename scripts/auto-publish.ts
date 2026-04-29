import { parseArgs } from 'node:util';
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { runAll } from '../src/lib/healthcheck';
import { pickQueue, type KeywordCandidate } from '../src/lib/trends';
import { checkAndResolve, type DedupResult } from '../src/lib/dedup';
import { getDb } from '../src/lib/db';
import { callClaude, getClaudeCallStats } from '../src/lib/llm';
import { buildCurrentDateHeader } from '../src/lib/current-date';
import { review, type EditorReviewResult } from '../src/lib/editor';
import { fetchForSlots, type ImageResult } from '../src/lib/images';
import { publishScheduled as wpPublish } from '../src/lib/wordpress';
import { publishScheduled as bloggerPublish } from '../src/lib/blogger';
import { publishedPosts } from '../src/lib/schema';
import {
  batchSemanticDedup,
  loadRecentByNiche,
  type SemanticDedupCandidate,
} from '../src/lib/semantic-dedup';

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
// 'HH:MM' KST → 오늘 KST 날짜의 그 시각 (UTC ISO). 키워드 신선도 보장: 트렌드는
// 그날 기준이라 발행도 같은 날(KST). cron(KST 01:17) 발화 시 모든 slot(09~19시)이 미래라 정상.
// manual dispatch에서 slot 시간이 이미 지났으면 그대로 과거 시간 ISO 반환 (publisher가
// 처리; WordPress는 status='future'+과거date에 대해 보통 immediate publish로 변환).
//
// Example: baseDate=2026-04-27 16:17 UTC (= 4/27 KST 01:17 cron 발화), slotTimeKst='13:00'
//   → 2026-04-27 04:00 UTC (= 4/27 KST 13:00 today). 같은 날.
function toIsoUtc(slotTimeKst: string, baseDate: Date = new Date()): string {
  const [hh, mm] = slotTimeKst.split(':').map(Number);
  // baseDate를 KST 날짜로 변환 후 그날의 HH:MM 슬롯 시각 만들기.
  const kstNow = new Date(baseDate.getTime() + 9 * 60 * 60 * 1000); // UTC + 9h = KST clock
  const yyyy = kstNow.getUTCFullYear();
  const mo = kstNow.getUTCMonth();
  const dd = kstNow.getUTCDate();
  // 오늘 KST 날짜의 HH:MM → UTC: KST HH:MM = UTC HH-9:MM (전날 00시 ~ 09시 사이는 음수 → setUTCHours 정규화)
  const slot = new Date(Date.UTC(yyyy, mo, dd, hh - 9, mm, 0, 0));
  return slot.toISOString();
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
  // H8: threaded through so post-draft failures can INSERT title (NOT NULL).
  // Populated only after writer success. Pre-draft failures leave undefined.
  title?: string;
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
  // 4/28 사고 후 paperclip 안정성 복원: trend-hunter agent가 출력 단계에서 cannibalization
  // 사전 차단하도록 최근 30일 발행 키워드 리스트 inject. semantic-dedup layer는 backup으로.
  const db = getDb();
  const recentByNiche = loadRecentByNiche(db, niches, 30);

  const queues: NicheQueue[] = [];
  for (const niche of niches) {
    const recentKeywords = (recentByNiche[niche] ?? []).map((r) => r.keyword);
    const keywords = await pickQueue({ niche, recent_published_keywords: recentKeywords });
    console.log(`[auto-publish] queue ${niche}: ${keywords.length} keywords (recent_inject: ${recentKeywords.length})`);
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
  semanticBlocked: Set<string>,
): Promise<{ candidate: KeywordCandidate; dedupResult: DedupResult } | null> {
  const niche = state.niche;

  while (state.queueIdx < state.queue.length) {
    const candidate = state.queue[state.queueIdx];
    state.queueIdx++;

    if (semanticBlocked.has(`${niche}|${candidate.keyword}`)) {
      console.log(
        `[${niche} slot${slotIdx}] semantic dedup skip: ${candidate.keyword}`,
      );
      continue;
    }

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
  category?: string; // writer persona output; wired through to publisher (WP categories / DB column)
  labels?: string[]; // writer persona output (3-5 한글 태그); WP tags / Blogger labels
}

// paperclip 흐름: Writer → Image Curator → Editor → Publisher.
// editor가 image placeholder를 미삽입으로 reject하는 것을 막기 위해 image inject를
// editor 호출 *전*에 수행. chart는 우리 파이프라인 미지원 → writer userMessage에 비활성 명시.
// Editor가 score>=SOFT_PASS_THRESHOLD인데 revision_needed로 반환한 경우 (마이크로 스타일 일관성 등)
// attempt 2에서도 같은 결과가 나오면 콘텐츠 품질은 합격선이라 판단해 그대로 발행. paperclip 시절
// editor가 H3 font-size 17→18px 같은 microconsistency로 reject하면서 4/27 cron의 어린이날 슬롯이
// SIGKILL까지 간 사례 방지.
const SOFT_PASS_THRESHOLD = 70;

async function writeAndReview(
  niche: Niche,
  keyword: string,
  contentType: string | undefined,
): Promise<{ draft: WriterDraft; images: ImageResult[]; review: EditorReviewResult }> {
  let lastFeedback = '';
  let lastDraft: WriterDraft | null = null;
  let lastImages: ImageResult[] = [];
  let lastReview: EditorReviewResult | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const userMessage = JSON.stringify({
      niche,
      keyword,
      content_type: contentType,
      include_charts: false, // 차트는 파이프라인 미지원 (chart_slots 빈 배열 강제)
      chart_recommended: false,
      revision_feedback: attempt === 1 ? null : lastFeedback,
    });

    const writerOutput = await callClaude({
      systemPrompt: buildCurrentDateHeader() + WRITER_PROMPT,
      userMessage,
      expectJson: true,
    });
    const parsed = JSON.parse(writerOutput) as Record<string, unknown>;
    for (const field of REQUIRED_DRAFT_FIELDS) {
      if (parsed[field] == null) {
        throw new Error(`writer: missing field ${field}`);
      }
    }
    if (parsed.keyword == null) {
      console.warn(`[${niche}] writer omitted keyword field (LLM drift); backfilling from input`);
    }
    const rawDraft: WriterDraft = {
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

    // Image fetch + inject BEFORE editor — editor sees final HTML with real <img> tags
    const images = await fetchForSlots(rawDraft.image_slots);
    const draftWithImages: WriterDraft = {
      ...rawDraft,
      content_html: injectImages(rawDraft.content_html, images),
    };

    const result = await review({ draft: { ...draftWithImages }, niche });

    if (result.verdict === 'pass') {
      return { draft: draftWithImages, images, review: result };
    }

    const feedback = result.feedback ?? result.reason ?? '';
    console.log(
      `[${niche}] writer attempt ${attempt} revision_needed (score=${result.score}): ${feedback}`,
    );
    lastFeedback = feedback;
    lastDraft = draftWithImages;
    lastImages = images;
    lastReview = result;
  }

  // attempt 2 모두 revision_needed지만 콘텐츠 품질 점수가 합격선 이상이면 soft-pass로 발행
  if (lastReview && lastDraft && lastReview.score >= SOFT_PASS_THRESHOLD) {
    console.log(
      `[${niche}] writer attempt 2 soft-pass (score=${lastReview.score} >= ${SOFT_PASS_THRESHOLD}) — accepting microconsistency issues, publishing as-is`,
    );
    return { draft: lastDraft, images: lastImages, review: lastReview };
  }

  throw new Error(`editor_reject_x2 (last score=${lastReview?.score ?? '?'})`);
}

// HTML attribute escaper. image_url은 third-party JSON (Pexels/Pixabay), alt_text는 LLM 출력 —
// 둘 다 신뢰 불가. 한글 따옴표/꺾쇠 등으로 attribute injection 또는 broken HTML 방지.
function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// content-writer.md spec: HTML uses `<!-- IMAGE_SLOT_N -->` comment markers.
// image_slots[].slot_id is the literal string "IMAGE_SLOT_N" (e.g., "IMAGE_SLOT_1").
// We replace the entire HTML comment with a real <img> tag.
// Editor persona가 요구하는 표준 image figure (editor.md 검수 기준):
// loading="lazy" + border-radius:8px + max-width:100% + width:100% + display:block + figcaption.
// 단순 <img> 태그면 매번 revision_needed reject 됨 (운영 중 발견).
function buildImageFigure(r: ImageResult): string {
  const credit =
    r.source === 'placeholder'
      ? 'Placeholder'
      : r.photographer
        ? `${r.source.charAt(0).toUpperCase() + r.source.slice(1)} · ${r.photographer}`
        : r.source.charAt(0).toUpperCase() + r.source.slice(1);
  return (
    `<figure style="margin:24px 0;">` +
    `<img src="${escAttr(r.image_url)}" alt="${escAttr(r.alt_text)}" loading="lazy" ` +
    `style="border-radius:8px;max-width:100%;width:100%;display:block;" />` +
    `<figcaption style="font-size:13px;color:#888888;text-align:center;margin-top:8px;">` +
    `📷 Photo: ${escAttr(credit)}` +
    `</figcaption></figure>`
  );
}

function injectImages(html: string, results: ImageResult[]): string {
  let out = html;
  const matched = new Set<string>();
  for (const r of results) {
    const marker = `<!-- ${r.slot_id} -->`;
    if (out.includes(marker)) {
      matched.add(r.slot_id);
    }
    out = out.split(marker).join(buildImageFigure(r));
  }
  // Writer가 직접 만들어 둔 raw <img> 태그가 있을 수 있음 (editor revision attempt에서 LLM이 placeholder 옆에
  // 임의 inject). 이 경우 IMAGE_SLOT placeholder 옆 raw <img>는 위 split 후 stray로 남음. 운영 안정화 후
  // 별도 정리 (now: 단순 stray marker 경고만).
  const unmatched = results.filter((r) => !matched.has(r.slot_id));
  if (unmatched.length > 0) {
    console.warn(
      `[injectImages] unmatched results: ${unmatched.map((r) => r.slot_id).join(',')}`,
    );
  }
  const stray = out.match(/<!-- IMAGE_SLOT_\d+ -->/g);
  if (stray) {
    console.warn(`[injectImages] stray markers in published HTML: ${stray.join(',')}`);
  }
  return out;
}

interface PublishedRecord {
  externalId: string;
  externalUrl: string;
  scheduledAt: string;
}

async function publishToPlatform(
  niche: Niche,
  draft: WriterDraft,
  finalSlug: string,
  imageResults: ImageResult[],
  scheduledFor: Date,
): Promise<PublishedRecord> {
  // draft.content_html is already image-injected by writeAndReview (paperclip flow)
  // featured_image: imageResults 첫 항목의 image_url을 썸네일/대표 이미지로 자동 사용 (paperclip 누락 fix)
  const firstImage = imageResults.find((r) => r.image_url && r.source !== 'placeholder')?.image_url
    ?? imageResults[0]?.image_url;
  if (niche === 'WS' || niche === 'TS') {
    return wpPublish(
      niche,
      {
        title: draft.title,
        content: draft.content_html,
        slug: finalSlug,
        excerpt: draft.meta_description,
        categories: draft.category ? [draft.category] : undefined,
        tags: draft.labels,
        featured_image_url: firstImage,
      },
      scheduledFor,
    );
  }

  // AS → Blogger
  return bloggerPublish(
    'AS',
    {
      title: draft.title,
      content: draft.content_html,
      labels: draft.labels,
    },
    scheduledFor,
  );
}

function platformForNiche(niche: Niche): 'wordpress_ws' | 'wordpress_ts' | 'blogger_as' {
  if (niche === 'WS') return 'wordpress_ws';
  if (niche === 'TS') return 'wordpress_ts';
  return 'blogger_as';
}

// 주의: state.queueIdx를 mutation (pickViableCandidate 내부). 슬롯 순차 처리 가정. 병렬화 시 재설계 필요.
async function processSlot(
  state: NicheState,
  slotIdx: number,
  db: ReturnType<typeof getDb>,
  semanticBlocked: Set<string>,
): Promise<SlotResult> {
  const niche = state.niche;
  const picked = await pickViableCandidate(state, slotIdx, db, semanticBlocked);
  if (picked === null) {
    console.warn(`[${niche} slot${slotIdx}] queue exhausted`);
    return { niche, slotIdx, status: 'skipped', failureReason: 'queue_exhausted' };
  }

  const { candidate, dedupResult } = picked;

  // H5+H6: writer → image fetch+inject → editor (paperclip 흐름).
  // writeAndReview 내부에서 fetchForSlots + injectImages 후 editor.review 호출.
  let draft: WriterDraft;
  let imageResults: ImageResult[];
  try {
    const out = await writeAndReview(
      niche,
      candidate.keyword,
      dedupResult.suggested_content_type,
    );
    draft = out.draft;
    imageResults = out.images;
  } catch (err) {
    return {
      niche,
      slotIdx,
      keyword: candidate.keyword,
      status: 'failed',
      failureReason: `writer: ${errMessage(err)}`,
    };
  }
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
      title: draft.title,
      status: 'failed',
      failureReason: `slot: ${errMessage(err)}`,
    };
  }
  const scheduledFor = toIsoUtc(slotTimeKst);

  // H7: publish to platform (WS/TS → wordpress, AS → blogger)
  let pubRecord: PublishedRecord;
  try {
    pubRecord = await publishToPlatform(
      niche,
      draft,
      finalSlug,
      imageResults,
      new Date(scheduledFor),
    );
  } catch (err) {
    return {
      niche,
      slotIdx,
      keyword: candidate.keyword,
      slug: finalSlug,
      title: draft.title,
      scheduledFor,
      status: 'failed',
      failureReason: `publish: ${errMessage(err)}`,
    };
  }

  // H7: DB INSERT (success path). H8 will add the failure-path INSERT.
  try {
    await db.insert(publishedPosts).values({
      niche,
      category: draft.category ?? null,
      keyword: candidate.keyword,
      slug: finalSlug,
      title: draft.title,
      platform: platformForNiche(niche),
      externalPostId: pubRecord.externalId,
      externalUrl: pubRecord.externalUrl,
      publishedAt: new Date().toISOString(),
      scheduledSlot: scheduledFor,
      status: 'published',
    });
  } catch (err) {
    // Publish succeeded but DB write failed — log loudly. The post is live on the platform but unrecorded.
    // 주의: H8 failure-path INSERT는 'db:'-prefixed failureReason을 SKIP해야 함 (이미 INSERT 실패한 row를 재INSERT 시도 → deadloop 위험).
    // 운영자는 externalUrl로 platform에서 수동 reconcile.
    console.error(`[${niche} slot${slotIdx}] DB INSERT failed after successful publish:`, err);
    return {
      niche,
      slotIdx,
      keyword: candidate.keyword,
      slug: finalSlug,
      title: draft.title,
      scheduledFor,
      externalId: pubRecord.externalId,
      externalUrl: pubRecord.externalUrl,
      status: 'failed',
      failureReason: `db: ${errMessage(err)}`,
    };
  }

  return {
    niche,
    slotIdx,
    keyword: candidate.keyword,
    slug: finalSlug,
    title: draft.title,
    scheduledFor,
    externalId: pubRecord.externalId,
    externalUrl: pubRecord.externalUrl,
    status: 'published',
  };
}

// H8: GitHub Issue dispatch via `gh` CLI. Best-effort — failures only logged, never thrown.
// Token guard: skip silently if neither GITHUB_TOKEN nor GH_TOKEN is set (e.g., local dev).
function dispatchFailureIssue(
  niche: Niche,
  keyword: string | undefined,
  failureReason: string,
  draftJson: string | null,
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

  const title = `[blog-autopilot] 게시물 폐기: ${niche} / ${keyword ?? 'N/A'}`;

  // SECURITY: execFileSync (no shell) — keyword/title/body originate from third-party RSS, Naver,
  // and LLM output. JSON.stringify escapes "/\ but NOT backticks `, $(), ${VAR} — a shell would
  // execute those. execFileSync passes args directly to gh, bypassing shell interpolation entirely.
  try {
    const args = [
      'issue', 'create',
      '--title', title,
      '--body', body,
      '--label', 'blog-autopilot,auto-discard',
    ];
    // --repo makes dispatch deterministic regardless of cwd. GITHUB_REPOSITORY is auto-set in Actions.
    if (process.env.GITHUB_REPOSITORY) {
      args.push('--repo', process.env.GITHUB_REPOSITORY);
    }
    execFileSync('gh', args, { stdio: 'pipe', timeout: 30_000 });
    console.log(`[dispatch] issue created for ${niche}/${keyword ?? 'N/A'}`);
  } catch (err) {
    console.error('[dispatch] failed:', errMessage(err));
  }
}

// H8 fix-up: queue exhaustion is a content-pipeline health signal (trends/dedup gave nothing usable).
// Separate label from auto-discard so triage is distinct. Best-effort like dispatchFailureIssue.
function dispatchQueueExhaustedIssue(niche: Niche, slotIdx: number): void {
  if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
    console.warn('[dispatch] GITHUB_TOKEN/GH_TOKEN 없음, queue_exhausted dispatch skip');
    return;
  }
  const title = `[blog-autopilot] queue exhausted: ${niche} slot${slotIdx}`;
  const body = [
    `niche: ${niche}`,
    `slot: ${slotIdx}`,
    '',
    '큐 후보가 모두 dedup skip되어 슬롯 채우지 못함.',
    '',
    '권장 조치: 키워드 풀 점검 / 수동 키워드 추가 / dedup 정책 검토',
  ].join('\n');
  try {
    const args = [
      'issue', 'create',
      '--title', title,
      '--body', body,
      '--label', 'blog-autopilot,queue-exhausted',
    ];
    if (process.env.GITHUB_REPOSITORY) {
      args.push('--repo', process.env.GITHUB_REPOSITORY);
    }
    execFileSync('gh', args, { stdio: 'pipe', timeout: 30_000 });
    console.log(`[dispatch] queue_exhausted issue created for ${niche} slot${slotIdx}`);
  } catch (err) {
    console.error('[dispatch queue_exhausted] failed:', errMessage(err));
  }
}

// H8: failure-path record. Approach B (commit message documents this):
//   - Skip 'db:'-prefixed reasons → H7 orphan case (publish OK, DB INSERT failed). Re-INSERTing would loop.
//   - Pre-draft failures (no title/slug) → dispatch Issue + console only; NO DB INSERT.
//     publishedPosts.{title, slug, platform, externalUrl} are NOT NULL; empty-string placeholders
//     would pollute analytics + risk uniqueIndex(slug, platform) collisions across empty slugs.
//   - Post-draft failures (title + slug present) → INSERT status='failed' with whatever we have.
//     externalUrl is '' since publish failed; uniqueness constraints don't fire on status='failed' uniquely
//     but slug uniqueness still applies — finalSlug already deduped via assignSlug, so safe.
async function recordFailure(
  db: ReturnType<typeof getDb>,
  result: SlotResult,
  draftJson: string | null,
): Promise<void> {
  // CRITICAL (H7 edge case): skip 'db:'-prefixed reasons. SlotResult was already attempting INSERT;
  // re-INSERTing the same row would loop on the same DB error.
  if (result.failureReason?.startsWith('db:')) {
    console.warn(
      `[recordFailure] skip 'db:'-prefixed (H7 orphan): ${result.niche}/${result.keyword ?? 'N/A'}`,
    );
    // Still dispatch an Issue for visibility — the post is live but unrecorded; operator must reconcile.
    dispatchFailureIssue(
      result.niche,
      result.keyword,
      result.failureReason ?? 'unknown',
      draftJson,
    );
    return;
  }

  // Approach B: skip INSERT for pre-draft failures. We require both title and slug
  // before we have anything coherent to record; pre-draft slots (queue_exhausted,
  // writer reject, dedup-only-skip) get only the Issue dispatch.
  if (!result.title || !result.slug) {
    console.warn(
      `[recordFailure] no draft for ${result.niche}/${result.keyword ?? 'N/A'}: ${result.failureReason ?? 'unknown'}`,
    );
    dispatchFailureIssue(
      result.niche,
      result.keyword,
      result.failureReason ?? 'unknown',
      null,
    );
    return;
  }

  // Post-draft failure: INSERT with the data we have.
  // TODO(post-PR6): uniqueIndex(slug, platform) collides on retry of a previously-failed slot
  // (failed row with same slug exists; new attempt's published INSERT throws). Mitigation options:
  // (a) Suffix failed-row slug with timestamp; (b) Partial uniqueIndex WHERE status='published';
  // (c) Delete failed rows with same niche+keyword at retry start. Not blocking H8.
  try {
    await db.insert(publishedPosts).values({
      niche: result.niche,
      keyword: result.keyword ?? '',
      title: result.title,
      slug: result.slug,
      platform: platformForNiche(result.niche),
      externalPostId: result.externalId ?? null,
      externalUrl: result.externalUrl ?? '',
      publishedAt: new Date().toISOString(),
      scheduledSlot: result.scheduledFor ?? null,
      status: 'failed',
      failureReason: result.failureReason ?? 'unknown',
      draftJson,
    });
  } catch (err) {
    // Don't rethrow — failure-path INSERT must not crash the loop. Log + continue to Issue dispatch.
    console.error(
      `[recordFailure] INSERT(failed) errored for ${result.niche}/${result.keyword ?? 'N/A'}:`,
      errMessage(err),
    );
  }

  dispatchFailureIssue(
    result.niche,
    result.keyword,
    result.failureReason ?? 'unknown',
    draftJson,
  );
}

// H9: 한 줄 요약 (console + ~/logs/blog-autopilot.log).
// 로그 디스크 쓰기 실패는 cron 실패 아님 — soft warn.
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
    console.warn('[summary] log write failed:', errMessage(err));
  }

  return { published, failed, skipped };
}

// H9: DB 백업 + 30일 retention.
// PR5 lib/db.ts는 DATABASE_PATH env 사용 (default: ./data/blog.db).
// 백업 실패는 cron 실패 아님 (소프트 에러).
function backupDb(): void {
  const dbPath = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'blog.db');
  const backupDir = join(homedir(), 'backups');
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const backupPath = join(backupDir, `blog-autopilot-${yyyymmdd}.db`);

  try {
    mkdirSync(backupDir, { recursive: true });
    copyFileSync(dbPath, backupPath);
    console.log(`[backup] ${backupPath}`);

    // 30일 retention
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const todayBackup = `blog-autopilot-${yyyymmdd}.db`;
    for (const f of readdirSync(backupDir)) {
      if (!f.startsWith('blog-autopilot-') || !f.endsWith('.db')) continue;
      if (f === todayBackup) continue; // never prune the file we just wrote
      const fp = join(backupDir, f);
      if (statSync(fp).mtimeMs < cutoff) {
        unlinkSync(fp);
        console.log(`[backup] retention cleanup: ${f}`);
      }
    }
  } catch (err) {
    console.error('[backup] failed:', errMessage(err));
    // 백업 실패는 cron 실패 아님 (소프트 에러)
    // TODO(post-PR6): N consecutive 백업 fail 시 dispatchIssue (queue_exhausted 패턴 참고)
  }
}

// H9: exit code policy.
//   total=0 (nothing happened) → 1 (cron 알림 필요)
//   discard ratio (failed+skipped)/total ≥ 50% → 1 (콘텐츠 파이프라인 health 경고)
//   else → 0
function decideExitCode(summary: { published: number; failed: number; skipped: number }): number {
  const total = summary.published + summary.failed + summary.skipped;
  if (total === 0) return 1;
  const discardRatio = (summary.failed + summary.skipped) / total;
  if (discardRatio >= 0.5) {
    console.error(`[exit] discard ratio ${(discardRatio * 100).toFixed(0)}% >= 50%, exit 1`);
    return 1;
  }
  return 0;
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

// F1'-b: orphan claude process pre-cron sweep. 4/28 post-cleanup evidence — orphan claude.exe
// 3개가 SIGTERM/SIGKILL 후에도 잔존 → fd/memory 점유 → 다음 cron의 spawn fail (ENOENT, -8) 유발.
// "claude -p" 패턴 매칭으로 사용자의 Claude Code 인터랙티브 session (다른 인자 사용)은 영향 안 줌.
// cron 시작 직전 1회만 호출 (healthcheck/slot 처리 중엔 호출 X — 자기 spawn 죽일 위험).
function killOrphanClaude(): void {
  try {
    execSync('pkill -9 -f "claude -p" 2>/dev/null || true', { stdio: 'ignore' });
    console.log('[orphan-kill] pre-cron sweep complete (claude -p 패턴)');
  } catch (err) {
    console.warn('[orphan-kill] failed (non-fatal):', errMessage(err));
  }
}

export async function runMain(argv: string[] = process.argv): Promise<number> {
  const args = parseCliArgs(argv);
  console.log(`[auto-publish] start mode=${args.mode} niches=${args.niches.join(',')} slotCount=${args.slotCount}`);

  // F1'-b: 이전 cron의 orphan claude.exe 정리 (4/28 evidence)
  killOrphanClaude();

  // Step 1: healthcheck
  // claude-cli는 healthcheck 10s timeout에서 자주 fail하지만 slot-level (~18min)에서는 정상.
  // 발행 자체를 막지 않고 WARN만 — lesson bb81938 회귀 4/28-17:56 UTC schedule 차단 root cause.
  const hc = await runAll();
  const failed = hc.results.filter(r => !r.ok);
  const claudeCliFailed = failed.filter(r => r.service === 'claude-cli');
  const blockingFailed = failed.filter(r => r.service !== 'claude-cli');
  console.log(
    `[auto-publish] healthcheck: ${blockingFailed.length === 0 ? 'PASS' : 'FAIL'}` +
      (claudeCliFailed.length > 0 ? ' (claude-cli: WARN — proceeding)' : ''),
  );
  for (const w of claudeCliFailed) {
    console.warn(`  WARN ${w.service}: ${w.reason ?? 'unknown reason'} — slot-level retry will handle`);
  }
  if (blockingFailed.length > 0) {
    for (const f of blockingFailed) {
      console.error(`  FAIL ${f.service}: ${f.reason ?? 'unknown reason'}`);
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

  // Step 2.5: LLM-based semantic dedup (claude CLI, Max 구독). 키워드 string-match dedup이
  // 못 잡는 의미 동일 토픽 (예: "춘곤증 극복법" vs "춘곤증 극복 방법 5가지", "황금연휴" vs
  // "골든위크")을 writer 호출 전 차단. 실패 시 graceful degradation — 기존 string dedup만 사용.
  const db = getDb();
  const semanticBlocked = new Set<string>();
  try {
    const flatCandidates: SemanticDedupCandidate[] = [];
    const flatMap: Array<{ niche: Niche; keyword: string }> = [];
    for (const q of queues) {
      for (const k of q.keywords) {
        flatCandidates.push({ niche: q.niche, keyword: k.keyword });
        flatMap.push({ niche: q.niche, keyword: k.keyword });
      }
    }
    if (flatCandidates.length > 0) {
      const recentByNiche = loadRecentByNiche(db, args.niches, 30);
      const sem = await batchSemanticDedup(flatCandidates, recentByNiche);
      for (const dup of sem.duplicates) {
        const m = flatMap[dup.candidate_idx];
        if (!m) continue;
        semanticBlocked.add(`${m.niche}|${m.keyword}`);
        console.log(
          `[semantic dedup] block ${m.niche}/${m.keyword} → duplicate of #${dup.duplicate_of_id} "${dup.duplicate_of_keyword}" (${dup.reason})`,
        );
      }
      console.log(
        `[auto-publish] semantic dedup: ${sem.duplicates.length}/${flatCandidates.length} candidates blocked`,
      );
    }
  } catch (err) {
    console.warn(
      `[auto-publish] semantic dedup failed (continuing without it): ${errMessage(err)}`,
    );
  }

  // Step 3: 9-slot sequential loop (각 niche × slotCount)

  // 운영 안정성: 같은 niche에서 향후 24h 내 이미 예약된 scheduled_slot을 미리 usedSlotTimes에 채워
  // 동일 시간 슬롯 중복 방지. paperclip 시절 누락된 동시성 보호.
  const states: NicheState[] = await Promise.all(
    queues.map(async (q) => {
      const usedSlotTimes = new Set<string>();
      const usedSlugs = new Set<string>();
      try {
        const rows = await db.select().from(publishedPosts).all();
        const now = Date.now();
        const cutoff = now + 24 * 60 * 60 * 1000; // 24h ahead window
        for (const r of rows) {
          if (r.niche !== q.niche || r.status !== 'published') continue;
          if (r.slug) usedSlugs.add(r.slug);
          if (!r.scheduledSlot) continue;
          const t = new Date(r.scheduledSlot).getTime();
          if (Number.isNaN(t) || t < now - 60_000 || t > cutoff) continue;
          const d = new Date(r.scheduledSlot);
          const kstH = (d.getUTCHours() + 9) % 24;
          const kstM = d.getUTCMinutes();
          usedSlotTimes.add(`${String(kstH).padStart(2, '0')}:${String(kstM).padStart(2, '0')}`);
        }
      } catch (err) {
        console.warn(`[state] preload usedSlotTimes/Slugs failed for ${q.niche}:`, errMessage(err));
      }
      return {
        niche: q.niche,
        queue: q.keywords,
        queueIdx: 0,
        usedSlugs,
        usedSlotTimes,
      };
    }),
  );
  const results: SlotResult[] = [];

  // F1'-d: niche간 병렬 처리 (WS·TS·AS 동시 시작). niche 안에서는 slot 1→2→3 직렬 유지.
  // 동시 claude.exe spawn 최대 3개. 4/29 evidence: 직렬 115min → 병렬 ~50~60min 추정.
  // 시간 의존 root cause (H4 token expiration, 5h cycle 한도) 회피.
  // results.push는 single-threaded JS라 race-free. 순서는 niche/slotIdx 필드로 식별.
  console.log(`[auto-publish] niche간 병렬 시작: ${states.map((s) => s.niche).join(',')} (각 ${args.slotCount} slot)`);
  await Promise.all(
    states.map(async (state) => {
      for (let slotIdx = 1; slotIdx <= args.slotCount; slotIdx++) {
        let result: SlotResult;
        try {
          result = await processSlot(state, slotIdx, db, semanticBlocked);
        } catch (err) {
          console.error(`[${state.niche} slot${slotIdx}] uncaught:`, err);
          result = {
            niche: state.niche,
            slotIdx,
            status: 'failed',
            failureReason: `uncaught: ${errMessage(err)}`,
          };
        }
        results.push(result);

        // H8: error-path side effects (DB INSERT failed-row + GitHub Issue dispatch).
        if (result.status === 'failed') {
          try {
            await recordFailure(db, result, null);
          } catch (err) {
            console.error(`[${state.niche} slot${slotIdx}] recordFailure threw:`, errMessage(err));
          }
        } else if (result.status === 'skipped' && result.failureReason === 'queue_exhausted') {
          try {
            dispatchQueueExhaustedIssue(result.niche, result.slotIdx);
          } catch (err) {
            console.error(`[dispatch queue_exhausted] failed:`, errMessage(err));
          }
        }
      }
    }),
  );

  // F1'-a instrumentation: 5/6 검증용. claude CLI 누적 호출 + cron 운영 시간.
  const stats = getClaudeCallStats();
  console.log(`[llm-stats] claude calls=${stats.count}, uptime=${stats.uptimeMs ? (stats.uptimeMs / 60_000).toFixed(1) + 'min' : 'n/a'}`);

  const summary = writeSummary(results);
  backupDb();
  return decideExitCode(summary);
}

// Smoke-run entrypoint. Tests import { runMain } directly and never trigger this branch.
// We detect "ran as a script" via import.meta.url match against process.argv[1] —
// vitest sets argv[1] to its own runner, so this guard prevents process.exit() during tests.
const isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
})();

if (isMain) {
  runMain().then(
    (code) => process.exit(code),
    (err) => {
      console.error('[auto-publish] fatal:', err);
      process.exit(3);
    }
  );
}
