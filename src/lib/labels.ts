import type { Niche } from './schema';

/**
 * AS (apt-signal) 통합 라벨 맵 — 21개 fragmented 라벨 → 6개 카테고리.
 * AdSense 사이트 주제 통일성 어필 + thin content 신호 해소 (5/6 prep).
 *
 * key = 통합 target 라벨, value = LLM 자유 생성 옛/변형 라벨 source 배열.
 *
 * 5/6 일회성 cleanup: scripts/migration/relabel-as.mjs 의 LABEL_MAP 과 동일.
 * 변경 시 양쪽 동기화 필요.
 */
export const LABEL_MAP_AS: Record<string, string[]> = {
  '청약': ['청약', '청약정보', '아파트 청약', '청약·부동산', '아파트 분양'],
  '재건축·재개발': ['재건축', '재건축·재개발', '재개발·재건축', '재개발', '재건축재개발'],
  '세금·절세': ['부동산 세금', '부동산세금', '부동산·세금', '세금·절세', '부동산 절세', '세금'],
  '시장분석': ['부동산', '부동산 시장분석', '부동산 투자 분석', '부동산 트렌드', '시장분석'],
  '정책·법령': ['부동산정책', '임대·분양', '정부정책', '정책·법령'],
  '대출·전세': ['부동산/대출 정보', '부동산/전세', '대출', '전세', '대출·전세'],
};

/**
 * Substring 매칭 룰 — LLM 자유 생성 keyword 라벨을 통합 6 카테고리로 자동 분류.
 * 5/8 박제: id 186/182/180/189 등 LLM 생성 패턴 분석 결과 (강남구아파트, 든든전세주택,
 * 1기신도시재건축, 양도세 중과, 풍무지구 분양 등) substring 으로 매핑 가능.
 *
 * 우선순위: 위에서 아래로 첫 매치 (more specific 위로). 각 라벨마다 한 카테고리만 매칭.
 */
const SUBSTRING_RULES: Array<readonly [RegExp, string]> = [
  // 1. 재건축·재개발 (specific 단어 — 다른 카테고리 충돌 적음)
  [/재건축|재개발|신도시|분담금|선도지구|사업시행/, '재건축·재개발'],
  // 2. 세금·절세 (양도세·취득세 등 명확한 세금 keyword)
  [/세금|절세|양도세|취득세|보유세|증여세|상속세|양도소득/, '세금·절세'],
  // 3. 정책·법령 (정부·법령 시그널)
  [/정책|법령|법안|국토부|시행령|규제|부총리/, '정책·법령'],
  // 4. 대출·전세 (대출/전세/임대 keyword — '임대·분양'은 위 LABEL_MAP 직접 매칭에 위임)
  [/대출|전세|월세|HUG|든든전세|공공임대(?!.*분양)/, '대출·전세'],
  // 5. 청약 (분양·당첨·1순위 등)
  [/청약|분양|당첨|모집공고|1순위|2순위|무주택|가점|추첨제|호반써밋/, '청약'],
  // 6. 시장분석 (부동산 일반 — 가장 광범위, 마지막 fallback 매칭)
  [/부동산|시세|시장|아파트|투자|트렌드|매물|매수|매도|매매|가격|단지|지역별/, '시장분석'],
];

const REVERSE_MAP_AS = (() => {
  const m = new Map<string, string>();
  for (const [target, sources] of Object.entries(LABEL_MAP_AS)) {
    for (const src of sources) m.set(src, target);
  }
  return m;
})();

const DEFAULT_AS_LABEL = '시장분석';

function classifyLabelAS(label: string): string | null {
  const direct = REVERSE_MAP_AS.get(label);
  if (direct) return direct;
  for (const [regex, target] of SUBSTRING_RULES) {
    if (regex.test(label)) return target;
  }
  return null;
}

/**
 * niche=AS 의 경우 LLM 자유 생성 라벨을 통합 6개 카테고리로 normalize.
 * 1. 정확 매칭 (LABEL_MAP_AS source) → target
 * 2. Substring 매칭 (SUBSTRING_RULES) → target (LLM keyword 흡수)
 * 3. 둘 다 fail → drop (사이트 주제 통일성 정책)
 * 4. 결과 빈 배열 → default '시장분석' 1개
 *
 * HS/TS 는 pass-through (통합 라벨 미정의 — 추후 prep 시 동일 패턴 추가).
 */
export function normalizeLabels(niche: Niche, labels: string[] | undefined): string[] {
  if (niche !== 'AS') return labels ?? [];

  const input = labels ?? [];
  if (input.length === 0) return [DEFAULT_AS_LABEL];

  const mapped = new Set<string>();
  for (const label of input) {
    const target = classifyLabelAS(label);
    if (target) mapped.add(target);
  }

  if (mapped.size === 0) return [DEFAULT_AS_LABEL];
  return [...mapped];
}
