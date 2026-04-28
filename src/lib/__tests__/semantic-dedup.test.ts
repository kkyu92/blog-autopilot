import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import {
  batchSemanticDedup,
  loadRecentByNiche,
  type SemanticDedupCandidate,
  type RecentPublished,
} from '../semantic-dedup';
import { publishedPosts } from '../schema';

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle>;

beforeEach(() => {
  sqlite = new Database(':memory:');
  db = drizzle(sqlite);
  migrate(db, { migrationsFolder: './drizzle/migrations' });
});

describe('batchSemanticDedup', () => {
  it('returns empty when no candidates', async () => {
    const callMock = vi.fn();
    const result = await batchSemanticDedup([], {}, callMock);
    expect(result.duplicates).toEqual([]);
    expect(callMock).not.toHaveBeenCalled();
  });

  it('returns empty when no recent posts in relevant niches', async () => {
    const candidates: SemanticDedupCandidate[] = [
      { niche: 'WS', keyword: '춘곤증 극복법' },
    ];
    const callMock = vi.fn();
    const result = await batchSemanticDedup(candidates, { TS: [{ id: 1, niche: 'TS', keyword: '여행', category: null }] }, callMock);
    expect(result.duplicates).toEqual([]);
    expect(callMock).not.toHaveBeenCalled();
  });

  it('parses LLM response with duplicates', async () => {
    const candidates: SemanticDedupCandidate[] = [
      { niche: 'WS', keyword: '춘곤증 극복법' },
      { niche: 'TS', keyword: '일본 골든위크 여행 코스' },
    ];
    const recent: Record<string, RecentPublished[]> = {
      WS: [{ id: 1, niche: 'WS', keyword: '춘곤증 극복 방법 5가지', category: '건강·라이프' }],
      TS: [{ id: 4, niche: 'TS', keyword: '일본 황금연휴 여행', category: '일본여행' }],
    };
    const callMock = vi.fn().mockResolvedValue(JSON.stringify({
      duplicates: [
        { candidate_idx: 0, duplicate_of_id: 1, duplicate_of_keyword: '춘곤증 극복 방법 5가지', reason: '동일 토픽 동일 각도' },
        { candidate_idx: 1, duplicate_of_id: 4, duplicate_of_keyword: '일본 황금연휴 여행', reason: '황금연휴=골든위크 동의어' },
      ],
    }));

    const result = await batchSemanticDedup(candidates, recent, callMock);
    expect(result.duplicates).toHaveLength(2);
    expect(result.duplicates[0].candidate_idx).toBe(0);
    expect(result.duplicates[0].duplicate_of_id).toBe(1);
    expect(result.duplicates[1].candidate_idx).toBe(1);
    expect(result.duplicates[1].duplicate_of_id).toBe(4);
  });

  // 4/28 cron AS 28/29 ("여의도 재건축") 중복 통과 사고 회귀 — system prompt 강화 룰
  it('system prompt에 지명+토픽 sub-angle 변형 무관 차단 룰 + 여의도 예시 포함', async () => {
    const candidates: SemanticDedupCandidate[] = [{ niche: 'AS', keyword: 'k1' }];
    const recent: Record<string, RecentPublished[]> = {
      AS: [{ id: 28, niche: 'AS', keyword: '여의도 재건축 추진 현황 2026', category: null }],
    };
    const callMock = vi.fn().mockResolvedValue(JSON.stringify({ duplicates: [] }));

    await batchSemanticDedup(candidates, recent, callMock);

    const sys = callMock.mock.calls[0][0].systemPrompt;
    expect(sys).toContain('지명');
    expect(sys).toContain('sub-angle');
    expect(sys).toContain('여의도');
    // false negative 정책 변경: 지명+토픽 케이스는 확신 없어도 중복 판정
    expect(sys).toMatch(/확신 없어도 중복/);
  });

  it('passes candidates and recent posts in user message', async () => {
    const candidates: SemanticDedupCandidate[] = [
      { niche: 'WS', keyword: 'k1' },
    ];
    const recent: Record<string, RecentPublished[]> = {
      WS: [{ id: 1, niche: 'WS', keyword: 'old', category: 'cat' }],
    };
    const callMock = vi.fn().mockResolvedValue(JSON.stringify({ duplicates: [] }));

    await batchSemanticDedup(candidates, recent, callMock);

    expect(callMock).toHaveBeenCalledOnce();
    const userMsg = callMock.mock.calls[0][0].userMessage;
    const parsed = JSON.parse(userMsg);
    expect(parsed.new_candidates).toEqual([{ idx: 0, niche: 'WS', keyword: 'k1' }]);
    expect(parsed.recent_published).toEqual({
      WS: [{ id: 1, niche: 'WS', keyword: 'old', category: 'cat' }],
    });
    expect(callMock.mock.calls[0][0].expectJson).toBe(true);
  });

  it('filters recent_published to only relevant niches', async () => {
    const candidates: SemanticDedupCandidate[] = [
      { niche: 'WS', keyword: 'k1' },
    ];
    const recent: Record<string, RecentPublished[]> = {
      WS: [{ id: 1, niche: 'WS', keyword: 'old', category: 'c' }],
      TS: [{ id: 2, niche: 'TS', keyword: 'travel', category: 'c' }],
      AS: [{ id: 3, niche: 'AS', keyword: 'apt', category: 'c' }],
    };
    const callMock = vi.fn().mockResolvedValue(JSON.stringify({ duplicates: [] }));

    await batchSemanticDedup(candidates, recent, callMock);

    const userMsg = callMock.mock.calls[0][0].userMessage;
    const parsed = JSON.parse(userMsg);
    expect(Object.keys(parsed.recent_published)).toEqual(['WS']);
  });

  it('drops malformed duplicates from LLM response', async () => {
    const candidates: SemanticDedupCandidate[] = [
      { niche: 'WS', keyword: 'k1' },
    ];
    const recent: Record<string, RecentPublished[]> = {
      WS: [{ id: 1, niche: 'WS', keyword: 'old', category: null }],
    };
    const callMock = vi.fn().mockResolvedValue(JSON.stringify({
      duplicates: [
        { candidate_idx: 0, duplicate_of_id: 1, duplicate_of_keyword: 'old', reason: 'r' },
        { candidate_idx: 99, duplicate_of_id: 1 },  // out of range
        { not_an_object: true },                     // wrong shape
        null,                                         // null entry
        { candidate_idx: 'string', duplicate_of_id: 1 }, // wrong types
      ],
    }));

    const result = await batchSemanticDedup(candidates, recent, callMock);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].candidate_idx).toBe(0);
  });

  it('returns empty when LLM returns no duplicates field', async () => {
    const candidates: SemanticDedupCandidate[] = [
      { niche: 'WS', keyword: 'k1' },
    ];
    const recent: Record<string, RecentPublished[]> = {
      WS: [{ id: 1, niche: 'WS', keyword: 'old', category: null }],
    };
    const callMock = vi.fn().mockResolvedValue(JSON.stringify({}));

    const result = await batchSemanticDedup(candidates, recent, callMock);
    expect(result.duplicates).toEqual([]);
  });
});

describe('loadRecentByNiche', () => {
  function daysAgoISO(n: number): string {
    return new Date(Date.now() - n * 86_400_000).toISOString();
  }

  const BASE = {
    title: 'T',
    slug: 'slug',
    externalUrl: 'https://example.com/x',
  };

  it('returns rows grouped by niche within window', () => {
    db.insert(publishedPosts).values([
      { ...BASE, niche: 'WS', keyword: 'ws-keyword', slug: 'ws-1', platform: 'wordpress_ws', publishedAt: daysAgoISO(5), category: 'health' },
      { ...BASE, niche: 'TS', keyword: 'ts-keyword', slug: 'ts-1', platform: 'wordpress_ts', publishedAt: daysAgoISO(10), category: 'travel' },
      { ...BASE, niche: 'AS', keyword: 'as-keyword', slug: 'as-1', platform: 'blogger_as', publishedAt: daysAgoISO(20), category: 'apt' },
    ]).run();

    const result = loadRecentByNiche(db, ['WS', 'TS', 'AS'], 30);

    expect(result.WS).toHaveLength(1);
    expect(result.WS[0].keyword).toBe('ws-keyword');
    expect(result.TS).toHaveLength(1);
    expect(result.AS).toHaveLength(1);
  });

  it('excludes rows outside window', () => {
    db.insert(publishedPosts).values([
      { ...BASE, niche: 'WS', keyword: 'recent', slug: 's-recent', platform: 'wordpress_ws', publishedAt: daysAgoISO(5) },
      { ...BASE, niche: 'WS', keyword: 'old', slug: 's-old', platform: 'wordpress_ws', publishedAt: daysAgoISO(60) },
    ]).run();

    const result = loadRecentByNiche(db, ['WS'], 30);
    expect(result.WS).toHaveLength(1);
    expect(result.WS[0].keyword).toBe('recent');
  });

  it('returns empty arrays for niches with no posts', () => {
    const result = loadRecentByNiche(db, ['WS', 'TS'], 30);
    expect(result.WS).toEqual([]);
    expect(result.TS).toEqual([]);
  });
});
