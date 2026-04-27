import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  aggregateAsSignals,
  parseSimpleRss,
  isRealEstateRelated,
  type RealEstateSignal,
} from '../realestate-news';

describe('parseSimpleRss', () => {
  it('extracts title/link/pubDate from typical RSS', () => {
    const xml = `
      <rss>
        <channel>
          <item>
            <title><![CDATA[양천·영등포 한강벨트 매물 소화 속도]]></title>
            <link>https://www.mk.co.kr/news/realestate/11305289</link>
            <pubDate>Sun, 27 Apr 2026 04:00:00 +0900</pubDate>
          </item>
          <item>
            <title>LH 1000가구 매입임대 공모</title>
            <link>https://example.com/2</link>
            <pubDate>Sun, 27 Apr 2026 03:00:00 +0900</pubDate>
          </item>
        </channel>
      </rss>
    `;
    const items = parseSimpleRss(xml);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('양천·영등포 한강벨트 매물 소화 속도');
    expect(items[0].link).toBe('https://www.mk.co.kr/news/realestate/11305289');
    expect(items[1].title).toBe('LH 1000가구 매입임대 공모');
  });

  it('decodes HTML entities in title', () => {
    const xml = `<rss><item><title>&quot;공급 확대&quot; 5월 1만9000가구</title><link>x</link><pubDate>x</pubDate></item></rss>`;
    const items = parseSimpleRss(xml);
    expect(items[0].title).toBe('"공급 확대" 5월 1만9000가구');
  });

  it('returns empty when no items', () => {
    expect(parseSimpleRss('<rss></rss>')).toEqual([]);
  });
});

describe('isRealEstateRelated', () => {
  it.each([
    // 기존 케이스 (12)
    ['청약 1순위 조건 2026', true],
    ['LH 매입임대 공모 시작', true],
    ['SH 장기안심주택 6000가구', true],
    ['LTV 70% 완화 발표', true],
    ['양도세 비과세 요건 변경', true],
    ['신혼부부 특별공급 가점제', true],
    ['GTX 노선 개통 예정', true],
    ['반도체 미분양 무덤 되살린', true],
    ['스포츠 야구 KBO 우승', false],
    ['연예인 결혼 발표', false],
    ['해외주식 테슬라 급등', false],
    ['건강 관리 비결', false],

    // 신규 키워드 — 정부 정책 빈출 용어 (2026-04-27 보강)
    ['주거안정 정책 2026 발표', true],            // 주거
    ['주거복지 5개년 계획', true],                 // 주거 substring
    ['특공 가점제 변경 안내', true],               // 특공 (특별공급 약어)
    ['특별공급 추첨 일정', true],                  // 특별공급
    ['공공임대 5만호 공급 계획', true],            // 공공임대
    ['국민임대 신청 자격', true],                  // 국민임대
    ['영구임대 거주 기간 연장', true],             // 영구임대
    ['주담대 금리 0.5%p 인상', true],              // 주담대
    ['디딤돌대출 한도 5억으로', true],             // 디딤돌
    ['버팀목 전세자금 확대', true],                // 버팀목
    ['특례보금자리론 종료', true],                 // 보금자리 substring
    ['집값 전국 평균 하락', true],                 // 집값
    ['대출규제 강화 방안', true],                  // 대출규제 (공백 없는 표기)
    ['수도권 미분양 1만호 돌파', true],            // 미분양

    // 잠재 false positive — 단독 일반 단어는 매칭되면 안 됨
    ['교육정책 토론회', false],                    // 정책 단독은 키워드에 없음
    ['식품공급망 강화 방안', false],               // 공급 단독은 키워드에 없음
    ['반도체 공장 임대료 인상', false],            // 임대 단독은 없음 (공공/국민/영구/매입/청년임대만)
  ])('"%s" → %s', (title, expected) => {
    expect(isRealEstateRelated(title)).toBe(expected);
  });
});

describe('aggregateAsSignals', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T04:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeSignal(title: string, hoursAgo: number, source: RealEstateSignal['source'] = 'mk'): RealEstateSignal {
    const t = new Date(Date.now() - hoursAgo * 3_600_000).toUTCString();
    return { title, link: `https://example.com/${title}`, pubDate: t, source };
  }

  it('aggregates all 4 sources in parallel', async () => {
    const result = await aggregateAsSignals({
      fetchers: {
        mk: async () => [makeSignal('mk-item-1', 1, 'mk')],
        hankyung: async () => [makeSignal('hankyung-item-1', 2, 'hankyung')],
        koreaPolicy: async () => [makeSignal('policy-item-1', 3, 'korea-policy')],
        googleNews: async () => [makeSignal('gnews-item-1', 4, 'google-news')],
      },
    });
    expect(result).toHaveLength(4);
    const sources = new Set(result.map((s) => s.source));
    expect(sources).toEqual(new Set(['mk', 'hankyung', 'korea-policy', 'google-news']));
  });

  it('source 실패 시 graceful — 나머지 source 결과는 유지', async () => {
    const result = await aggregateAsSignals({
      fetchers: {
        mk: async () => [makeSignal('mk-1', 1, 'mk')],
        hankyung: async () => { throw new Error('hankyung down'); },
        koreaPolicy: async () => [makeSignal('policy-1', 2, 'korea-policy')],
        googleNews: async () => { throw new Error('gnews down'); },
      },
    });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.source).sort()).toEqual(['korea-policy', 'mk']);
  });

  it('windowHours 밖 항목은 제외', async () => {
    const result = await aggregateAsSignals({
      windowHours: 24,
      fetchers: {
        mk: async () => [
          makeSignal('recent-12h', 12, 'mk'),
          makeSignal('old-48h', 48, 'mk'),
          makeSignal('older-100h', 100, 'mk'),
        ],
        hankyung: async () => [],
        koreaPolicy: async () => [],
        googleNews: async () => [],
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('recent-12h');
  });

  it('title 정규화 dedup (공백/대소문자 무시)', async () => {
    const result = await aggregateAsSignals({
      fetchers: {
        mk: async () => [makeSignal('LH 매입임대 공모', 1, 'mk')],
        hankyung: async () => [makeSignal('LH  매입임대 공모', 2, 'hankyung')], // 공백 차이
        koreaPolicy: async () => [makeSignal('lh 매입임대 공모', 3, 'korea-policy')], // 대소문자 차이
        googleNews: async () => [makeSignal('전혀 다른 토픽', 4, 'google-news')],
      },
    });
    expect(result).toHaveLength(2); // dedup 후 unique 2개
  });

  it('pubDate desc 정렬', async () => {
    const result = await aggregateAsSignals({
      fetchers: {
        mk: async () => [makeSignal('older', 10, 'mk')],
        hankyung: async () => [makeSignal('newer', 1, 'hankyung')],
        koreaPolicy: async () => [makeSignal('middle', 5, 'korea-policy')],
        googleNews: async () => [],
      },
    });
    expect(result.map((s) => s.title)).toEqual(['newer', 'middle', 'older']);
  });

  it('maxItems cap 적용', async () => {
    const many: RealEstateSignal[] = Array.from({ length: 100 }, (_, i) =>
      makeSignal(`item-${i}`, i, 'mk'),
    );
    const result = await aggregateAsSignals({
      maxItems: 10,
      fetchers: {
        mk: async () => many,
        hankyung: async () => [],
        koreaPolicy: async () => [],
        googleNews: async () => [],
      },
    });
    expect(result).toHaveLength(10);
  });

  it('모든 source 실패 → 빈 배열 (throw 안 함)', async () => {
    const result = await aggregateAsSignals({
      fetchers: {
        mk: async () => { throw new Error('1'); },
        hankyung: async () => { throw new Error('2'); },
        koreaPolicy: async () => { throw new Error('3'); },
        googleNews: async () => { throw new Error('4'); },
      },
    });
    expect(result).toEqual([]);
  });

  it('invalid pubDate 항목은 통과 (Google News의 일부 케이스)', async () => {
    const result = await aggregateAsSignals({
      windowHours: 24,
      fetchers: {
        mk: async () => [{ title: 'no-date', link: 'x', pubDate: 'invalid', source: 'mk' }],
        hankyung: async () => [],
        koreaPolicy: async () => [],
        googleNews: async () => [],
      },
    });
    expect(result).toHaveLength(1);
  });
});
