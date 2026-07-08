import { callClaude } from './llm';
import { factcheck } from './factcheck';
import { buildCurrentDateHeader, findOutdatedYearInTitle, getCurrentDate } from './current-date';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPT_PATH = path.resolve(__dirname, '../../prompts/agents/content-editor.md');
const PROMPT = fs.readFileSync(PROMPT_PATH, 'utf-8');

const STANDARD_DISCLAIMER_HTML =
  '<div style="margin-top:32px;padding:16px 20px;background:#F5F5F5;border-left:3px solid #999;border-radius:4px;font-size:14px;color:#555;line-height:1.7;">' +
  '<p style="margin:0 0 8px 0;font-weight:600;color:#1A1A1A;">⚠️ 면책 고지</p>' +
  '<p style="margin:0;">이 글은 정보 제공 목적이며, 전문 의료/법률/세무 상담을 대체하지 않습니다. 정책·법안·의학 정보는 변경될 수 있으므로 최신 정보를 직접 확인하시기 바랍니다.</p>' +
  '</div>';

const AUTHOR_BOX_BY_NICHE: Record<'HS' | 'TS' | 'AS', string> = {
  AS:
    '<div style="margin-top:40px;padding:20px 24px;background:#F8F9FA;border-radius:8px;border:1px solid #E8E8E8;">' +
    '<p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#888888;letter-spacing:0.04em;">글쓴이</p>' +
    '<p style="margin:0 0 6px 0;font-size:15px;font-weight:700;color:#1A1A1A;">시그널 에디터 | apt-signal</p>' +
    '<p style="margin:0;font-size:14px;color:#555555;line-height:1.7;">수도권 아파트 분양·청약 시장을 분석하는 부동산 정보 블로그 apt-signal 운영자입니다. ' +
    '<a href="https://rt.molit.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">국토교통부 실거래가 데이터</a>와 ' +
    '<a href="https://www.applyhome.co.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">청약홈 통계</a>를 기반으로 콘텐츠를 작성합니다.</p>' +
    '</div>',
  HS:
    '<div style="margin-top:40px;padding:20px 24px;background:#F8F9FA;border-radius:8px;border:1px solid #E8E8E8;">' +
    '<p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#888888;letter-spacing:0.04em;">글쓴이</p>' +
    '<p style="margin:0 0 6px 0;font-size:15px;font-weight:700;color:#1A1A1A;">헬스 에디터 | health-signal</p>' +
    '<p style="margin:0;font-size:14px;color:#555555;line-height:1.7;">' +
    '<a href="https://www.mohw.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">보건복지부</a>·' +
    '<a href="https://www.kdca.go.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">질병관리청</a> 공식 가이드라인과 의학 연구를 기반으로 건강 정보를 큐레이션하는 health-signal 운영자입니다. ' +
    '이 블로그의 콘텐츠는 전문가 상담을 대체하지 않으며, 정확한 정보 전달을 목표로 합니다.</p>' +
    '</div>',
  TS:
    '<div style="margin-top:40px;padding:20px 24px;background:#F8F9FA;border-radius:8px;border:1px solid #E8E8E8;">' +
    '<p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#888888;letter-spacing:0.04em;">글쓴이</p>' +
    '<p style="margin:0 0 6px 0;font-size:15px;font-weight:700;color:#1A1A1A;">트립 에디터 | trip-signal</p>' +
    '<p style="margin:0;font-size:14px;color:#555555;line-height:1.7;">국내외 여행 정보와 실용적인 여행 팁을 큐레이션하는 trip-signal 운영자입니다. ' +
    '<a href="https://www.visitkorea.or.kr" target="_blank" rel="noopener noreferrer" style="color:#4285F4;">한국관광공사</a> 공식 데이터와 직접 수집한 여행 정보를 바탕으로 콘텐츠를 제작합니다.</p>' +
    '</div>',
};

// 5/4 ADMIN view 검증: factcheck "표준 wording 부재" soft-warn은 본문에 의미상 동등한 다른 wording의
// disclaimer가 있어도 발생. broader idempotent check — '면책 고지' / '면책고지' (이모지 변형 포함) 매칭이면 skip.
const DISCLAIMER_PATTERNS = ['면책 고지', '면책고지'];
const AUTHOR_BOX_PATTERN = 'apt-signal 운영자|health-signal 운영자|trip-signal 운영자';

function injectStandardDisclaimer(html: string): string {
  if (DISCLAIMER_PATTERNS.some((p) => html.includes(p))) return html; // idempotent
  const lastDivIdx = html.lastIndexOf('</div>');
  if (lastDivIdx < 0) return html + STANDARD_DISCLAIMER_HTML;
  return html.slice(0, lastDivIdx) + STANDARD_DISCLAIMER_HTML + html.slice(lastDivIdx);
}

function injectAuthorBox(html: string, niche: 'HS' | 'TS' | 'AS'): string {
  if (new RegExp(AUTHOR_BOX_PATTERN).test(html)) return html; // idempotent
  return html + AUTHOR_BOX_BY_NICHE[niche];
}

export interface EditorReviewInput {
  draft: {
    title: string;
    content_html: string;
    word_count: number;
    image_slots?: Array<{ slot_id: string; search_query: string; alt_text: string }>;
    faq?: Array<{ q: string; a: string }>;
    keyword: string;
    [key: string]: unknown; // allow extra writer agent fields without breaking
  };
  niche: 'HS' | 'TS' | 'AS';
}

export interface EditorReviewResult {
  verdict: 'pass' | 'revision_needed';
  score: number;
  reason?: string;
  feedback?: string;
  disclaimer_inserted?: boolean; // signals caller to update draft.content_html
  author_box_inserted?: boolean;
  modified_html?: string;        // returned separately — caller decides to apply
  // 5/29 AdSense reject family ("가치 있는 인벤토리 부족"): factcheck severity='critical' 이슈 수.
  // >0 면 writeAndReview soft-pass / salvage 차단 — AI slop 출처 부실 패턴이 attempt 2 도 못 고치면
  // 발행 자체를 막아 AdSense reviewer 노출 차단. 0 이면 기존 soft-warn 정책 그대로.
  factcheck_critical_count?: number;
  final_html?: string;           // from LLM persona output, present when LLM approves (status='approved')
  final_meta?: {                 // from LLM persona output, present when LLM approves
    title: string;
    meta_description: string;
    slug: string;
    labels: string[];
  };
}

export async function review(input: EditorReviewInput): Promise<EditorReviewResult> {
  const { draft, niche } = input;

  // Step 1: Quantitative checks (synchronous, fast)
  const issues: string[] = [];
  if (draft.word_count < 1200) {
    issues.push('word_count < 1200, 더 길게 써야 함 (최소 1200 단어 필요)');
  }
  if (!draft.image_slots || draft.image_slots.length < 2) {
    issues.push('image_slots 최소 2개 필요 (현재 부족)');
  }
  // Step 1b: Outdated year guard (4/28 사고 회귀 — post 30 "장기안심주택 ... 2025" 발행).
  // title 에 current_year 미만 연도 박혀있으면 hard reject. soft-warn 정책의 예외.
  // 외부 노출 (Blogger URL slug 까지 영향) + outdated 신뢰성 손실이 disclaimer로 cover 안 됨.
  const { year: currentYear } = getCurrentDate();
  const outdatedYear = findOutdatedYearInTitle(draft.title, currentYear);
  if (outdatedYear !== null) {
    issues.push(
      `title outdated year: ${outdatedYear} (현재 연도: ${currentYear}). evergreen이면 연도 빼고, ` +
        `시의성 강한 토픽이면 ${currentYear}로 변경.`,
    );
  }

  // Step 2a: Author box injection (all niches — AdSense E-E-A-T authorship signal)
  let authorBoxInserted = false;
  let disclaimerInserted = false;
  let modifiedHtml: string | undefined;
  let factcheckCriticalDescriptions: string[] = [];

  {
    const injected = injectAuthorBox(draft.content_html, niche);
    if (injected !== draft.content_html) {
      authorBoxInserted = true;
      modifiedHtml = injected;
      console.log(`[editor] author box injected for ${niche}`);
    }
  }

  // Step 2b: YMYL factcheck (HS/AS niche only)
  if (niche === 'HS' || niche === 'AS') {
    // factcheck를 hard reject로 사용하지 않음. 운영 데이터 누적 전엔 학술 수준 출처(DOI/저널/URL) 강제는
    // 비현실적 (LLM이 매번 fail). 일단 console.warn 으로 logging + disclaimer만 적용. score deduction은
    // LLM editor의 quality_score에 위임. 운영 1주 후 정책 재검토.
    //
    // 4/28 cron 25010381167 사고: factcheck 내부 callClaude (claude CLI) 가 응답 없이 무한 hang →
    // editor.review() 도 await 무한 대기 → 슬롯 단위 격리 안 됨, 전체 cron 점유.
    // soft-warn 정책의 자연스러운 연장: factcheck timeout/error도 soft-degrade (skip + 진행).
    let fc: Awaited<ReturnType<typeof factcheck>>;
    try {
      fc = await factcheck({ niche, draft });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[editor] factcheck threw (soft-degrade for ${niche}): ${msg}`);
      fc = { verdict: 'skipped' };
    }
    if (fc.verdict === 'needs_revision') {
      const fcDescriptions = fc.issues?.map((i) => i.description).join('; ') ?? 'factcheck 실패';
      console.warn(`[editor] factcheck soft-warn for ${niche} (no hard reject): ${fcDescriptions}`);
      // 5/29 AdSense reject family: critical 이슈 (출처 전무/URL 미제공/발화자 미명시/URL-데이터 불일치 등)
      // 는 별도 escalation. writeAndReview soft-pass/salvage 차단 신호로 누적.
      factcheckCriticalDescriptions = (fc.issues ?? [])
        .filter((i) => i.severity === 'critical')
        .map((i) => i.description);
      if (factcheckCriticalDescriptions.length > 0) {
        console.warn(
          `[editor] factcheck CRITICAL for ${niche} (count=${factcheckCriticalDescriptions.length}): ${factcheckCriticalDescriptions.join('; ')}`,
        );
      }
    }
    // Disclaimer injection: base off modifiedHtml (contains author box) if present, else draft.content_html
    const baseForDisclaimer = modifiedHtml ?? draft.content_html;
    if (fc.disclaimer_added && fc.modified_html) {
      // factcheck returned its own modified_html — re-inject author box on top if needed
      disclaimerInserted = true;
      const withAuthorBox = injectAuthorBox(fc.modified_html, niche);
      modifiedHtml = withAuthorBox;
    } else if (fc.verdict === 'needs_revision') {
      // 5/3~5/4 evidence (자연실험 9건 발행 중 AS 78/85/88 누락):
      // factcheck가 disclaimer 누락을 issues.type='disclaimer'로 감지하고 soft-warn 으로만 보고하면서
      // disclaimer_added=false + modified_html 미반환 → caller fix 메커니즘 (44f6d95) bypass.
      // L1 fallback: editor가 자체 표준 면책 박스 inject. idempotent (⚠️ 면책 고지 이미 있으면 skip).
      const hasDisclaimerIssue = fc.issues?.some((i) => i.type === 'disclaimer') ?? false;
      if (hasDisclaimerIssue) {
        const injected = injectStandardDisclaimer(baseForDisclaimer);
        if (injected !== baseForDisclaimer) {
          disclaimerInserted = true;
          modifiedHtml = injected;
          console.warn(`[editor] L1 fallback disclaimer injected for ${niche} (factcheck soft-warn + disclaimer_added missing)`);
        }
      }
    }
  }

  // Step 3: LLM qualitative review (tone, structure, CTA)
  const raw = await callClaude({
    systemPrompt: buildCurrentDateHeader() + PROMPT,
    userMessage: JSON.stringify(draft),
    expectJson: true,
  });

  const parsed = JSON.parse(raw);
  // Persona schema는 'status' = 'approved'|'revision_needed' 이지만 LLM이 verdict/approved/quality_score만
  // 반환하는 drift 케이스 대응 (운영 중 발견). 다양한 키 fallback.
  const inferStatus = (p: Record<string, unknown>): 'approved' | 'revision_needed' => {
    // 5/26 cron 26413387928 AS 청약 가점 evidence: editor LLM 이 review 응답을 array 로 반환 (raw keys: 0,1,2,3,4) drift.
    // 모든 status/verdict/score 분기 miss → throw 로 슬롯 영구 fail. CHUNK_PATTERN 처리와 동일하게
    // revision_needed 로 fallback 해서 writeAndReview attempt 2 retry 유도.
    if (Array.isArray(p)) return 'revision_needed';
    if (p.status === 'approved' || p.status === 'revision_needed') return p.status;
    if (p.verdict === 'approved' || p.verdict === 'pass') return 'approved';
    if (p.verdict === 'revision_needed' || p.verdict === 'fail') return 'revision_needed';
    if (typeof p.approved === 'boolean') return p.approved ? 'approved' : 'revision_needed';
    const score =
      typeof p.quality_score === 'number'
        ? p.quality_score
        : typeof p.score === 'number'
          ? p.score
          : null;
    if (score !== null) return score >= 80 ? 'approved' : 'revision_needed';
    // 4/29 dispatch 25091647631 evidence: LLM이 status/verdict 누락한 채 final_meta만 반환하는
    // drift 발생 (WS/5월 가정의 달 fail). final_meta는 persona schema상 approve 시에만 생성되는
    // 필드 (line 34 주석). final_meta 존재 = LLM이 통과시킨 결과물 → approved로 처리.
    if (typeof p.final_meta === 'object' && p.final_meta !== null) return 'approved';
    // 5/2 cron 25224338485 AS 분당 재건축 evidence: final_meta wrap이 풀려 그 4 필드(title,
    // meta_description, slug, labels)가 최상위에 flat된 drift 변형. 위 line 121 fallback은 wrap된
    // 케이스만 잡아 풀린 케이스 영구 fail. 핵심 4 키 모두 매칭이면 wrap이 풀린 approve 응답으로 추론.
    const FLAT_FINAL_META_KEYS = ['title', 'meta_description', 'slug', 'labels'] as const;
    if (FLAT_FINAL_META_KEYS.every((k) => k in p)) return 'approved';
    // 5/7 cron 25451848284 TS FIFA 월드컵 호텔 예약 evidence: LLM이 review 응답을 chunk 패턴
    // (_resume_note + html_part2) 으로 반환 — review 자체가 incomplete 상태로 보아야 함. throw
    // 대신 revision_needed 처리해서 writeAndReview attempt 2에서 재시도 (5/2 flat-final_meta
    // drift 패밀리와 동일 회복 메커니즘).
    // 7/9 issue #353 AS 부산 재개발 재건축 evidence: LLM이 final_html_remaining 단일 키만 반환하는
    // 새 청크 드리프트 — 동일 revision_needed fallback으로 재시도 유도.
    const CHUNK_PATTERN_KEYS = ['_resume_note', '_continue', 'html_part1', 'html_part2', 'html_part3', 'final_html_remaining'];
    if (CHUNK_PATTERN_KEYS.some((k) => k in p)) return 'revision_needed';
    throw new Error(
      `editor: missing status/verdict (raw keys: ${Object.keys(p).join(',')})`,
    );
  };
  const status = inferStatus(parsed);

  const llmRevisionNeeded = status === 'revision_needed';
  const factcheckCriticalCount = factcheckCriticalDescriptions.length;
  const factcheckCriticalNeeded = factcheckCriticalCount > 0;
  const score = parsed.quality_score ?? parsed.score ?? (llmRevisionNeeded ? 60 : 85);
  const llmFeedback = parsed.revision_notes ?? '';

  const injectionMeta = {
    ...(authorBoxInserted && { author_box_inserted: true }),
    ...(disclaimerInserted && { disclaimer_inserted: true }),
    ...(modifiedHtml !== undefined && { modified_html: modifiedHtml }),
    ...(factcheckCriticalCount > 0 && { factcheck_critical_count: factcheckCriticalCount }),
  };

  // Combine all failure signals
  if (issues.length > 0 || llmRevisionNeeded || factcheckCriticalNeeded) {
    const feedbackParts = [...issues];
    if (factcheckCriticalNeeded) {
      feedbackParts.unshift(
        `[CRITICAL FACTCHECK] ${factcheckCriticalDescriptions.join('; ')}`,
      );
    }
    if (llmFeedback) feedbackParts.push(llmFeedback);

    return {
      verdict: 'revision_needed',
      score,
      reason: feedbackParts.join('; '),
      feedback: feedbackParts.join('\n'),
      ...injectionMeta,
    };
  }

  // LLM approved — carry through final_html and final_meta from persona output
  return {
    verdict: 'pass',
    score,
    ...injectionMeta,
    ...(parsed.final_html !== undefined && { final_html: parsed.final_html }),
    ...(parsed.final_meta !== undefined && { final_meta: parsed.final_meta }),
  };
}
