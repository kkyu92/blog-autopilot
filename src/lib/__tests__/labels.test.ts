import { describe, it, expect } from 'vitest';
import { normalizeLabels, LABEL_MAP_AS } from '../labels';

describe('normalizeLabels — niche=AS', () => {
  it('LABEL_MAP_AS source 라벨을 target 으로 매핑', () => {
    expect(normalizeLabels('AS', ['아파트 청약'])).toEqual(['청약']);
    expect(normalizeLabels('AS', ['재건축'])).toEqual(['재건축·재개발']);
    expect(normalizeLabels('AS', ['부동산세금'])).toEqual(['세금·절세']);
    expect(normalizeLabels('AS', ['부동산 트렌드'])).toEqual(['시장분석']);
    expect(normalizeLabels('AS', ['정부정책'])).toEqual(['정책·법령']);
    expect(normalizeLabels('AS', ['전세'])).toEqual(['대출·전세']);
  });

  it('이미 통합 target 라벨 그대로면 동일 유지', () => {
    expect(normalizeLabels('AS', ['청약', '시장분석'])).toEqual(
      expect.arrayContaining(['청약', '시장분석']),
    );
  });

  it('substring 매칭 안 되는 진짜 unknown → drop → default fallback', () => {
    expect(normalizeLabels('AS', ['asdfgh', '123abc', 'foobar'])).toEqual(['시장분석']);
  });

  it('mixed: 정확 매칭 + substring 매칭 → 모두 흡수 (5/8 substring 확장 후 동작)', () => {
    const result = normalizeLabels('AS', ['청약', '양도세 중과', '재건축', '매물 잠김']);
    expect(result.sort()).toEqual(['세금·절세', '시장분석', '재건축·재개발', '청약'].sort());
  });

  it('중복 매핑 dedup', () => {
    const result = normalizeLabels('AS', ['재건축', '재개발', '재건축·재개발']);
    expect(result).toEqual(['재건축·재개발']);
  });

  it('빈 배열 → default 라벨', () => {
    expect(normalizeLabels('AS', [])).toEqual(['시장분석']);
  });

  it('undefined → default 라벨', () => {
    expect(normalizeLabels('AS', undefined)).toEqual(['시장분석']);
  });

  it('all unknown → default 라벨', () => {
    expect(normalizeLabels('AS', ['random1', 'random2'])).toEqual(['시장분석']);
  });
});

describe('normalizeLabels — niche!=AS (pass-through)', () => {
  it('HS niche → labels 그대로 반환', () => {
    const labels = ['건강', '운동', '식단'];
    expect(normalizeLabels('HS', labels)).toEqual(labels);
  });

  it('TS niche → labels 그대로 반환 (자유 라벨 허용)', () => {
    const labels = ['여행', 'JFK 공항', '항공권'];
    expect(normalizeLabels('TS', labels)).toEqual(labels);
  });

  it('HS niche + undefined → 빈 배열', () => {
    expect(normalizeLabels('HS', undefined)).toEqual([]);
  });
});

describe('normalizeLabels — AS substring 매칭 (LLM 자유 keyword 흡수)', () => {
  it('5/8 자연 cron id 186 패턴 → 시장분석', () => {
    const result = normalizeLabels('AS', ['강남구아파트', '서울부동산2026', '서울아파트시세', '용산구부동산', '지역별시세분화']);
    expect(result).toEqual(['시장분석']);
  });

  it('5/8 자연 cron id 182 패턴 → 청약 + 대출·전세', () => {
    const result = normalizeLabels('AS', ['든든전세주택', '무주택청약', '수도권공공임대', '청약자격', 'HUG전세']);
    expect(result.sort()).toEqual(['대출·전세', '청약'].sort());
  });

  it('5/8 자연 cron id 180 패턴 → 재건축·재개발 (specific 우선, 재건축* 라벨이 대출 substring 가려짐)', () => {
    const result = normalizeLabels('AS', ['1기신도시재건축', '미래도시펀드', '신도시재건축2026', '재건축분담금대출', '재건축저리대출']);
    expect(result).toEqual(['재건축·재개발']);
  });

  it('5/3~5/7 옛 패턴 — 양도세 / 매물 잠김 / 내 집 마련 → 세금·절세 + 시장분석', () => {
    const result = normalizeLabels('AS', ['2026 부동산', '내 집 마련', '매물 잠김', '실수요자 매수 타이밍', '양도세 중과']);
    expect(result.sort()).toEqual(['세금·절세', '시장분석'].sort());
  });

  it('1기신도시재건축 / 분당재건축 / 사업시행자선정 / 양지마을선도지구 → 재건축·재개발', () => {
    const result = normalizeLabels('AS', ['1기신도시재건축', '노후계획도시', '분당재건축', '사업시행자선정', '양지마을선도지구']);
    expect(result).toEqual(['재건축·재개발']);
  });

  it('1순위 청약 조건 / 김포 청약 / 풍무지구 분양 / 호반써밋 풍무II → 청약', () => {
    const result = normalizeLabels('AS', ['1순위 청약 조건', '2026 청약', '김포 청약', '풍무지구 분양', '호반써밋 풍무II']);
    expect(result).toEqual(['청약']);
  });

  it('substring 우선순위: 재건축·재개발 vs 시장분석 (specific 우선)', () => {
    expect(normalizeLabels('AS', ['신도시아파트'])).toEqual(['재건축·재개발']);
  });

  it('정확 매칭 우선 (LABEL_MAP_AS direct hit)', () => {
    expect(normalizeLabels('AS', ['청약'])).toEqual(['청약']);
    expect(normalizeLabels('AS', ['재건축·재개발'])).toEqual(['재건축·재개발']);
  });
});

describe('LABEL_MAP_AS 구조 검증', () => {
  it('통합 카테고리 6개', () => {
    expect(Object.keys(LABEL_MAP_AS).length).toBe(6);
  });

  it('target 라벨이 자기 자신을 source 에 포함 (idempotent normalize)', () => {
    for (const [target, sources] of Object.entries(LABEL_MAP_AS)) {
      expect(sources).toContain(target);
    }
  });
});

