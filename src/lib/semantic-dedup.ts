import { gte } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { callClaude } from './llm';
import { publishedPosts } from './schema';
import type { Niche } from './schema';

export interface SemanticDedupCandidate {
  niche: Niche;
  keyword: string;
}

export interface RecentPublished {
  id: number;
  niche: string;
  keyword: string;
  category: string | null;
}

export interface SemanticDedupDuplicate {
  candidate_idx: number;
  duplicate_of_id: number;
  duplicate_of_keyword: string;
  reason: string;
}

export interface SemanticDedupResult {
  duplicates: SemanticDedupDuplicate[];
}

type DrizzleDB = BetterSQLite3Database<Record<string, unknown>>;

const SYSTEM_PROMPT = `당신은 블로그 키워드 중복 판별기입니다. 신규 후보 키워드와 최근 발행된 키워드 목록을 비교해서 의미상 동일 토픽인 쌍을 찾아주세요.

판별 기준:
- 같은 핵심 토픽 + 같은 각도/접근 = 중복 (예: "춘곤증 극복 방법 5가지" vs "춘곤증 극복법" → 중복)
- 같은 핵심 토픽 + 다른 각도 = 중복 아님 (예: "황금연휴 여행" vs "황금연휴 항공권 특가" → 중복 아님)
- 다른 토픽이지만 상위 카테고리 공유 = 중복 아님 (예: "꽃가루 알레르기" vs "알레르기 비염" → 중복 아님)
- 한자어 ↔ 외래어 동의어 인지 (예: "황금연휴" = "골든위크", "한미정상회담" = "한미 서밋")
- niche 다르면 무조건 다른 토픽 (비교 자체 안 함)

같은 niche 안에서만 비교. 확신 없으면 중복 아님으로 판정 (false positive보다 false negative가 안전).`;

const RESPONSE_FORMAT_HINT = `
출력 형식 (JSON only):
{"duplicates": [{"candidate_idx": <int>, "duplicate_of_id": <int>, "duplicate_of_keyword": "<string>", "reason": "<string>"}]}

중복 없으면: {"duplicates": []}`;

interface CallClaudeFn {
  (opts: {
    systemPrompt: string;
    userMessage: string;
    expectJson?: boolean;
  }): Promise<string>;
}

export async function batchSemanticDedup(
  candidates: SemanticDedupCandidate[],
  recentByNiche: Record<string, RecentPublished[]>,
  callClaudeImpl: CallClaudeFn = callClaude,
): Promise<SemanticDedupResult> {
  if (candidates.length === 0) {
    return { duplicates: [] };
  }

  const relevantNiches = new Set(candidates.map((c) => c.niche));
  const recentFiltered: Record<string, RecentPublished[]> = {};
  for (const niche of relevantNiches) {
    const list = recentByNiche[niche] ?? [];
    if (list.length > 0) recentFiltered[niche] = list;
  }

  if (Object.keys(recentFiltered).length === 0) {
    return { duplicates: [] };
  }

  const userMsg = JSON.stringify({
    new_candidates: candidates.map((c, idx) => ({
      idx,
      niche: c.niche,
      keyword: c.keyword,
    })),
    recent_published: recentFiltered,
  });

  const raw = await callClaudeImpl({
    systemPrompt: SYSTEM_PROMPT + RESPONSE_FORMAT_HINT,
    userMessage: userMsg,
    expectJson: true,
  });

  const parsed = JSON.parse(raw) as { duplicates?: unknown };
  const duplicates: SemanticDedupDuplicate[] = [];

  if (Array.isArray(parsed.duplicates)) {
    for (const d of parsed.duplicates) {
      if (
        d &&
        typeof d === 'object' &&
        typeof (d as Record<string, unknown>).candidate_idx === 'number' &&
        typeof (d as Record<string, unknown>).duplicate_of_id === 'number'
      ) {
        const obj = d as Record<string, unknown>;
        const idx = obj.candidate_idx as number;
        if (idx < 0 || idx >= candidates.length) continue;
        duplicates.push({
          candidate_idx: idx,
          duplicate_of_id: obj.duplicate_of_id as number,
          duplicate_of_keyword: String(obj.duplicate_of_keyword ?? ''),
          reason: String(obj.reason ?? ''),
        });
      }
    }
  }

  return { duplicates };
}

export function loadRecentByNiche(
  db: DrizzleDB,
  niches: Niche[],
  windowDays: number = 30,
): Record<string, RecentPublished[]> {
  const cutoff = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  const rows = db
    .select({
      id: publishedPosts.id,
      niche: publishedPosts.niche,
      keyword: publishedPosts.keyword,
      category: publishedPosts.category,
    })
    .from(publishedPosts)
    .where(gte(publishedPosts.publishedAt, cutoff))
    .all();

  const result: Record<string, RecentPublished[]> = {};
  for (const niche of niches) result[niche] = [];
  for (const row of rows) {
    if (result[row.niche]) {
      result[row.niche].push({
        id: row.id,
        niche: row.niche,
        keyword: row.keyword,
        category: row.category,
      });
    }
  }
  return result;
}
