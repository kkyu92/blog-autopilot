import { describe, it, expect } from 'vitest';
import { aggregateTsSignals, isTravelRelated, type TravelSignal } from '../travel-news';

describe('isTravelRelated', () => {
  it.each([
    ['황금연휴 여행 추천', true],
    ['제주도 호텔 BEST', true],
    ['일본 비자면제 안내', true],
    ['해외여행 항공권 특가', true],
    ['관광객 1000만 돌파', true],
    // negative
    ['아파트 매매 시장', false],
    ['건강검진 항목', false],
    ['연예인 스캔들', false],
  ])('"%s" → %s', (title, expected) => {
    expect(isTravelRelated(title)).toBe(expected);
  });
});

describe('aggregateTsSignals', () => {
  it('각 source 결과 통합 + 시간 윈도우 필터 + dedup', async () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 1 * 3_600_000).toUTCString();
    const old = new Date(now.getTime() - 100 * 3_600_000).toUTCString();
    const mk = (s: TravelSignal['source'], titles: string[], dates: string[]): TravelSignal[] =>
      titles.map((t, i) => ({ title: t, link: 'x', pubDate: dates[i], source: s }));

    const result = await aggregateTsSignals({
      windowHours: 72,
      fetchers: {
        travelTimes: async () => mk('travel-times', ['항공권 가격 동향'], [recent]),
        koreaPolicy: async () => mk('korea-policy', ['관광 진흥 정책', '오래된 발표'], [recent, old]),
        googleNewsTravel: async () => mk('google-news-travel', ['해외여행 트렌드'], [recent]),
        googleNewsAccommodation: async () => mk('google-news-accommodation', ['호텔 BEST'], [recent]),
        googleNewsSeason: async () => mk('google-news-season', ['항공권 가격 동향'], [recent]), // dup
      },
    });

    expect(result).toHaveLength(4);
    expect(result.map((r) => r.source).sort()).toEqual(
      ['google-news-accommodation', 'google-news-travel', 'korea-policy', 'travel-times'].sort(),
    );
  });

  it('단일 source 실패해도 나머지 산출', async () => {
    const recent = new Date(Date.now() - 1 * 3_600_000).toUTCString();
    const result = await aggregateTsSignals({
      fetchers: {
        travelTimes: async () => { throw new Error('boom'); },
        koreaPolicy: async () => [],
        googleNewsTravel: async () => [{ title: '해외여행 트렌드', link: 'x', pubDate: recent, source: 'google-news-travel' }],
        googleNewsAccommodation: async () => [],
        googleNewsSeason: async () => [],
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('google-news-travel');
  });
});
