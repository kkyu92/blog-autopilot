# 중간점검 디자인 (mid-review-2026-04-28)

**작성일**: 2026-04-28
**작성자**: Claude (brainstorming 스킬 + 사용자 합의)
**상태**: Draft → CEO 리뷰 진입 대기
**선행 산출물**: [playbook#58](https://github.com/kkyu92/playbook/issues/58) (워커 시점 4차원 self-report, 4/28 발행)

---

## 0. 목적

블로그 자동화 프로젝트가 **최종완료 지점에 도달하는 길에 있는지**를 정량으로 확인.

### 최종완료 정의 (사용자 합의)

- **메인 1**: 일별 게시물 문제없이 발행 (추후 게시물 양 증가 고려)
- **메인 2**: 사용자 방문 늘려서 애드센스 수익 발생
- **서브**: 워커-허브 양방향 무한성장 자동화

### 점검 차원 (사용자 명시)

1. 지금까지 작업한 내용에 문제가 없는지 (현 상태 검증)
2. 앞으로 최종목표까지 가는 데 문제없는지 (장애물·리스크)
3. 최종완료까지 얼마나·무엇이 남아있는지 (갭·거리)

---

## 1. 점검 영역 4개 (CEO 리뷰 + Outside Voice 반영)

| 영역 | 차원 | **자동 측정 가능** | **수동/추정 (구조화 측정 부재)** |
|---|---|---|---|
| **A. 메인 — 발행 안정성** | 시스템 신호 | `data/blog.db` published_posts 27건 baseline, 일별 cover율 (publishedAt + platform 분해), platform별 cover율 (`wordpress_ws / wordpress_ts / blogger_as`) | outdated 연도 차단율 / semantic-dedup 적중률 / queue depth / failure pattern 분류 (auto-publish.ts console.log만 — 정량 측정 불가, "관찰 부재" 갭으로 박제) |
| **B. 메인 — 트래픽·수익** | 사용자 입력 + 코드 분석 | `published_posts` 누적 수 (27 vs VISION 글 15~20 조건), Blogger sitemap 등록 상태 | GSC 노출/클릭/색인 (사용자), Blogger 방문자/페이지뷰 (사용자), 애드센스 연결 상태·수익·RPM (사용자), AdSense 승인 차단 status (About/Privacy/Contact + 콘솔 단계, 사용자), **VISION.md 4단계 매핑 (자동 — 위 데이터로 종합)** |
| **C. 서브 — 양방향 자동화** | 코드/git/gh 분석 | playbook#58 4차원 self-report 인용 + 4/22~4/28 14일 갱신 (gh PR/Issue/dispatch 카운트), 후속 박제 3건 진입 가능성 | (없음) |
| **D. 시스템 안정성·블로커** | 코드/gh 분석 | cron success rate (gh run list), `pnpm build` / `pnpm lint` 실행 결과 vs TODO.md, blogger 도메인 신뢰도 (sitemap 색인 비율), 옛 부동산 9개 cannibalization (GSC top queries 분석) | runner SPOF (사용자 PM2 상태), claude CLI Max 만료 (사용자 토큰 상태) |

---

## 2. 데이터 소스 매핑 (Outside Voice 정정 완료)

> **코드 검증 결과 (codex)**: 실제 운영 DB는 `data/blog.db` (publishedPosts 27건, schema는 `src/lib/schema.ts:4`), `data/content.db`(192KB, last 4/18)는 stale. WP/Blogger cover율은 `published_posts.platform` enum (`wordpress_ws / wordpress_ts / blogger_as`)으로 분해. `gh run list`는 단일 `auto-publish.yml`로 WS/TS/AS 모두 돌아 채널 분리 불가.

| 측정 항목 | 소스 | 자동/수동 |
|---|---|---|
| 발행 누적 / 채널별 cover율 / 일별 분포 | `data/blog.db` `published_posts` (sqlite3 query, `niche` + `platform` + `publishedAt`) | 자동 |
| 실패 패턴 (failure_reason 분류) | `data/blog.db` `published_posts WHERE status='failed'` + GitHub Issues (auto-discard / queue-exhausted / silent-fail 라벨) | 자동 (DB 측), 일부 갭 (질적 분류는 console.log only) |
| **outdated / dedup / queue / failure pattern 정량 측정** | ❌ 부재 (auto-publish.ts:142,166,183,420,854 console.log만, DB 저장 안 됨) | **갭으로 박제 — logging instrumentation 별도 spec 후보** |
| 양방향 채널 (서브) | playbook#58 본문 인용 + 14일 갱신분 (gh PR/Issue/dispatch 카운트) | 자동 |
| cron success | `gh run list --workflow=auto-publish.yml` | 자동 |
| **빌드/Lint 상태** (cherry-pick #3) | `pnpm build` + `pnpm lint` 실행 결과 vs TODO.md 기록 | 자동 |
| **About/Privacy/Contact 페이지** (cherry-pick #1) | Blogger admin URL inventory + sitemap cross-check | 사용자 1회 확인 |
| **글 누적 수** (cherry-pick #1) | `data/blog.db` `published_posts` count (현재 27) + Blogger sitemap (Blogger 채널만) | 자동 |
| **AdSense 승인 단계** (cherry-pick #1) | 사용자 콘솔 단계명 (미신청/심사중/거절/승인) | 사용자 batch 입력 |
| **VISION.md 4단계 위치** (cherry-pick #2) | 종합 분석 — 글 누적·트래픽·수익으로 매핑 (자동 데이터 활용) | 자동 |
| **GSC**: 노출, 클릭, 평균 CTR, 색인된 페이지 수, 검색 쿼리 top 5 | search.google.com/search-console 콘솔 | 사용자 batch 입력 |
| **Blogger**: 7일/14일 페이지뷰, 인기 게시물 top 5, 트래픽 소스 분포 | Blogger admin → Stats | 사용자 batch 입력 |
| **애드센스**: 연결 상태, 7일/14일 수익 ($), RPM, 클릭률 | google.com/adsense | 사용자 batch 입력 |

---

## 3. 실행 방식 (Outside Voice 단순화 — subagent 3개 → 단일 분석)

> **codex 권고**: "병목은 분석 인력이 아니라 계측 부재와 소스 불일치." subagent 병렬 dispatch는 메트릭이 충분할 때 의미. 지금은 단일 분석 + 정확한 source-of-truth가 우선.

```
Step 0. Source-of-truth 정정 (5분, 점검 결과 박제 전 필수)
  - data/content.db (stale) 처분 결정
  - smoke-test.md cron 시간 정정 (UTC 16:17 / KST 01:17이 truth)
  - scripts/backup-db.mjs `content.db` → `blog.db` 정정 여부 결정 (실행은 점검 후)

Step 1. 사용자 콘솔 수치 batch 입력 (1회, ~10분)
  - GSC + Blogger Stats + AdSense 콘솔 + AdSense 승인 단계 + About/Privacy/Contact 존재

Step 2. 단일 분석 (메인 Claude, ~15분):
  - 영역 A: data/blog.db published_posts query + gh run list (auto-publish.yml)
  - 영역 B: 사용자 수치 + DB 글 누적 + VISION 4단계 매핑
  - 영역 C: playbook#58 인용 + 14일 갱신
  - 영역 D: pnpm build / lint + cron success rate

Step 3. 종합:
  - 갭 도출 (최종완료까지 거리, 정량 + 정성)
  - Risk 분류 (블로커 / 모니터링 / 기각)
  - 다음 1~2달 우선순위 (TODO.md / ROADMAP.md cross-reference)
  - 측정 부재 항목 → logging instrumentation spec 후보로 박제
```

---

## 4. 산출물

| 산출물 | 위치 | 목적 |
|---|---|---|
| 점검 디자인 spec (이 문서) | `docs/superpowers/specs/2026-04-28-mid-review-design.md` | brainstorming 결과 박제 |
| **점검 결과** | `docs/retro/2026-04-28-mid-review.md` (신설) | 영구 박제, 다음 점검 비교 가능 |
| CEO 리뷰 결과 | 이 spec에 §9 섹션으로 추가 | 별도 파일 안 만듦 |
| 결정 박제 (필요 시) | `~/.claude/projects/-Users-kyusikkim-projects-blog-autopilot/memory/feedback_*.md` 또는 `docs/lessons/*.md` | 후속 박제 3건 + 점검 중 발견된 새 룰 |
| GitHub 트래킹 (선택) | 워커 자체 Issue 발행 | 결정 의제 발생 시만 |

**5/4 week1-observation routine**과 **같은 폴더(`docs/retro/`)** 사용 — 누적 비교 가능.

---

## 5. 측정 윈도우 (Outside Voice — sequencing 분리)

> **codex 권고**: "forward window를 같은 mid-review에 넣으면 산출물이 5/4까지 미완성." 분리 적용.

- **현재 스냅샷**: 2026-04-28 시점 (모든 수치 현재 콘솔 값)
- **Backward 활동 윈도우**: 2026-04-14 ~ 2026-04-28 (14일) — playbook#58은 7일이라 14일이면 새 신호
- **Forward 관찰 윈도우**: ❌ **이번 mid-review에서 제외** — 4/29~5/4 자연 cron 관찰은 **5/4 week1-observation routine 단독**으로 박제. mid-review는 4/28 스냅샷에 한정해서 즉시 종결
- **베이스라인**: 첫 점검이라 비교 X. 다음 점검(별도 사이클)부터 비교 가능. **이번 점검 결과는 mid-review v0 baseline — 다음 사이클 자동 비교 대상**

---

## 6. CEO 리뷰 mode 후보

`plan-ceo-review` 스킬은 4가지 mode 제공. 점검 결과 본 뒤 사용자 결정.

| Mode | 의미 | 적합 시나리오 |
|---|---|---|
| **HOLD SCOPE** | 정해진 목표(일별 발행 + 트래픽 + 애드센스)에 누수 없는지 검증 | **첫 진입 권장** |
| **SELECTIVE EXPANSION** | 메인 목표 유지 + 핵심 한두 개 확장 (예: 트래픽 채널 추가 / 자동화 차원 추가) | 점검에서 갭 보고 핵심 한두 개 보강 필요 시 |
| **SCOPE EXPANSION** | 10배 야망 — 다중 도메인, 다국어, 또 다른 수익 모델 추가 | 메인 목표 자체가 너무 작다고 판단될 때 |
| **SCOPE REDUCTION** | 본질 외 모두 제거 | 이번 점검에는 비적용 (이미 MVP) |

**권장**: **HOLD SCOPE 시작** → 점검에서 갭 보고 필요 시 SELECTIVE EXPANSION 전환.

---

## 7. 흐름 (이번 세션 + 다음 단계)

```
[현재 세션]
  brainstorming  ✓
  spec 박제 + self-review  ← 진행 중
  사용자 spec 검토
  CEO 리뷰 (plan-ceo-review)
  CEO 리뷰 결과를 §9에 추가
  사용자 승인

[다음 단계 — 사용자 별도 "go" 신호 대기]
  점검 실행:
    - 사용자 콘솔 수치 batch 입력
    - subagent 병렬 dispatch
    - 결과 박제 (docs/retro/...)
    - 후속 결정 (필요 시 별도 spec)
```

---

## 8. 메모리 강제 적용

- `~/.claude/projects/-Users-kyusikkim-projects-blog-autopilot/memory/feedback_verify_handoff_claims.md` — SNAPSHOT/checkpoint의 P0/주장 그대로 베끼지 말고 코드/git로 검증
- 적용 지점: 영역 D 종합 평가 시 phase 진행률 (스냅샷 110% 같은 수치) 그대로 인용 금지, 검증 후 갱신

---

## 9. CEO 리뷰 결과

**Mode**: SELECTIVE EXPANSION
**검토 시각**: 2026-04-28 16:00 KST
**진행자**: plan-ceo-review 스킬

### 9.1 Premise Challenge

- ✅ 메인1 (일별 발행): VISION.md "주 5+ 글" + 9 슬롯 cover율 매핑 — premise 유효
- ⚠️ 메인2 (트래픽·수익): "수익 발생 여부" 측정만으론 부족 — VISION 4단계 ($10/$100/$500+) 거리 매핑 필수 → cherry-pick #2로 보강
- ⚠️ 서브 (워커-허브): VISION.md/ROADMAP.md에 의하면 메인 목표가 아니라 **"모든 Phase 지속"되는 보조 학습 루프**. 점검에서는 메인 보조 인프라로 분리 — playbook#58 인용으로 충분

### 9.2 SYSTEM AUDIT 발견 (8개 갭)

| # | 갭 | 결정 |
|---|---|---|
| 1 | AdSense 승인 차단 (About/Privacy/Contact + 글 누적) | ACCEPT — 영역 B 보강 |
| 2 | VISION 4단계 매핑 | ACCEPT — 영역 B 보강 |
| 3 | 빌드 + Lint 상태 (TODO.md "빌드 FAIL") | ACCEPT — 영역 D 보강 |
| 4 | Paperclip 5명 가동률 | SKIP — 사용자 unselect |
| 5 | stale 문서 정정 (STATUS/PLAN) | ACCEPT — §10 미해결 의제 |
| 6 | WordPress 채널 측정 보조 | ACCEPT (자동) — 영역 A 보조 |
| 7 | Search Console API 연동 갭 박제 | ACCEPT (자동) — §10 미해결 의제 |
| 8 | 측정 윈도우 (14d backward + 1w forward) | ACCEPT (자동) — §5 갱신 |

### 9.3 Sections 1-11 평가 (spec scope에 맞게 압축)

| Section | 결과 |
|---|---|
| 1 Architecture | spec은 메타 디자인 — N/A |
| 2 Error & Rescue | 점검 실행 시 사용자 입력 실패·subagent dispatch 실패 가능. 종합 단계 graceful fallback 필요 (점검 결과에 "측정 불가" 명시) |
| 3 Security | 사용자 콘솔 수치 입력 시 PII 없음 (방문자 수·수익 수치). Issue 발행 시 GSC 검색 쿼리에 민감 정보 포함 가능 — **결과 박제 시 redact 룰 명시 필요** |
| 4 Data Flow | 데이터 흐름 단순 (사용자 입력 + gh/git → 종합 → docs/retro). 갭 없음 |
| 5 Code Quality | spec 자체는 문서, 코드 변경 X |
| 6 Test | 점검 결과의 검증 — 사용자 spec 검토로 대체 |
| 7 Performance | subagent 3개 병렬 dispatch. 점검 1회 ~30분. 무리 없음 |
| 8 Observability | 점검 결과 박제 자체가 observability — 다음 사이클 비교 가능. v0이라 baseline 부재 (예상됨) |
| 9 Deployment | 점검 실행은 git commit 1회 (docs/retro/...). 롤백 = git revert |
| 10 Long-Term | 이번 점검 = mid-review routine v0 manual baseline. 자동화는 별도 spec 후보 |
| 11 Design/UX | UI 스코프 없음 — N/A |

### 9.4 다음 점검 routine 자동화 후보 (NOT in scope, 박제만)

- 매월 1회 또는 페이즈 전환 시 mid-review routine 자동 실행
- GSC API + Blogger Stats API + AdSense API 연동 시 사용자 수동 입력 영역 → 자동
- v0 (이번 manual baseline) → v1 (반자동) → v2 (full auto) 진화 경로

### 9.5 Outside Voice (codex) 발견 + 적용

codex가 spec과 실제 코드 정합성 검증한 결과 8개 발견. 사용자 결정 = **A (사실 정정 + sequencing 분리 + subagent 단순화)**.

| # | 발견 | 종류 | 적용 |
|---|---|---|---|
| 1 | DB 소스 틀림: `content.db` (3) vs 실제 `blog.db` (27) | 코드 사실 | ✅ §2 정정 |
| 2 | WP cover율 자동 측정 불가 (단일 워크플로) | 코드 사실 | ✅ §2 정정 (`published_posts.platform`로) |
| 3 | outdated/dedup/queue/failure 구조화 측정 부재 | 코드 사실 | ✅ §1, §2 "갭" 박제 + §10 logging spec 후보 |
| 4 | source-of-truth 충돌 (cron 시간, backup-db.mjs) | 코드 사실 | ✅ §3 Step 0 정정 단계 + §10 |
| 5 | forward window sequencing 오류 | 의견 | ✅ §5 분리 (forward는 5/4 routine 단독) |
| 6 | 전략 우선순위 (hub 양방향 vs 메인 readiness) | 의견 | ❌ 사용자 의도 영역 — 그대로 |
| 7 | 트래픽/수익 스냅샷 중독 (lag·niche 분해 부재) | 의견 | △ VISION 4단계 매핑으로 부분 보강 |
| 8 | subagent 3개 과설계 | 의견 | ✅ §3 단일 분석으로 단순화 |

### 9.6 결론

**spec은 SELECTIVE EXPANSION + Outside Voice 정정 후 코드 정합성 100%, 실행 가능성 명확.** 점검 실행 시 사용자 콘솔 입력 8개, 자동 측정 가능 항목 명시, 측정 부재 항목은 갭으로 박제. 산출물 `docs/retro/2026-04-28-mid-review.md`로 영구 박제. CEO plan은 `~/.gstack/projects/kkyu92-blog-autopilot/ceo-plans/2026-04-28-mid-review.md`에 별도 박제.

---

## 10. 미해결 의제 (점검 실행 단계로 이월 + CEO 리뷰 추가분)

### 점검 실행 단계로 이월
- 트래픽/수익 데이터의 **API 연결 자동화** (현재 사용자 수동 입력) — 점검 끝에 별도 spec 후보
- playbook#58에 hub Phase 2b 8차원 mapping 응답 — hub 처리 시점 모름
- moneyballscore self-report와의 비교 mapping (playbook#57)

### CEO 리뷰 추가 (자동 결정)
- **stale 문서 정정** — STATUS.md (~2026-04-01) / PLAN.md (~2026-04-01 자동승인) 둘 다 stale. VISION.md (2026-04-03) 약간 stale. 점검 산출물 §"정정 액션"에 우선순위 도출
- **Search Console API 연동 자동화** — Phase 3 P0 (ROADMAP). 별도 spec 후보. 다음 mid-review routine 자동화의 핵심 의존
- **mid-review routine 자동화** — 이번 점검이 v0 manual baseline. v1 반자동 / v2 full auto 진화 경로

### Outside Voice 추가 (코드 사실 정정 후속)
- **`data/content.db` 처분** — 192KB stale, 4/18 last write. 삭제 또는 archive (gitignored). 점검 후 결정
- **`scripts/backup-db.mjs:26` `content.db` → `blog.db` 정정** — 백업 대상 잘못. 실 운영 DB 백업 안 됨 (silent risk)
- **`docs/smoke-test.md:86` cron 시간 정정** — UTC 01:17/KST 10:17 (잘못) → UTC 16:17/KST 01:17 (실제 `auto-publish.yml:4`)
- **logging instrumentation spec** — outdated/dedup/queue/failure pattern을 DB 구조화 저장. console.log → published_posts.metadata 또는 별도 logs 테이블. ROADMAP Phase 1.5/2 후보

### Paperclip 5명 가동률 측정 (사용자 SKIP, 다음 사이클 후보)
- PM2 metrics endpoint 노출 또는 ssh script 작성
- 다음 점검 또는 routine 자동화 시 진입

---

## 변경 이력

- **2026-04-28 (작성)**: brainstorming 1차 합의 (Q1=A 풀 정량, Q2=A 자동 분석)
- **2026-04-28 (CEO 리뷰)**: SELECTIVE EXPANSION mode 적용. 8개 갭 cherry-pick — 3개 ACCEPT (사용자) + 4개 ACCEPT (자동) + 1개 SKIP (사용자). spec §1, §2, §5, §9, §10 갱신.
- **2026-04-28 (Outside Voice — codex)**: 코드 정합성 검증 결과 8개 발견. Option A 적용 — 사실 정정 (DB / WP cover율 / 메트릭 부재 / source-of-truth 충돌) + sequencing 분리 (forward window 제외) + subagent 단순화 (3개 → 단일). §1, §2, §3, §5, §9, §10 추가 갱신.
