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

## 1. 점검 영역 4개

| 영역 | 차원 | 측정 항목 |
|---|---|---|
| **A. 메인 — 발행 안정성** | 시스템 신호 | 9 슬롯 일별 cover율 (최근 14일), 실패 패턴 분류 (silent fail / queue exhausted / auto-discard), outdated 연도 차단율, semantic-dedup 적중률 |
| **B. 메인 — 트래픽·수익** | 사용자 입력 + 코드 분석 | GSC 노출/클릭/색인된 페이지 수, Blogger 방문자/페이지뷰, 애드센스 연결 상태 + 수익 + RPM, sitemap 등록 상태 |
| **C. 서브 — 양방향 자동화** | 코드/git/gh 분석 | playbook#58 워커 4차원 측정 재사용 + 14일 윈도우 갱신분, 후속 박제 3건 진입 가능성 평가 (sync receiver / refactor 사이클 / self_report 박제) |
| **D. 시스템 안정성·블로커** | 코드/gh 분석 | cron success rate (최근 14일), runner SPOF, claude CLI Max 만료 영향, queue depth, blogger 신규 도메인 신뢰도, 옛 부동산 9개 cannibalization |

---

## 2. 데이터 소스 매핑

| 측정 항목 | 소스 | 자동/수동 |
|---|---|---|
| 발행 cover율, 실패 패턴 | `gh run list` + GitHub Issues + DB(`data/content.db`, SQLite + Drizzle) | 자동 |
| outdated/dedup 적중 | `git log` + 프롬프트 코드 inventory + auto-discard 카운트 (gh issues) | 자동 |
| 양방향 채널 (서브) | playbook#58 본문 인용 + 14일 갱신분 (gh PR/Issue/dispatch 카운트) | 자동 |
| cron success | `gh run list --workflow=...` | 자동 |
| **GSC**: 노출, 클릭, 평균 CTR, 색인된 페이지 수, 검색 쿼리 top 5 | search.google.com/search-console 콘솔 | 사용자 batch 입력 |
| **Blogger**: 7일/14일 페이지뷰, 인기 게시물 top 5, 트래픽 소스 분포 | Blogger admin → Stats | 사용자 batch 입력 |
| **애드센스**: 연결 상태, 7일/14일 수익 ($), RPM, 클릭률 | google.com/adsense | 사용자 batch 입력 |

---

## 3. 실행 방식

```
Step 1. 사용자 콘솔 수치 batch 입력 (1회, ~10분)
Step 2. 병렬 dispatch — subagent 3개:
  - subagent A+D: 발행 안정성 + 시스템 안정성 (gh + DB + git)
  - subagent C: 양방향 자동화 (#58 인용 + 갱신분)
  - subagent B: 트래픽/수익 (사용자 수치 + 코드 흐름 종합)
Step 3. 종합 (메인 Claude):
  - 갭 도출 (최종완료까지 거리)
  - Risk 분류 (블로커 / 모니터링 / 기각)
  - 다음 1~2달 우선순위
```

**효율 도구**: `superpowers:dispatching-parallel-agents` 스킬 활용.

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

## 5. 측정 윈도우

- **현재 스냅샷**: 2026-04-28 시점 (모든 수치 현재 콘솔 값)
- **활동 윈도우**: 2026-04-14 ~ 2026-04-28 (14일) — playbook#58은 7일이라 14일 윈도우면 새 신호
- **베이스라인**: 첫 점검이라 비교 X. 다음 점검(5/4 week1-observation 또는 별도 사이클)부터 비교 가능

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

(이 섹션은 plan-ceo-review 스킬 진행 후 채워짐)

---

## 10. 미해결 의제 (점검 실행 단계로 이월)

- 트래픽/수익 데이터의 **API 연결 자동화** (현재 사용자 수동 입력) — 점검 끝에 별도 spec 후보
- playbook#58에 hub Phase 2b 8차원 mapping 응답 — hub 처리 시점 모름
- moneyballscore self-report와의 비교 mapping (playbook#57)

---

## 변경 이력

- **2026-04-28 (작성)**: brainstorming 1차 합의 (Q1=A 풀 정량, Q2=A 자동 분석)
