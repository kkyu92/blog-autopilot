# Blog Autopilot — Development Roadmap

> 참고용 발전 플랜. 작성: 2026-04-27. 1주 관찰 (4/28~5/4) 후 5/4에 우선순위 재조정.

## 🎯 큰 그림 (3대 축)

1. **안정성** — 안정 운영 자동화 (사람 개입 최소화)
2. **학습 루프** — hub 통합 누적·활용 (lesson/patterns/scout)
3. **품질·수익** — AdSense ROI 검증 (양 → 질로 무게중심 이동)

핵심 원칙:
- **Reliability first**: fail이 silent하면 자동화는 의미 없음
- **Data before features**: 1주 관찰 데이터 보고 우선순위 재조정
- **Don't over-engineer**: 운영 검증된 패턴만 자동화. 데이터 없으면 deferred

---

## Phase 1.5 — 안정화 + 토큰 방어 (4/28 ~ 5/11, 2주)

**목표**: 자연 cron 안정 + 토큰 자연 만료 대비 + 관찰 데이터 누적

| 항목 | 우선순위 | 사유 |
|---|---|---|
| 1주 관찰 (4/28~5/4) | P0 | 자동, 별도 작업 없음. fail율/silent fail/pmset wake 데이터 누적 |
| ~~WP OAuth 자동 갱신~~ | ~~P0~~ | **취소** — "5/10~5/26 만료" 전제 자체가 환상 (이전 세션 추정). WP.com global scope OAuth는 사실상 영구 토큰 (4/28 검증). spec deferred 참조 |
| Token health monitor (4 토큰) | P2-deferred | 1주 관찰 (5/4) 데이터 보고 silent fail 위험 실재 시 진행. spec: `docs/superpowers/specs/2026-04-28-token-health-monitor-design.md` (DEFERRED) |
| C6 큐 재보충 (dedup skip 5건 시 추가 fetch) | P1 | 1주 관찰 후 dedup skip 빈도로 결정 |
| Phase 1.5 검토 회고 | P1 | 5/4 데이터 보고 C6/C7 우선순위 + Phase 2 첫 항목 결정 |

### Phase 1.5 KPI
- fail율 < 30%
- silent fail = 0건 (모든 fail은 GitHub Issue)
- pmset wake 5/5일 작동
- 토큰 만료로 인한 cron miss = 0건

---

## Phase 2 — 운영 자동화 강화 (5/12 ~ 6월말, 6주)

**목표**: 사람 수동 개입 영역 자동화. 운영 데이터 기반.

| 항목 | 우선순위 | 의존 |
|---|---|---|
| C8 reconciliation (예약 발행 후 플랫폼 측 취소·실패·지연 동기화) | P0 | 운영 데이터 1주+ 누적 후 |
| publisher 5xx 30분 재시도 | P1 | healthcheck retry와 동일 패턴 |
| AdSense 수익 모니터링 | P1 | WP/Blogger admin API 활용. 수익 vs Claude API 비용 ROI |
| DB cloud backup (S3/R2) | P1 | 현재 로컬만, runner 디스크 fail 위험 |
| Emergency unpublish 자동화 | P2 | 정책/세금 기사 오류 발견 시 즉시 비공개 |
| C7 Trend subsystem 재구축 (sns_topics, naver_realtime, 국토부, 한국부동산원, evergreen 분류, category balancing) | P2 | 1주 관찰에서 키워드 다양성 부족 확인 시 |

### Phase 2 KPI
- 사람 수동 개입 횟수: 주 5회 → 주 1회 이하
- AdSense 수익 / Claude API 비용 비율 측정 (실 ROI baseline)
- DB 백업 retention 30일 자동

### 의사결정 포인트 (5/12)
- fail율 > 30% → C7 trend subsystem 재구축 우선 (다양성 보강)
- silent fail 발생 → reconciliation 우선
- 토큰 만료 hit → token auto-refresh 우선

---

## Phase 3 — 품질·SEO·수익 최적화 (7월 ~ 8월, 8주)

**목표**: 발행량 → 발행 품질로 무게중심 이동. 실 검색 노출·체류 데이터 활용.

| 항목 | 우선순위 | 사유 |
|---|---|---|
| Search Console 연동 | P0 | "발행 → 색인 → 검색 노출 → 클릭 → 체류" 전 funnel 데이터 |
| 페르소나 A/B testing | P0 | 콘텐츠 품질 KPI 정의 + 페르소나 evolution |
| 콘텐츠 품질 점수 모델 | P1 | min_quality_score=85 (AS) 검증, evergreen 윈도우 튜닝 |
| 청약Home 정통 Phase 2 (Puppeteer + bot evasion) | P1 | AS niche 핵심. ROI 정량화 후 결정 |
| AdSense 카테고리 ROI 분석 | P1 | 6 niches × 9 카테고리 × 발행 빈도 → 수익 매트릭스 |
| 이미지 generation 품질 향상 (Pixabay/Pexels → AI 생성) | P2 | 차별화, but 비용 증가 trade-off |

### Phase 3 KPI
- 색인율 > 80% (발행 글 중 GSC 색인된 비율)
- 평균 체류시간 > 60초
- 페르소나 A/B 통계 유의미 (n > 30 per persona)
- AdSense RPM (Revenue per Mille) baseline 확립

### 의사결정 포인트 (7월 초)
- AdSense 수익 < Claude API 비용 → 양 줄이고 품질 집중 (slot/일 8 → 3~5)
- AdSense 수익 > 비용 × 2 → 확장 가능 (Phase 4 검토)

---

## Phase 4 — 확장 (9월 ~)

**목표**: niche/플랫폼/도메인 다양화. cross-worker 학습.

| 항목 | 의존 |
|---|---|
| 새 niche 1~2개 추가 (예: HC 헬스케어, FN 금융, EDU 교육) | Phase 3 ROI 데이터 |
| silverstory (YouTube 워커) 통합 | playbook hub-worker 패턴 검증 후 |
| multi-blog/multi-domain (블로그 분리 vs 통합) | SEO 영향 평가 |
| moneyballscore cross-pollination (lesson/patterns 가져오기) | hub patterns 누적 후 |

### Phase 4 KPI
- 워커 수 1 → 2~3 (silverstory + 추가 niche)
- hub patterns 박제 5+ 건 (`patterns/<slug>` PR)
- Cross-pollination lesson 적용 사례 ≥ 3건

---

## 🤝 Hub 통합 누적 (모든 Phase 지속)

| 활동 | 빈도 | 주체 |
|---|---|---|
| `lesson:` 커밋 박제 | 월 2~5건 (운영하며 자연 발생) | 워커 |
| `patterns/<slug>` inbound PR | 월 0~2건 (3+ 워커 공통 발견 시) | 워커 → 허브 |
| `tips/<slug>` inbound PR | 월 1~3건 (30줄 이하 QoL) | 워커 → 허브 |
| Hub scout 매칭 issue 처리 | 자연 발생 | 워커 (`hub-dispatch` 라벨 분류) |
| `/sync-rules` shared-rules 동기화 | 월 1회 | 허브 세션 |

가치 회수 메커니즘: 워커가 만든 lesson/patterns이 다른 워커에 자동 적용되는 학습 루프. 6개월 누적 후 개별 워커 성능 향상으로 회수.

---

## 🚦 단기 액션 (다음 1~2주)

1. (자동) 4/28 01:17 KST cron 모니터 — P3 통합 첫 자연 운영
2. (능동) 4/28 11:12 KST hub Daily Ingest 모니터 — Push 축 자연 검증
3. ~~WP OAuth 자동 갱신 PR~~ — **취소** (4/28 brainstorming 검증: WP.com OAuth 사실상 영구. App Password는 REST v1.1에 부적용. 자동 갱신 자체가 기술적 불가능)
4. ~~claude CLI 토큰 monitoring~~ — **deferred** (Token health monitor 통합 spec으로 흡수, 5/4 후 진행 결정)
5. 1주 데이터 수집 스크립트 — fail율 / silent fail / dedup skip 빈도 자동 집계

---

## 🎲 리스크 & 의사결정 트리

```
1주 관찰 (5/4)
├── fail율 < 30%, silent 0건  →  Phase 2 P0 (C8 reconciliation) 진행
├── fail율 > 30%               →  C7 trend subsystem 우선 (다양성 보강)
└── silent fail 발생           →  reconciliation 우선 + 알림 보강

토큰 health (5/4 1주 관찰 데이터)
├── silent fail 0건            →  Token health monitor deferred 유지 (만들지 않음)
├── silent fail 1~2건          →  Tier 0 monitoring (감지 + 알림 + runbook) 진행
└── silent fail 3건+           →  Tier 0 + 발행 fail 알림 강화

AdSense 수익 (Phase 3, 7월)
├── 수익 > 비용 × 2            →  Phase 4 확장 (새 niche/워커)
├── 비용 ≈ 수익                →  품질 집중 (slot 줄이고 evergreen 비중 ↑)
└── 수익 << 비용                →  ROI 재설계 (모델 다운그레이드, slot 축소)
```

---

## 📅 일정 요약

```
4/28 ─── 5/4    Phase 1.5 안정화 + 1주 관찰
5/4  ─── 5/11   1주 회고 + 우선순위 재조정 (Token monitor 진행 여부도 이때 결정)
5/12 ─── 6/30   Phase 2 운영 자동화
7/1  ─── 8/31   Phase 3 품질/SEO/수익
9/1  ─── ...    Phase 4 확장
```

---

## 🤔 추가 고민 거리 (당장 답 안 해도 됨)

- LLM provider 다각화? (Claude only vs Gemini/GPT fallback) — 비용/품질 trade-off
- 멀티 블로그 (blogspot 1개 → 도메인 분리) — SEO 영향
- 워커 self-modification (lesson → 자동 PR 생성?) — risky, 사람 review 필수
- 페르소나 evolution은 자동 vs 수동? — 자동 시 drift risk

---

## 변경 이력

- 2026-04-27 — 초안 작성 (Phase 1 MVP 완성 + Phase 2 진입 직전 시점)
