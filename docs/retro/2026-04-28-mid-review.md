# Mid-Review 2026-04-28 — 점검 결과 (v0 manual baseline)

**점검 시점**: 2026-04-28 (스냅샷) → 실행 박제 2026-04-29
**spec 참조**: `docs/superpowers/specs/2026-04-28-mid-review-design.md`
**CEO plan**: `~/.gstack/projects/kkyu92-blog-autopilot/ceo-plans/2026-04-28-mid-review.md`
**측정 윈도우**: backward 14일 (2026-04-14 ~ 2026-04-28). forward는 5/4 routine 단독.

---

## TL;DR

**메인1 (일별 발행)** = ✅ **건강** (3일치 cover율 평균 89%, failures 0, hub 양방향 검증 통과)
**메인2 (트래픽·수익)** = 🔴 **0단계 미진입** (3채널 sitemap submitted=158 / **indexed=0**, GSC clicks 14일 0)
**서브 (양방향)** = ✅ **자연 검증 통과** (playbook#58 hub 응답, 4시간 segment 박제)

→ **블로커 = "발행은 되지만 색인 안 됨"**. AdSense 진입 차단 root cause = (a) Blogger pages 0 (About/Privacy/Contact 부재) + (b) 색인 0. 우선순위 1번.

---

## 1. 데이터 베이스라인 (자동 측정)

### 1.1 발행 (DB `published_posts`, 4/26 ~ 4/28)

| 날짜 | AS (Blogger) | WS (WP) | TS (WP) | 합계 | 정상 9건 대비 |
|---|---|---|---|---|---|
| 4/26 | 3 | 3 | 3 | 9 | 100% |
| 4/27 | 3 | 5 | 5 | **13** | 144% (큐 backlog 소화) |
| 4/28 | 3 | 1 | 1 | **5** | **56%** ⚠️ |
| 누적 | 9 | 9 | 9 | **27** | — |
| failures | 0 | 0 | 0 | **0** | — |

- 평균 cover율 (3일): **89%** (일 9 baseline 대비)
- DB 누적은 **3일치 누적**이지 역사적 누적 아님 — SNAPSHOT의 "27건 누적" 표기는 misleading

### 1.2 외부 발행 카운트 (Blogger API + GSC sitemap)

| 채널 | 외부 카운트 | DB count | 차이 |
|---|---|---|---|
| Blogger AS (`apt-signal`) | **18** posts (Blogger API) | 9 | **+9** (수동/이전 발행 추정) |
| WP WS (`worldsignalblog`) | **78** sitemap | 9 | +69 (sitemap 자동 누적) |
| WP TS (`travelsignalblog`) | **62** sitemap | 9 | +53 (sitemap 자동 누적) |

→ DB 9 vs Blogger 18 차이 9건은 **시스템 도입 이전 발행** 또는 미박제 발행. 추가 조사 의제.

### 1.3 GSC 검색 트래픽 (3채널, 14일 4/14~4/28)

| 채널 | clicks | impressions | CTR | position | sitemap submitted/indexed |
|---|---|---|---|---|---|
| AS (Blogger) | 0 | 0 | 0% | 0 | **18 / 0** |
| WS (WP) | 0 | 0 | 0% | 0 | **78 / 0** |
| TS (WP) | 0 | **10** | 0% | 6.5 | **62 / 0** |
| **합계** | **0** | **10** | 0% | — | **158 / 0** |

- top queries: 3채널 모두 0건
- top pages: TS만 1건 (impressions 10)
- sitemap errors: 0 (제출 정상), warnings: 0
- **3채널 모두 indexed=0** ← **시스템 차원 블로커**

### 1.4 Cron success rate (auto-publish.yml, 14일 30 runs)

| 결과 | 카운트 | 비율 |
|---|---|---|
| success | 16 | **53%** |
| failure | 10 | 33% |
| cancelled | 5 | 17% |

- 정상 기대치 90%+ 대비 **37%p 미달**
- 4/28 실패 분포: 4/28 00:18 UTC failure / 01:27 UTC cancelled / 17:56 UTC failure
- 정상 cron = UTC 16:17 / KST 01:17 (`auto-publish.yml:4`)

### 1.5 빌드 / Lint

- **build FAIL**: `Couldn't find any pages or app directory` (Next.js 의존성 잔존, app dir 부재)
- **lint**: 21 errors + 3 warnings (TODO.md 기록과 일치)

### 1.6 hub 양방향 (영역 C)

- `playbook#58` (mid-review label) **CLOSED** 4/28 21:53 KST
  - hub 응답: "Push 받기 = 빈 dir 검출 → hub-worker 통합 측정의 가치"
  - "Pull 보내기 CI 1 dispatch (4/28 05:48 UTC `playbook#56`) → mid-review 진행 중 자연 검증"
  - 4시간 segment 자연 검증 + Pull 입력 자연 fire 4시간 침묵 데이터 박제됨
- 14일 worker 활동: PR 9건, Issue 15건 (활동 healthy)
- → 양방향 자연 검증 통과. 후속 박제 3건 진입 가능.

---

## 2. 영역별 종합

### 2.1 영역 A — 발행 안정성 (메인1)

**건강도**: ✅ **양호** (단, cron success rate 보강 필요)

| 차원 | 상태 |
|---|---|
| DB failures (3일) | 0 |
| Cover율 (3일 평균) | 89% — 정상 9건 baseline 대비 |
| 채널 균형 (AS:WS:TS) | 9:9:9 — 균형 |
| Cron success rate | **53%** — ⚠️ 절반 가까이 실패/취소 |
| 4/28 spike | 56% — 점검 시점 cron 미완료 또는 silent fail |

**정량 측정 부재** (spec §2 갭 박제):
- outdated 차단율 (`auto-publish.ts:142,166,183` console.log only)
- semantic-dedup 적중률 (`auto-publish.ts:420` console.log only)
- queue depth (`auto-publish.ts:854` console.log only)
- failure pattern 분류 (DB `failure_reason` 부재 + console.log only)
- → **logging instrumentation spec 후보** (Phase 1.5/2)

### 2.2 영역 B — 트래픽·수익 (메인2)

**건강도**: 🔴 **0단계 미진입**

| 차원 | 자동 측정 결과 | 사용자 검증 필요 |
|---|---|---|
| GSC clicks (14일 3채널) | **0** | — |
| GSC impressions (14일 3채널) | **10** (TS만) | — |
| 색인된 페이지 (sitemap) | **0/158** ← 시스템 블로커 | — |
| Blogger 페이지뷰 (7/14일) | (사용자 입력 필요) | ⏳ |
| Blogger 인기 글 + 트래픽 소스 | (사용자 입력 필요) | ⏳ |
| Blogger pages (About/Privacy/Contact) | **0** ← AdSense 차단 root cause | — |
| AdSense 연결/수익/RPM/CTR | (사용자 입력 필요) | ⏳ |
| AdSense 승인 단계 | (사용자 입력 필요, **미신청 추정**: pages 부재) | ⏳ |

**VISION 4단계 매핑** (현재 위치):
- 1단계 (AdSense 승인): 글 18 ✅ / 필수 페이지 ❌ → **부분 도달, 페이지 차단**
- 2단계 (월 $10, 일 100+ 방문자): GSC clicks 0 → **미진입**
- 3단계 (월 $100, 일 1,000+): **미진입**
- 장기 (월 $500+, 글 200+): **미진입**

→ **현 위치 = 1단계 미진입 (페이지 부재 + 색인 0이 동시 차단)**

### 2.3 영역 C — 양방향 자동화 (서브)

**건강도**: ✅ **자연 검증 통과**

- playbook#58 자연 close (4/28 21:53 KST), hub 응답 풍부
- 14일 worker → hub 채널 활성 (PR 9, Issue 15)
- 4시간 segment 자연 검증 박제됨
- VISION/ROADMAP 위치: "보조 학습 루프, 모든 Phase 지속" — 메인 차단 영향 없음

### 2.4 영역 D — 시스템 안정성·블로커

**건강도**: ⚠️ **블로커 다수**

| 항목 | 상태 |
|---|---|
| 빌드 | ❌ FAIL (Next.js 의존성 잔존, app/pages dir 부재) |
| Lint | ⚠️ 21 errors + 3 warnings |
| Cron success rate (14일) | ⚠️ 53% (정상 90%+ 미달) |
| **GSC 색인 0** (3채널 모두) | 🔴 시스템 차원 블로커 |
| backup-db.mjs:26 stale | 🔴 silent risk (실 운영 DB 백업 안 됨) |
| smoke-test.md:86 cron 시간 잘못 | 🟡 stale doc |
| GSC OAuth scope 부재 | ✅ 이번 점검에서 재인증으로 해결 |
| Blogger blog 18 vs DB 9 | 🟡 9건 차이 (이전 발행 추정) |

---

## 3. CRITICAL 발견 종합 (우선순위)

| # | 항목 | 영역 | 위험도 | 권장 액션 |
|---|---|---|---|---|
| 1 | **GSC 색인 = 0/158** (3채널 모두) | B/D | 🔴 P0 | sitemap 제출은 정상이나 색인 안 됨. URL Inspection으로 원인 진단 → robots.txt / canonical / blog setting 점검. **AdSense 진입 차단의 핵심 원인** |
| 2 | **Blogger pages = 0** (About/Privacy/Contact 부재) | B | 🔴 P0 | 페이지 3개 수동 작성 → AdSense 진입 조건 충족 |
| 3 | **scripts/backup-db.mjs:26 stale** (`content.db` → `blog.db`) | D | 🔴 P0 | 1줄 fix, silent risk 제거 |
| 4 | **Cron success rate 53%** | A/D | 🟡 P1 | 실패 10건 + cancelled 5건 원인 분석. timeout / quota / 다른 워크플로 충돌 의심 |
| 5 | **4/28 cover율 56%** | A | 🟡 P1 | 점검 시점 미완료 또는 silent fail. WP WS/TS 1건씩만 발행됨 |
| 6 | **build FAIL** | D | 🟡 P2 | Next.js 의존성 제거 또는 app dir 복구 결정 |
| 7 | smoke-test.md:86 cron 시간 잘못 | D | 🟢 P3 | 1줄 fix, doc only |
| 8 | STATUS.md / PLAN.md stale (~2026-04-01) | D | 🟢 P3 | 네이버/Tiptap 제거 + paperclip 도입 반영 |
| 9 | DB 27건 misleading (3일치 vs 역사적) | A | 🟢 P3 | SNAPSHOT 표기 정정 |
| 10 | Blogger blog 18 vs DB 9 차이 | A | 🟢 P3 | 9건 추가 조사 (수동/이전 발행) |
| 11 | logging instrumentation 부재 | A | 🟢 P2 | outdated/dedup/queue/failure 정량화 spec 작성 |

---

## 4. 결론 + 다음 1~2달 우선순위

### 다음 행동 (우선순위 순)

1. **P0 — AdSense 진입 차단 해제**:
   - (a) Blogger 수동으로 About / Privacy Policy / Contact 페이지 3개 작성 (~1시간)
   - (b) GSC URL Inspection으로 색인 0 원인 진단 (robots.txt / canonical / blog setting)
   - (c) Blogger blog 설정 점검 (검색엔진 수집 허용 여부)

2. **P0 — Critical fix**:
   - `scripts/backup-db.mjs:26` `content.db` → `blog.db` (1줄 fix)
   - `data/content.db` 처분 결정 (delete or archive)

3. **P1 — 시스템 안정성 회복**:
   - cron 실패 15건 (failure 10 + cancelled 5) 원인 분석 → 53% → 90%+ 회복
   - 4/28 cover 56% silent fail 진단

4. **P2 — 측정 부재 해소**:
   - logging instrumentation spec 작성 (outdated/dedup/queue/failure)
   - build/lint 정상화 결정

5. **P3 — 문서 정정**:
   - STATUS.md / PLAN.md / smoke-test.md / SNAPSHOT 27건 표기 정정

### 후속 spec 후보 (점검에서 추출)

- **logging instrumentation** (Phase 1.5/2): DB 구조화 측정
- **Search Console API 연동 자동화** (Phase 3 P0): 이번 점검에서 재인증 후 자동 호출 가능 검증됨. 다음 mid-review routine 자동화의 핵심 의존
- **mid-review routine 자동화**: 이번 점검 = v0 manual baseline. v1 반자동 / v2 full auto 진화 경로
- **AdSense API 연동** (Phase 3): 6·7 사용자 입력 자동화

---

## 5. 사용자 검증 필요 항목 (placeholder)

자동 측정 불가 4개. 사용자 입력 받으면 §2.2 영역 B 갱신.

```
4. Blogger 페이지뷰
   - 7일:
   - 14일:

5. Blogger 인기 게시물 top 5 + 트래픽 소스 분포

6. AdSense 연결 상태 + 7일/14일 수익 + RPM + 클릭률
   - 연결 상태:
   - 7일 수익 ($):
   - 14일 수익 ($):
   - RPM:
   - CTR:

7. AdSense 승인 단계 (미신청 / 심사중 / 거절 / 승인)
```

(추정: 미신청 — pages 0 부재로 신청 자체 불가능 추정)

---

## 6. spec 정정 의제 (이번 점검에서 발견된 spec/SNAPSHOT 갭)

| # | 갭 | 정정 |
|---|---|---|
| 1 | spec §2 "GSC 사용자 콘솔 입력" 박제 | 실제로는 자동 호출 가능 (재인증 1회) — Phase 3 P0 spec에 반영 |
| 2 | SNAPSHOT의 "27건 누적" 표기 | "3일치 누적 27건"으로 정정 |
| 3 | spec §2 "WP cover율 platform 분해" | 정확함, 단 sitemap 자동 누적과의 차이 인지 필요 |
| 4 | Outside Voice (codex)가 GSC scope 부재 못 잡음 | next-mid-review에 "토큰 scope 검증" 단계 추가 |

---

## 7. 4/29 발견 — Cron 회귀 다층 분석 + URL Inspection root cause

### 7.1 Cron 회귀 (4/26~4/28 schedule 3일 연속 실패)

| 날짜 | event | conclusion | root cause |
|---|---|---|---|
| 4/26 17:02 UTC | schedule | cancelled | orphan claude.exe (사용자 PC sleep/wake 추정) |
| 4/27 17:41 UTC | schedule | cancelled | 동일 |
| 4/28 17:56 UTC | schedule | failure | **`[healthcheck] claude-cli timeout after 10000ms (3회 모두)` → exit 2** |

→ Schedule cron 만회 = manual `workflow_dispatch` (4/26~28 평균 5~7회/일)

### 7.2 4/26 fatal 에러 = rename 이전 옛 폴더 회귀

```
[auto-publish] fatal: Error: invalid JSON: Unexpected token '#', "# 🎯 트렌드 헌"...
  at /Users/kyusikkim/actions-runner/_work/content-autopilot/content-autopilot/src/lib/llm.ts:35
```

→ Path = `content-autopilot` (옛 폴더). 4/27 15:09 rename `1d7db0d` 이후 새 폴더 `blog-autopilot`로 전환. **JSON 회귀는 자동 해결됨** (lesson `420b85d` 포함된 fix가 신 폴더에 반영). 이후 동일 에러 0건.

### 7.3 GSC URL Inspection — 색인 0/158 root cause 확정

3 URL sample (homepage + post 2개) 결과 **3건 모두 동일**:

```
verdict: NEUTRAL
coverageState: "리디렉션 오류"
pageFetchState: REDIRECT_ERROR
robotsTxtState: ALLOWED  ← robots는 정상
indexingState: INDEXING_STATE_UNSPECIFIED
crawledAs: MOBILE
lastCrawlTime: 2026-04-28 03:41~59 UTC
```

curl 재현:
- Googlebot Mobile UA: `/` → **302 → `/?m=1`** → 200
- Googlebot Desktop UA: `/` → 200 (redirect 없음)
- robots.txt: 빈 파일 (0 bytes), `content-type: text/plain`
- meta robots: 없음, X-Robots-Tag: 없음

→ **Root cause = Blogger의 mobile separate URL 패턴 (`?m=1`)**. GSC mobile-first indexing에서 desktop canonical과 mobile URL 충돌로 REDIRECT_ERROR 분류 추정.

### 7.4 응급 fix 적용 (이번 세션)

| # | fix | 위치 | 효과 |
|---|---|---|---|
| A1 | claude-cli healthcheck를 발행 차단 게이트에서 분리 (warn-only) | `scripts/auto-publish.ts:806-823` | 4/29~ schedule cron이 claude-cli timeout으로 발행 차단 안 됨. slot-level retry가 처리 |
| A2 | callClaude JSON 파싱 회귀 | (rename으로 자동 해결, 추가 작업 불필요) | 4/26 fatal 패턴 4/27 이후 0건 |
| A4 | `scripts/backup-db.mjs:26` `content.db` → `blog.db` | 1줄 fix | silent risk 제거 |
| A4 | `docs/smoke-test.md:86` cron 시간 정정 (UTC 16:17 / KST 01:17) | 1줄 fix | 문서 정확성 |
| A5 | GSC URL Inspection root cause 확정 (위 7.3) | — | Blogger 설정 fix 가이드 명확 |

### 7.5 Cloudflare 적용성 매트릭스 (moneyball 시나리오 vs blog-autopilot)

| Root Cause | Cloudflare Worker cron 해결? | 비고 |
|---|---|---|
| GitHub Actions schedule high-load skip | ✅ YES | moneyball 검증 (Worker → HTTP trigger) |
| Self-hosted runner sleep/wake (PC 의존) | ❌ NO | Worker는 runner 못 깨움. Tunnel 또는 caffeinate 별개 fix |
| claude-cli timeout/hang | ❌ NO | Worker는 claude-cli 못 씀 (Max 구독은 local CLI). Anthropic API 전환 필요 |
| callClaude JSON 회귀 | ❌ NO | 별개 코드 버그 (이미 해결됨) |

→ moneyball: Vercel `/api/pipeline` HTTP 호출. blog-autopilot: self-hosted runner `pnpm tsx` 실행 → 구조 다름.
→ **Cloudflare Worker 도입 결정은 별도 brainstorming + CEO 리뷰 의제**. spec 후속 작성 (D 트랙).

### 7.6 다음 행동 (Critical 누적, AdSense 의제 제외)

1. **사용자 직접 (Blogger 콘솔)**:
   - Blogger 관리 → 설정 → 검색 환경설정 → "다른 국가용 리디렉션 사용 안 함" 활성화
   - sitemap 재제출 + 1주일 후 URL Inspection 재확인
2. **응급 검증**:
   - 4/29 manual `gh workflow run auto-publish.yml -f niche=all -f slot_count=3 -f mode=normal -f runner=home` (사용자 PC 켜져있을 때)
   - A1 fix 후 claude-cli WARN으로 처리되는지 다음 schedule cron (4/29 16:17 UTC = 4/30 01:17 KST) 자연 검증
3. **Cloudflare brainstorming → spec** (별도 의제): 위 7.5 매트릭스 기반

---

## 변경 이력

- **2026-04-28 (스냅샷 시점)**: spec 박제 + CEO 리뷰 + Outside Voice 정정 완료
- **2026-04-29 (실행)**: 자동 측정 (DB + Blogger API + GSC API + gh API + pnpm build/lint) + GSC 재인증 + 종합 박제
- **2026-04-29 (응급 fix)**: A1~A5 적용 (§7), Cloudflare 적용성 분석 박제, brainstorming → spec D 트랙 분리

---

## 산출물

- 점검 결과 (이 문서): `docs/retro/2026-04-28-mid-review.md`
- fetch 스크립트: `scripts/mid-review/fetch.mjs` (재사용 가능, 다음 routine 자동화 baseline)
- reauth 스크립트: `scripts/mid-review/reauth.mjs` (1회성, refresh token 갱신)
- raw JSON: `/tmp/mid-review-fetch.json` (휘발, 재실행 가능)
