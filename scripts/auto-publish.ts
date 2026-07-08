import { parseArgs } from 'node:util';
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { runAll } from '../src/lib/healthcheck';
import { pickQueue, type KeywordCandidate } from '../src/lib/trends';
import { getFixedTopicKeyword } from '../src/lib/fixed-topics';
import { checkAndResolve, type DedupResult } from '../src/lib/dedup';
import { getDb } from '../src/lib/db';
import { callClaude, getClaudeCallStats } from '../src/lib/llm';
import { buildCurrentDateHeader } from '../src/lib/current-date';
import { review, type EditorReviewResult } from '../src/lib/editor';
import { fetchForSlots, type ImageResult } from '../src/lib/images';
import { publishScheduled as bloggerPublish } from '../src/lib/blogger';
import { publishedPosts } from '../src/lib/schema';
import {
  batchSemanticDedup,
  loadRecentByNiche,
  type SemanticDedupCandidate,
} from '../src/lib/semantic-dedup';
import { buildTransactionContext } from '../src/lib/molit';
import { pickSlotTime, assignSlug, toIsoUtc, errMessage } from './lib/slot-utils';
import { injectImages } from './lib/html-utils';

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'agents');
const WRITER_PROMPT = readFileSync(join(PROMPTS_DIR, 'content-writer.md'), 'utf8');
const REQUIRED_DRAFT_FIELDS = ['title', 'slug', 'meta_description', 'content_html', 'word_count'] as const;
// PUBLISH_HOURS_KST, pickSlotTime, assignSlug, toIsoUtc, errMessage → ./lib/slot-utils
// escAttr, buildImageFigure, injectImages → ./lib/html-utils

type Niche = 'HS' | 'TS' | 'AS';
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

async function pickAllQueues(niches: Niche[], slotCount: number): Promise<NicheQueue[]> {
  // 4/28 사고 후 paperclip 안정성 복원: trend-hunter agent가 출력 단계에서 cannibalization
  // 사전 차단하도록 최근 30일 발행 키워드 리스트 inject. semantic-dedup layer는 backup으로.
  const db = getDb();
  const recentByNiche = loadRecentByNiche(db, niches, 30);

  // slotCount + 3 buffer: dedup skip으로 소진되는 후보 보충 (56+ posts 이후 dedup 압력 증가)
  const candidateCount = slotCount + 3;

  const queues: NicheQueue[] = [];
  for (const niche of niches) {
    const recentKeywords = (recentByNiche[niche] ?? []).map((r) => r.keyword);
    const keywords = await pickQueue({ niche, count: candidateCount, recent_published_keywords: recentKeywords });
    console.log(`[auto-publish] queue ${niche}: ${keywords.length} keywords (recent_inject: ${recentKeywords.length})`);
    if (keywords.length === 0) {
      console.warn(`[auto-publish] WARN ${niche} queue empty, skipping niche`);
      continue;
    }

    // 고정 주제 슬롯 (slot 1): AS=인기 청약 공고, TS=인기 국내 축제, HS=숙면 variant
    const fixedKeyword = await getFixedTopicKeyword(niche).catch((err) => {
      console.warn(`[fixed-topics] ${niche} failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    });
    if (fixedKeyword) {
      keywords.unshift(fixedKeyword);
      console.log(`[auto-publish] queue ${niche}: fixed topic prepended → ${fixedKeyword.keyword}`);
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

// 5/17 fix: writer callClaude 15min hard timeout 발생 시 1회 자동 retry.
// evidence: 5/13 잠실 장미아파트 + 5/17 1주택자 양도세 — 둘 다 부동산 정책+시뮬레이션 키워드 단발 fail.
// 모델 출력 매우 길어져 첫 응답 안 옴 → SIGTERM. retry 는 다른 seed 라 짧게 끝날 가능성.
// retry 도 timeout 이면 keyword permanent fail (기존 동작 유지). 슬롯 cascade hang 위험 없음 (병렬).
async function callWriterWithTimeoutRetry(systemPrompt: string, userMessage: string): Promise<string> {
  try {
    return await callClaude({ systemPrompt, userMessage, expectJson: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/SIGTERM|timeout/i.test(msg)) throw err;
    console.warn(`[writer] timeout (1차) — 1회 자동 retry: ${msg.slice(0, 120)}`);
    return await callClaude({ systemPrompt, userMessage, expectJson: true });
  }
}

async function writeAndReview(
  niche: Niche,
  keyword: string,
  contentType: string | undefined,
): Promise<{ draft: WriterDraft; images: ImageResult[]; review: EditorReviewResult }> {
  let lastFeedback = '';
  let lastDraft: WriterDraft | null = null;
  let lastImages: ImageResult[] = [];
  let lastReview: EditorReviewResult | null = null;

  // AS 니치는 실거래가 데이터 inject (지역 키워드 포함 시)
  let realTransactionData: string | null = null;
  if (niche === 'AS') {
    realTransactionData = await buildTransactionContext(keyword).catch((err) => {
      console.warn(`[molit] buildTransactionContext error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    });
    if (realTransactionData) {
      console.log(`[AS] molit 실거래가 데이터 주입: ${keyword} (${realTransactionData.split('\n')[0]})`);
    }
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    const userMessage = JSON.stringify({
      niche,
      keyword,
      content_type: contentType,
      include_charts: false, // 차트는 파이프라인 미지원 (chart_slots 빈 배열 강제)
      chart_recommended: false,
      revision_feedback: attempt === 1 ? null : lastFeedback,
      ...(realTransactionData ? { real_transaction_data: realTransactionData } : {}),
    });

    const writerOutput = await callWriterWithTimeoutRetry(
      buildCurrentDateHeader() + WRITER_PROMPT,
      userMessage,
    );
    const parsed = JSON.parse(writerOutput) as Record<string, unknown>;
    // F2-A (4/30 fix): missing field → 즉시 throw 대신 revision_feedback으로 attempt 2 retry.
    // 4/30 cron 25124826827 evidence: WS 자가면역 글이 LLM JSON drift로 title 필드 누락 →
    // 기존 throw가 attempt 1에서 슬롯 영구 실패로 만듦. editor revision_needed와 동일한 retry 메커니즘 적용.
    // F2-A 강화 (5/1 evidence): 5/1 cron 25180460128 AS 양도세 슬롯이 attempt 2에서도 title 누락 →
    // revision_feedback wording을 [CRITICAL FINAL] prefix + "begin response with..." 강제 형태로 강화.
    const missingFields = REQUIRED_DRAFT_FIELDS.filter((f) => parsed[f] == null);
    if (missingFields.length > 0) {
      // Diagnostic: log actual keys present to distinguish error-object vs partial-draft vs empty-object
      const presentKeys = Object.keys(parsed).slice(0, 10).join(',');
      console.warn(`[${niche}] writer attempt ${attempt} parsed keys: [${presentKeys || '(empty)'}]`);
      if (attempt < 2) {
        // 7/9 fix: ALL required fields missing = LLM returned error object, not partial draft.
        // Rule 19 (added 7/8) likely caused LLM to refuse writing due to "no sourced numbers" — but
        // Rule 16 fallback + hedging expressions IS compliant with Rule 19. Spell this out explicitly.
        const allMissing = missingFields.length === REQUIRED_DRAFT_FIELDS.length;
        const feedback = allMissing
          ? `[CRITICAL: ERROR OBJECT DETECTED — final retry] Your previous response returned a non-draft JSON (keys: [${presentKeys || 'empty'}]). You likely returned {"error": "..."} instead of using the Rule 16 fallback strategy. IMPORTANT: Rule 19 does NOT justify returning an error object. Per Rule 16, when specific data for "${keyword}" is unavailable, use a fallback angle: (1) 입지·교통 분석형 — ${keyword} 단지 위치·교통·인프라 + 인천 부동산 시장 동향, (2) 청약 전략 가이드형 — 1순위 자격·가점·당첨 전략 가이드, (3) 지역 시장 현황형 — 해당 구·동 시세 동향 + 전망. All unknown numbers MUST use hedging: '약 ○○가구 규모(업계 추정)', '예상 분양가 X억대(시장 관측)' — this satisfies Rule 19. Your response MUST begin with {"title": " and include ALL required fields: title, slug, meta_description, content_html (1800+ words), word_count, image_slots, chart_slots, faq_schema, keyword.`
          : `[CRITICAL SCHEMA FAILURE — final retry] Previous response was rejected because it omitted required field(s): ${missingFields.join(', ')}. Your next JSON MUST include ALL of: title, slug, meta_description, content_html, word_count, image_slots, chart_slots, faq_schema, keyword. Begin response with {"title": "..." and emit the COMPLETE WriterDraft object. If any required field is missing or empty, the entire slot is permanently discarded.`;
        console.warn(`[${niche}] writer attempt ${attempt} schema fail: missing ${missingFields.join(',')}${allMissing ? ' (ALL — error object suspected)' : ''} — retry with revision_feedback`);
        lastFeedback = feedback;
        continue;
      }
      // attempt 2 schema fail — but attempt 1 had a soft-pass-able draft? salvage it.
      // 5/25 evidence: TS 가고시마 attempt 1 = schema OK + editor revision_needed score=79 (>= SOFT_PASS_THRESHOLD),
      // attempt 2 = writer LLM drift (5 fields missing) → throw 가 soft-pass fallback 앞에서 발생해 영구 실패.
      // 5/29 추가: factcheck CRITICAL 이슈 (출처 전무/URL 미제공/발화자 미명시/URL-데이터 불일치 등)
      // 가 attempt 1 에 남아있으면 salvage X — AdSense reviewer 노출 차단 우선.
      if (lastDraft && lastReview && lastReview.score >= SOFT_PASS_THRESHOLD) {
        if ((lastReview.factcheck_critical_count ?? 0) > 0) {
          throw new Error(
            `editor_reject_factcheck_critical (attempt 1 score=${lastReview.score}, critical=${lastReview.factcheck_critical_count}, attempt 2 schema fail)`,
          );
        }
        console.log(
          `[${niche}] writer attempt 2 schema fail but attempt 1 soft-pass-able (score=${lastReview.score}) — salvaging attempt 1 draft`,
        );
        return { draft: lastDraft, images: lastImages, review: lastReview };
      }
      throw new Error(`writer: missing fields [${missingFields.join(',')}] (attempt 2/2 still missing)`);
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

    // 5/2 8건 spot-check evidence: factcheck → editor.modified_html 메커니즘은 동작하지만
    // caller(여기)가 무시 → publish가 disclaimer 누락된 원본 사용. 5/1 3건 + 5/2 2건 사후 patch
    // 패턴 발생. fix: review가 disclaimer/author_box 자동 inject 했으면 publish 직전 content_html에 반영.
    if (result.modified_html) {
      draftWithImages.content_html = result.modified_html;
    }

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
  // 5/29 추가: factcheck CRITICAL 이슈 (출처 전무/URL 미제공/발화자 미명시/URL-데이터 불일치 등)
  // 가 attempt 2 까지 못 풀리면 soft-pass X — AdSense "가치 있는 인벤토리 부족" reject family 차단.
  if (lastReview && lastDraft && lastReview.score >= SOFT_PASS_THRESHOLD) {
    if ((lastReview.factcheck_critical_count ?? 0) > 0) {
      throw new Error(
        `editor_reject_factcheck_critical (last score=${lastReview.score}, critical=${lastReview.factcheck_critical_count})`,
      );
    }
    console.log(
      `[${niche}] writer attempt 2 soft-pass (score=${lastReview.score} >= ${SOFT_PASS_THRESHOLD}) — accepting microconsistency issues, publishing as-is`,
    );
    return { draft: lastDraft, images: lastImages, review: lastReview };
  }

  throw new Error(`editor_reject_x2 (last score=${lastReview?.score ?? '?'})`);
}

// escAttr, buildImageFigure, injectImages → ./lib/html-utils (imported at top)

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
  // 5/5 WP→Blogger 마이그레이션 후 niche 3개 모두 Blogger publishScheduled 단일 분기.
  // finalSlug + meta_description은 Blogger API에서 직접 사용 X (URL은 title 기반 자동 생성, excerpt 별도 미지원).
  void finalSlug;
  void imageResults;

  const faqItems = (draft.faq_schema as FaqItem[] | undefined ?? []).filter(
    (f): f is FaqItem => typeof f?.question === 'string' && typeof f?.answer === 'string',
  );
  const contentWithSchema = injectJsonLd(draft.content_html, draft.title, niche, scheduledFor, faqItems, draft.meta_description, draft.labels);

  return bloggerPublish(
    niche,
    {
      title: draft.title,
      content: contentWithSchema,
      labels: draft.labels,
    },
    scheduledFor,
  );
}

function platformForNiche(niche: Niche): 'blogger_as' | 'blogger_trip' | 'blogger_health' {
  if (niche === 'TS') return 'blogger_trip';
  // (도메인 trip-signal.blogspot.com — niche 명명은 TS 그대로 유지)
  if (niche === 'HS') return 'blogger_health';
  return 'blogger_as';
}

const NICHE_SITE_META: Record<Niche, { siteName: string; siteUrl: string; authorName: string; authorUrl: string }> = {
  AS: {
    siteName: 'apt-signal',
    siteUrl: 'https://apt-signal.blogspot.com',
    authorName: '시그널 에디터',
    authorUrl: 'https://apt-signal.blogspot.com/p/blog-page.html',
  },
  HS: {
    siteName: 'health-signal',
    siteUrl: 'https://health-signal.blogspot.com',
    authorName: '헬스 에디터',
    authorUrl: 'https://health-signal.blogspot.com/p/health-signal.html',
  },
  TS: {
    siteName: 'trip-signal',
    siteUrl: 'https://trip-signal.blogspot.com',
    authorName: '트립 에디터',
    authorUrl: 'https://trip-signal.blogspot.com/p/trip-signal.html',
  },
};

interface FaqItem {
  question: string;
  answer: string;
}

function injectJsonLd(
  html: string,
  title: string,
  niche: Niche,
  scheduledFor: Date,
  faqSchema: FaqItem[],
  metaDescription?: string,
  labels?: string[],
): string {
  const meta = NICHE_SITE_META[niche];
  const dateIso = scheduledFor.toISOString();

  const articleSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    author: {
      '@type': 'Person',
      name: meta.authorName,
      url: meta.authorUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: meta.siteName,
      url: meta.siteUrl,
    },
    datePublished: dateIso,
    dateModified: dateIso,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': meta.siteUrl,
    },
    inLanguage: 'ko',
  };

  if (metaDescription) articleSchema.description = metaDescription;
  if (labels && labels.length > 0) articleSchema.keywords = labels.join(', ');

  const schemas: object[] = [articleSchema];

  if (faqSchema.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqSchema.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    });
  }

  const scriptBlock = schemas
    .map((s) => `<script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n</script>`)
    .join('\n');

  return html + '\n' + scriptBlock;
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
  let editorScore: number | null = null;
  try {
    const out = await writeAndReview(
      niche,
      candidate.keyword,
      dedupResult.suggested_content_type,
    );
    draft = out.draft;
    imageResults = out.images;
    editorScore = out.review.score ?? null;
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
      qualityScore: editorScore,
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
    const logPath = join(logDir, 'blog-autopilot.log');
    try {
      if (statSync(logPath).size > 1_048_576) {
        renameSync(logPath, join(logDir, 'blog-autopilot.log.1'));
      }
    } catch { /* file may not exist yet */ }
    appendFileSync(logPath, line + '\n');
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
    ? ['HS', 'TS', 'AS']
    : (nicheArg.split(',') as Niche[]);

  for (const n of niches) {
    if (!['HS', 'TS', 'AS'].includes(n)) {
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
  const queues = await pickAllQueues(args.niches, args.slotCount);
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
