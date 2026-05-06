# 1주 관찰 회고 — 4/28~5/4 (blog-autopilot)

**작성일**: 2026-05-04  
**관찰 기간**: 2026-04-28 KST 01:17 ~ 2026-05-04 09:00 KST  
**선행 retro**: `docs/retro/2026-04-28-mid-review.md` (4/28 baseline)  
**선행 retro**: `docs/retro/2026-04-29-f1-prime-fix.md` (F1' 5종 fix + 5/6 평가 frame)  
**관련 spec**: `docs/superpowers/specs/2026-04-28-token-health-monitor-design.md` (DEFERRED)

---

## 1. Executive Summary

4/28 출발 당일 자연 cron 2회 연속 CANCELLED(claude CLI hang → healthcheck gate 차단)로
시작됐으나, F1' 5종 fix(ulimit 10240 + orphan kill + spawn retry + niche 병렬) 적용 후 4/29 두
번째 dispatch에서 47분 / **8/9 success** 회복. 이후 F2-A(writer schema retry) / F2-B(timeout
900s) / editor fallback 패치로 단계적 안정화 중. 5/1 **9/9** · 5/2 **8/9** spot-check 확인.

**Token Health Monitor Go/No-Go: No-Go** — 관찰 기간 전체에서 token 4xx fail **0건**, 엄밀
정의 기준 silent fail **0건**. spec DEFERRED 상태 유지 권고. 다음 회고(5/11)까지 추가 데이터
누적 후 재평가.

GSC 색인 섹션(Section 4)은 사용자 수동 입력 필요.

---

## 2. Cron 실행 통계

**기대**: 7회 natural schedule (KST 01:17 daily = UTC 16:17)

### 2.1 실행 상세

| KST 날짜 | 유형 | Run ID | 결론 | Success/Total | 실패 원인 |
|---------|------|--------|------|--------------|---------|
| 4/28 01:17 | schedule | #25010381167 | **CANCELLED** | 0/9 | claude CLI spawn 무한 hang |
| 4/28 (recovery) | dispatch | #25028814076 | **CANCELLED** | ~5/?  | healthcheck claude-cli gate 차단 (A1 fix 미적용) |
| 4/29 01:17 | schedule | — | **FAILURE** | ?/9 | healthcheck claude-cli timeout (A1 fix 적용 전) |
| 4/29 09:52 | dispatch | #25085433470 | **FAILURE** | 4/9 | spawn ENOENT·EFAULT·-8 + writer title missing (F1' 미적용) |
| 4/29 ~14:40 | dispatch (F1') | #25091647631 | **SUCCESS** ✅ | 8/9 | editor JSON drift 1건 잔존 |
| 4/30 01:17 | schedule | — | **FAILURE** | ~6/9 | F2-A: writer schema retry 미적용, 3 slot fail |
| 5/1 01:17 | schedule | — | **SUCCESS** ✅ | 9/9 | spot-check 확인 |
| 5/2 01:17 | schedule | — | **PARTIAL** ✅ | 8/9 | 1 fail: disclaimer + flat final_meta drift |
| 5/3 01:17 | schedule | — | **⚠️ 미확인** | ?/9 | 원격 실행 — 데이터 없음 |
| 5/4 01:17 | schedule | — | **⚠️ 미확인** | ?/9 | 보고 시점 이전, 미확인 |

### 2.2 집계 (natural schedule 7회 기준)

| 결론 | 건수 | 비율 |
|------|------|------|
| success | 1 (5/1) | 14% |
| partial (≥ 8/9) | 1 (5/2) | 14% |
| failure | 2 (4/29, 4/30) | 29% |
| cancelled | 1 (4/28) | 14% |
| unknown | 2 (5/3, 5/4) | 29% |

### 2.3 Failure 원인 분류

| 분류 | 건수 | 해당 run |
|------|------|---------|
| claude CLI 관련 (hang / ENOENT / EFAULT / spawn -8) | 2건 | 4/28 schedule, 4/29 dispatch #1 |
| healthcheck gate 오탐 (A1 fix 이전) | 2건 | 4/28 recovery, 4/29 schedule |
| writer schema drift (F2-A 이전) | 1건 | 4/30 |
| editor JSON drift (fallback 이전) | 1건 | 4/29 dispatch #2 (1 slot), 5/2 (1 slot) |
| timeout 초과 (600s 한도, F2-B 이전) | 1건 | 4/29 dispatch #1 WS/대사증후군 |
| dedup skip (정상) | 0건 | — |
| token 4xx (WP OAuth / Blogger / claude CLI) | **0건** | — |

### 2.4 적용된 Fix 타임라인

| 날짜 | Fix | 효과 |
|------|-----|------|
| 4/28 | `fix(llm)`: claude CLI spawn timeout + child kill | hang → clean SIGTERM |
| 4/28 | `fix(publish)`: healthcheck claude-cli WARN-only (A1) | schedule cron 발행 차단 해소 |
| 4/28 | `feat(trends)`: paperclip 안정성 복원 | niche 전용 source aggregator 작동 |
| 4/29 | `fix(reliability)`: F1' 5종 (ulimit / orphan kill / retry / parallel / instrumentation) | 47min / 8/9 회복 |
| 4/29 | `fix(editor)`: inferStatus final_meta fallback | 4/29 dispatch #2 남은 1 fail 회수 |
| 4/30 | `fix(reliability)`: F2-A writer schema retry + F2-B timeout 600s→900s | 4/30 3 fail 대응 |
| 5/1 | `fix(reliability)`: F2-A 강화 (revision_feedback wording + JSON_RETRY_GUARD) | 5/1 9/9 기여 |
| 5/2 | `fix(reliability)`: writeAndReview disclaimer auto-apply + inferStatus flat fallback | 5/2 1 fail 대응 |

---

## 3. Silent Fail 탐지

**엄밀 정의**: cron이 SUCCESS 결론으로 끝났는데 발행 0개이거나 9개 미만 + incident dispatch 없음

### 3.1 결과: **0건**

| Issue # | 날짜 | 라벨 | 내용 | 판정 |
|---------|------|------|------|------|
| #32 | 4/28 | silent-fail | `🚨 cron cancelled — silent fail risk (run #25010381167)` | **정상 incident** — CANCELLED run, 엄밀 silent fail 아님 |
| #35 | 4/28 | silent-fail | `🚨 cron cancelled — silent fail risk (run #25028814076)` | **정상 incident** — CANCELLED run, 엄밀 silent fail 아님 |

→ 두 이슈 모두 **closed** 상태. incident 감지 메커니즘 정상 작동 확인.  
→ "success로 끝났는데 발행 0개" 케이스 = **0건**.

### 3.2 Auto-discard 집계 (editor 거부 / spawn fail)

| 날짜 | 건수 | WS | TS | AS | 주요 원인 |
|------|------|----|----|----|----|
| 4/28 | 1 | — | — | 1 | #33 AS auto-discard + #34 WS queue-exhausted |
| 4/29 | 9 | 4 | 3 | 2 | dispatch #1 spawn fail 5건 + dispatch #2 editor drift 1건 + natural cron ~3건 |
| 4/30 | 2 | 1 | — | 1 | writer schema drift |
| 5/1 | 1 | — | — | 1 | AS auto-discard |
| 5/2 | 0 | — | — | — | — |
| **합계** | **13** | — | — | — | 4/28~5/2 기준 |

### 3.3 Playbook Hub (cross-repo) 접근 권한 부족

⚠️ **kkyu92/playbook `worker-incident` 라벨 이슈 확인 불가 — 사용자 수동 확인 필요**

- 기대: 4/28 2건 dispatched(#32, #35 대응), 이후 0건
- 이 repo 기준 silent-fail 라벨 이슈: 2건(4/28), 이후 없음

---

## 4. GSC 색인 진행 (사용자 수동 입력)

**4/28 baseline** (mid-review §1.2~1.3):
- AS 사이트맵: 18개 등록, 색인 **0/18**
- WS 사이트맵: 78개, 색인 0/78
- TS 사이트맵: 62개, 색인 0/62 (impressions 10 확인)
- 전채널 색인 0 — REDIRECT_ERROR (Blogger 국가별 리디렉션 root cause 확정)
- 응급 fix 가이드: `docs/retro/2026-04-28-mid-review.md §7.6.1`

**4/29 추가 조치**:
- Blogger Pages 3종 작성 (About / Privacy Policy / Contact) — AdSense 진입 조건
- 색인 요청: 일일 quota 10건 제출 예정

**5/4 실측 (사용자 입력)**:

```
AS (apt-signal, Blogger):
  색인됨: __/18
  발견됨, 색인 안 됨: __
  리디렉션 오류 해소: ☐ Yes ☐ No (국가별 리디렉션 비활성화 확인)
  크롤링 오류: __

WS (worldsignalblog, WordPress):
  색인됨: __/___
  발견됨, 색인 안 됨: __

TS (travelsignalblog, WordPress):
  색인됨: __/___
  발견됨, 색인 안 됨: __
  (4/28 baseline: impressions 10 확인 — 색인 진입 가장 가까운 채널)
```

**SNAPSHOT 옛 부동산 9개 cannibalization 검토**:
- 정리 결정: ☐ 9개 모두 보존 ☐ 일부 삭제 ☐ 모두 삭제

**색인 KPI (목표)**:
- AS 18개 중 5개 이상 색인 → AdSense 신청 재검토 시점

---

## 5. 발행 실측

**기대치**: 9 posts/일 × 7일 = 63 발행 (4/28~5/4)

### 5.1 일별 발행 실측

| KST 날짜 | 총 발행 | WS | TS | AS | 비고 |
|---------|--------|----|----|----|----|
| 4/28 | **5** | 1 | 1 | 3 | mid-review §1.1 근거, partial recovery |
| 4/29 | **12** | 3 | 4 | 5 | dispatch #1 (4건) + dispatch #2 (8건), oversupply |
| 4/30 | **~6** | - | - | - | 3 slot fail 확인 (F2-A 이전), 추정 |
| 5/1 | **9** | - | - | - | spot-check 9건 전수 확인 |
| 5/2 | **8** | ✓(id≈66) | - | ✓(id≈68) | spot-check 8건 확인, 1 fail |
| 5/3 | **⚠️ 미확인** | - | - | - | 데이터 없음 |
| 5/4 | **⚠️ 미확인** | - | - | - | 보고 시점 기준 |
| **소계(확인분)** | **~40** | — | — | — | 4/28~5/2 (5일치) |

### 5.2 Gap 분석

- 기대 (5일 × 9): 45
- 실측 (4/28~5/2): ~40
- **Gap: ~5** — 주로 4/28 CANCELLED (0~5 발행)에서 발생
- 5/1~5/2 기준: 17/18 = **94.4% cover율** (F1' + F2 fix 효과)

### 5.3 Niche 균형

| 날짜 | WS | TS | AS | 균형 |
|------|----|----|----|----|
| 4/28 | 1 | 1 | 3 | ⚠️ AS 편중 (partial recovery 영향) |
| 4/29 | 3 | 4 | 5 | ⚠️ 전반적 oversupply (double dispatch) |
| 4/30~5/1 | 추정 3 | 추정 3 | 추정 3 | ✅ 균형 추정 |
| 5/2 | ✓ | 미확인 | ✓ | 8건 중 TS 여부 spot-check 미표기 |

### 5.4 DB ID 근거

`chore(spotcheck-5-2)` commit: `AS [68] 부동산 세금 + WS [66] 대장암`  
→ 5/2 cron 이후 DB row ≈ 68 (success + post-draft fail 포함)  
→ 4/28 기준 누적 27 (mid-review §1.1) + 관찰 5일치 ≈ 40 = 67, 오차 ±1~2 (failed row INSERT 포함)

---

## 6. Token Health Monitor (Tier 0) Go/No-Go 권고

### 6.1 결정 매트릭스 적용

| 조건 | 실측 | 판정 |
|------|------|------|
| token 4xx fail (WP OAuth / Blogger / claude CLI 만료) | **0건** | ✅ |
| silent fail (success 결론 + 발행 0 + incident 없음) | **0건** | ✅ |
| silent fail 1~2건 | — | 해당 없음 |
| silent fail 3건+ OR token 4xx 1건+ | — | 해당 없음 |

### 6.2 권고: **No-Go**

**근거**:
- 관찰 기간 내 token 인증 실패 **0건** — 4xx 패턴 issue 없음, healthcheck PASS 지속
- CANCELLED·FAILURE 원인 모두 claude CLI spawn / writer schema drift / editor JSON drift — token 무관
- incident 메커니즘 정상 작동 (#32, #35 raised + closed)
- 엄밀 정의 silent fail 0건 — 미감지 발행 누락 없음
- ⚠️ caveat: playbook hub `worker-incident` 교차 확인 불가. 단, 이 repo 기준 silent-fail 라벨 이슈 4/28 2건 이후 0건

### 6.3 다음 액션

**spec 상태**: `docs/superpowers/specs/2026-04-28-token-health-monitor-design.md` **DEFERRED 유지**

- 다음 회고: **2026-05-11** (추가 1주 데이터 누적)
- 재평가 트리거: 1주 안에 token 4xx 1건 OR success 결론 + 발행 0건 케이스 발생 시 즉시 Go로 escalate

### 6.4 잔여 신호 (No-Go 유지에도 주목)

| 항목 | 상태 | 비고 |
|------|------|------|
| claude CLI Max 인증 갱신 주기 | **미확인** | 만료 시 healthcheck → WARN (A1 적용)이나 slot-level 100% fail 가능 |
| Blogger refresh_token 갱신일 | **미확인** | 6개월 미사용 시 invalid_grant — 다음 mid-review 체크 항목 추가 권장 |
| WP.com token revoke 감지 | **해당 없음** | non-expiring 확인, revoke는 사용자 액션 없으면 발생 안 함 |
| F1'-a instrumentation logs | ✅ 수집 중 | `[llm-stats]` claude calls=N, uptime=Mmin — H3·H4 분석 재료 축적 중 |

---

## 7. 부록: 원본 데이터 Dump

### 7.1 Commit 목록 (4/28~5/2 관찰 주요 commits)

```
44f6d95 fix(reliability): writeAndReview disclaimer auto-apply (5/2)
b2609f3 chore(spotcheck-5-2): AS[68]+WS[66] disclaimer patch, 8건 spot-check
5c33ef5 fix(reliability): editor inferStatus flat final_meta fallback (5/2)
0aa0cf9 feat(spotcheck-5-1): update-posts.mjs WP+Blogger, 5/1 9건 spot-check
5b2bef7 fix(reliability): F2-A 강화 revision_feedback+JSON_RETRY_GUARD (5/1)
45030b0 chore: 평일 아침 자동 점검 (2026-04-30)
0683f0c feat(blogger-posts): update-posts.mjs AS spot-check P0 fix
b0798c7 fix(reliability): F2-A writer schema retry + F2-B timeout 900s (4/30)
3c7009d feat(blogger-pages): update-pages.mjs Pages API 직접 갱신
ebffd9c chore: 평일 아침 자동 점검 (2026-04-29)
7e3e373 docs(adsense): contact.html 완성본
69e1629 docs(adsense): Pages slug 사실 정정
c25447d fix(editor): inferStatus final_meta fallback (4/29 1 fail 회수)
719b226 docs(retro): F1' fix evidence + 4/29 dispatch 검증 + 5/6 baseline
6914997 test(llm): F1'-c spawn retry 반영
0331737 fix(reliability): F1' 5종 sub-fix (4/29)
1d56120 feat: Phase 4a D4 policy/feedback/memory dispatch (#41)
724ca90 fix(publish): healthcheck claude-cli WARN-only A1 (4/28)
71822ef docs: WP OAuth 환상 정정 + Token monitor DEFERRED (4/28)
b7a4a33 lesson: title 연도 정책 B (4/28)
fe151d3 fix(title): 연도 표기 차단 + 정책 B (4/28)
bb81938 lesson: claude CLI hang + paperclip 안정성 복원 (4/28)
420b85d feat(trends): paperclip 안정성 복원 (4/28)
ca004b9 fix(semantic-dedup): 지명+토픽 sub-angle 차단 강화 (4/28)
667a4fa fix(llm): claude CLI spawn hang 근본해결 (4/28)
```

### 7.2 Issue 목록 (4/28~5/4)

```
#32 [2026-04-28] closed [silent-fail]       cron cancelled — run #25010381167
#33 [2026-04-28] closed [auto-discard]      AS / 2026년 7월 양도세 강화
#34 [2026-04-28] closed [queue-exhausted]   WS slot1
#35 [2026-04-28] closed [silent-fail]       cron cancelled — run #25028814076
#36 [2026-04-29] closed [auto-discard]      WS / 알츠하이머 초기 증상
#37 [2026-04-29] closed [auto-discard]      WS / 대사증후군 진단 기준
#38 [2026-04-29] closed [auto-discard]      TS / 충남 봄꽃 1박2일
#39 [2026-04-29] closed [auto-discard]      TS / 5월 전남 섬 여행
#40 [2026-04-29] closed [auto-discard]      AS / 청약 부양가족 인정 요건
#42 [2026-04-29] closed [auto-discard]      WS / 5월 가정의 달
#43 [2026-04-29] closed [auto-discard]      WS / 어린이날 아이 건강
#44 [2026-04-29] closed [auto-discard]      WS / 자가면역질환 종류
#45 [2026-04-29] closed [auto-discard]      TS / 황금연휴 인천공항 혼잡
#46 [2026-04-30] closed [auto-discard]      AS / 양도세 중과 유예 종료
#47 [2026-04-30] closed [auto-discard]      WS / HPV 백신 남자 청소년
#48 [2026-05-01] closed [auto-discard]      AS / 분당 재건축 결합지정
#49 [2026-05-01] closed [lesson-pending]    hub: incident 3+일 무대응 (fp:71822ef1)
#50~63 [2026-05-02~03] open [lesson-pending] hub: lesson 미처리 알림 (정상 채널 신호)
```

### 7.3 4/29 dispatch #25091647631 핵심 stats (F1'-a instrumentation)

```
[ulimit] file descriptors: 10240
[orphan-kill] pre-cron sweep complete (claude -p 패턴)
[auto-publish] niche간 병렬 시작: WS,TS,AS (각 3 slot)
[llm-stats] claude calls=31, uptime=46.1min
[auto-publish] success: 8, failed: 1, skipped: 0
```

### 7.4 F1' 전/후 비교 (4/29)

| 지표 | dispatch #25085433470 (F1' 이전) | dispatch #25091647631 (F1' 이후) |
|------|------|------|
| conclusion | failure | **success** |
| duration | 115분 | **47분 (-60%)** |
| success/fail | 4/9 (44%) | **8/9 (89%)** |
| spawn-related fail | 3건 | **0건** |
| ulimit | 256 (macOS default) | **10240** |

---

## 변경 이력

- **2026-05-04 (작성)**: 4/28~5/4 1주 관찰 데이터 수집 + Token Health Monitor No-Go 권고 박제.
  원격 실행으로 5/3~5/4 cron 결과 미확인. playbook hub cross-repo 접근 불가.
