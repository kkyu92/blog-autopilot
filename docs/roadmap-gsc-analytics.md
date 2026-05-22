# Roadmap — GSC + Analytics 통합 → Monetization Closed Loop

> 작성: 2026-05-22. 목표: AdSense 통과 = 시작점. 통과 후 매출/검색/페이지뷰 데이터 closed loop = 진짜 무한 성장 엔진.

## 🎯 큰 그림

현재 (단방향):
```
input (트렌드) → process (LLM 생성) → output (12 게시물/일) → 끝
```

목표 (closed loop):
```
input ↔ process ↔ output ↔ feedback (매출/검색/PV) → 다음 input 가중치
```

발행 자동화만 = 양산 무덤 (생산만 + 소비 메커니즘 부재). monetization + analytics 데이터 흡수해서 다음 발행 우선순위 조정 = 양 → 질 진화 엔진.

---

## Phase 2 — GSC 통합 (AdSense 무관, 즉시 가능)

**목표**: Google Search Console 데이터 수집 → 검색 쿼리 / CTR / 인덱싱 상태 학습 → 신규 keyword cluster 자동 발견.

### Why GSC 먼저
- AdSense 통과 대기 중에도 데이터 수집 가능 (검색 트래픽 = AdSense 무관)
- 인덱싱 거부 패턴 = SEO 차단 root cause 진단 source
- 검색 쿼리 = 사용자 의도 학습 ground truth

### Scope
1. **GSC API OAuth 설정** — 3 블로그 (apt-signal / health-signal / TBD) 권한 부여
2. **Daily fetch script** (`scripts/gsc-fetch.mjs`) — 매일 어제 데이터 수집:
   - 검색 쿼리 (impressions / clicks / CTR / position)
   - 페이지별 인덱싱 상태 (indexed / crawled / excluded)
   - URL Inspection 결과 (특정 페이지 재요청)
3. **SQLite 저장** (`gsc_metrics` 테이블) — date / blog / page / query / impressions / clicks / ctr / position
4. **분석 script** (`scripts/gsc-analyze.mjs`) — 주간 리포트:
   - 인기 검색 쿼리 top 20 (blog별)
   - CTR 낮은 페이지 → 제목/메타 개선 후보
   - 미인덱싱 페이지 → 재요청 자동 큐
5. **trends 통합** (`src/lib/trends.ts` enhance) — GSC top 쿼리 → 다음 발행 keyword pool 가중치 ↑

### Outputs
- `scripts/gsc-fetch.mjs` (daily cron 추가, `daily-check.yml` 안 통합)
- `src/lib/db.ts` 에 `gsc_metrics` 테이블 schema
- `scripts/gsc-analyze.mjs` (주간 리포트)
- `docs/seo/gsc-baseline-YYYY-MM-DD.json` (주간 baseline 박제)

### Risk
- OAuth scope = `webmasters.readonly` 필요 (앱 등록)
- API quota: 1200 req/min/property (충분)
- 인덱싱 데이터 = 최소 2주 누적 후 의미 있음 (즉시 효과 X)

### Estimate
- spec → 구현: 2~3 cycle (워커 sess)
- 첫 데이터 baseline: 1주 후

---

## Phase 3 — Blogger Analytics 통합 (즉시 가능)

**목표**: 페이지뷰 / 체류시간 / 이탈률 → 인기 글 패턴 추출 → next gen content spec 자동 생성.

### Scope
1. **Blogger Insights API** 또는 **GA4 통합** (둘 중 1택)
   - Blogger Insights: 기본 (페이지뷰만)
   - GA4: 풍부 (체류시간 / 이벤트 / 전환) 단 추가 setup
2. **Daily fetch** (`scripts/analytics-fetch.mjs`)
3. **`page_metrics` 테이블** — date / blog / post_id / pageviews / avg_time / bounce_rate
4. **인기 글 패턴 분석** — top 10 pageviews → 공통 특징 추출:
   - 제목 패턴 (질문형 / 숫자형 / 시기성)
   - keyword cluster
   - niche 분포
5. **trends 통합** — 인기 패턴 → 다음 발행 spec 가중치

### Outputs
- `scripts/analytics-fetch.mjs`
- `page_metrics` 테이블
- `scripts/analytics-analyze.mjs` (주간 인기 글 리포트)

### Risk
- Blogger Insights API = 제한 적음
- GA4 통합 시 setup 큼 (Google Tag Manager 또는 직접 inject)
- 페이지뷰 데이터 = 트래픽 적으면 의미 없음 (현재 blog별 트래픽 미상)

### Estimate
- spec → 구현: 2~3 cycle
- 첫 신호: 2~4주 후 (트래픽 누적 필요)

---

## Phase 4 — Monetization Loop (AdSense 통과 후)

**목표**: AdSense 매출/CPC → niche/keyword 가중치 자동 조정. 매출 높은 패턴 우선 발행 = positive flywheel.

### Scope
1. **AdSense Management API** OAuth 설정
2. **Daily fetch** (`scripts/adsense-fetch.mjs`) — 매일 어제 매출:
   - 페이지별 매출 / CPC / RPM / 노출수
   - niche별 합계
3. **`adsense_metrics` 테이블**
4. **niche/keyword 가중치 모델** (`src/lib/monetization-weights.ts`):
   - 매출 높은 페이지 → keyword cluster 가중치 ↑
   - CPC 높은 niche → 발행 비중 ↑
5. **trends 통합** — 가중치 기반 next pick

### Outputs
- `scripts/adsense-fetch.mjs`
- `adsense_metrics` 테이블
- `src/lib/monetization-weights.ts`
- 주간 매출 리포트 → 의사결정 evidence

### Risk
- AdSense API = 매출 데이터 노출 (보안)
- 매출 데이터 = 작은 트래픽일 때 noise 큼 (최소 월 100$ 도달 후 의미)
- 가중치 조정 = 시기상조 시 over-fit (1개월+ 데이터 누적 후)

### Estimate
- spec → 구현: 3~4 cycle
- 첫 신호: AdSense 통과 후 1~2개월 (매출 누적 필요)

---

## Phase 5 — LLM Quality Self-Refine (병렬 가능)

**목표**: 2주 후 발행 글 자체 review → quality score 낮은 글 자동 patch.

### Scope
1. **`scripts/quality-review.mjs`** — 2주 이상 된 발행 글 LLM review:
   - 데이터 staleness (2024 → 2026 update)
   - SEO 메타 개선
   - JSON-LD schema 누락 패치
2. **Patch 자동 적용** — Blogger API update 호출
3. **A/B 그룹** — patch 전/후 페이지뷰 비교 (Phase 3 데이터 연계)

### Risk
- Blogger API update 한도 (per blog)
- 자동 patch 사고 위험 (사람 review 없이)

---

## Phase 6 — A/B Test Infra (Phase 3 데이터 누적 후)

**목표**: 제목/첫 paragraph 변형 → CTR 측정 → winner 패턴 학습.

### Scope
1. **변형 생성** — LLM 으로 제목 3안 생성
2. **무작위 발행** — slot 별 다른 변형
3. **GSC 데이터 흡수** — Phase 2 데이터로 CTR 비교
4. **winner 패턴 박제** — 메모리 or `lesson:` commit

---

## 우선순위 결정

| Phase | 비용 | ROI 시점 | 추천 시작 |
|---|---|---|---|
| **2 GSC** | 중 | 1주 후 baseline | ✅ 즉시 |
| **3 Analytics** | 중 | 2~4주 후 | ✅ 즉시 (GSC 와 병행) |
| **4 Monetization** | 중 | 1~2개월 후 (AdSense 통과 후) | AdSense 통과 후 |
| **5 Quality Refine** | 소 | 즉시 효과 (개별 글 개선) | 2주+ 발행 누적 후 |
| **6 A/B Test** | 소 | 1~2개월 (CTR 데이터 필요) | Phase 2/3 후 |

**핵심 결정**: AdSense 통과 대기하면서 **Phase 2 (GSC) + Phase 3 (Analytics)** 즉시 시작. 통과 시점에 데이터 baseline 확보 → Phase 4 즉시 진입 가능.

---

## 무한 성장 메커니즘 (왜 가능한가)

| 단계 | 데이터 source | 진화 차원 |
|---|---|---|
| 1 | GSC 검색 쿼리 | "사용자가 진짜 검색하는 것" 학습 → 기존 추정 keyword 보정 |
| 2 | Blogger PV / 체류시간 | "어떤 글이 작동하는지" 학습 → 패턴 추출 |
| 3 | AdSense 매출/CPC | "어떤 글이 돈 되는지" 학습 → 비중 조정 |
| 4 | A/B 결과 | "어떤 변형이 작동하는지" 학습 → 글쓰기 룰 진화 |

위 4 차원 합쳐서 = **운영 데이터 closed loop**. 매 주 자체 학습 → 다음 발행 quality ↑ → 매출 ↑ → 더 풍부한 학습 데이터 → ... = positive flywheel.

발행 12/일 = 양일 뿐. 위 4 차원 = 질 진화 엔진. 둘 합쳐서 진짜 무한 성장.

---

## Open Questions (사용자 결정)

1. **GA4 vs Blogger Insights** — 둘 중 1택 (GA4 풍부 / Insights 간단)
2. **3 번째 블로그 선택** — apt-signal / health-signal / ??? (TS niche blogger URL 미확정)
3. **A/B test 시작 시점** — Phase 2 후 즉시 vs 트래픽 임계 도달 후
4. **워커 자체 develop-cycle 회전 (C3)** — Phase 2~6 진행 자동화 layer 추가 여부

---

## 다음 step

1. 사용자 review (본 spec 확정)
2. Phase 2 (GSC) 구현 cycle 시작 (워커 sess)
3. 1주 baseline 후 Phase 3 우선순위 재평가
