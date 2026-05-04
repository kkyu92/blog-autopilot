---
name: develop-cycle-blog
description: blog-autopilot 워커 프로젝트 디벨롭 1 사이클 (진단 → chain 선택 → 시퀀스 실행 → commit + PR → 회고) 을 N번 반복. 사용자가 `/develop-cycle-blog [N=1]` 또는 "블로그 사이클 N번 돌려" 입력 시 시작. chain pool 10개 (fix-incident / publish-incident / content-curate / audience-feedback / polish-ui / review-code / explore-idea / expand-scope / design-system / skill-evolution) — 처음 7개 + expand-scope (메타 기획) + design-system (시스템 디자인) 메인 자율 선택, skill-evolution (SKILL.md 자가 갱신) trigger 충족 시 자동 발화. dispatch 채널 4종 (lesson / cycle-retro / meta-pattern / chain-evolution) submit-lesson.yml 단일 transport (Phase 4a D4 박제, 1d56120). cycle_state JSON + skill-evolution-pending 마커로 사이클 사이 carry-over. 머니볼 develop-cycle 의 blog-autopilot 도메인 fork (3rd fork).
---

# develop-cycle-blog

blog-autopilot (워커) 프로젝트 develop 사이클을 N번 반복. **메인 자유 추론 + chain pool** 기반. 사용자 직접 호출 default. zero-touch 자동 fire 는 phase 2 영역 (manual default).

## 비전

> "blog-autopilot 워커가 발행 신뢰성 + 콘텐츠 품질 + audience metric 3 영역을 자율 개선 — 사이클 1회 뿐만 아니라 N회까지 메인 자유 추론으로"

- **Layer A (사이클 1회 안)**: 진단 → 상황 맞는 superpowers/gstack/blog 도메인 skill chain 자율 선택 + 실행
- **Layer B (사이클 N회 사이)**: cycle_state JSON 풍부 carry-over + skill-evolution self-trigger

## 사용

- `/develop-cycle-blog` → N=1 (기본)
- `/develop-cycle-blog 3` → 3 사이클 (사용자 권장 default)
- 자연어: "블로그 사이클 3번 돌려"

## chain pool — 도구상자 10개

매 사이클의 진단 결과 보고 메인 (Opus 4.7) 이 자유 추론으로 1개 선택. 룰 X. 새 chain 추가 = 본 table 한 행 추가.

`expand-scope` / `design-system` = 메인 자율 선택. `skill-evolution` = trigger 충족 시 강제 자동 발화 (메인 자율 X).

| Chain | 적용 조건 (trigger) | 시퀀스 | 멈춤 조건 |
|---|---|---|---|
| `fix-incident` | 진단 = 일반 버그 (workflow / 스크립트 / 비-publish API / 비-콘텐츠 영역). silent fail / regression. **publish 영역은 `publish-incident` 우선**. | `/investigate` → 코드 수정 → `/ship` | PR 생성 + CI green 또는 root cause 미해결 |
| `publish-incident` (도메인) | 진단 = 자연 cron `auto-publish.yml` 결과 fail / disclaimer 누락 / F2 metric 회귀 / Blogger·WP API 에러 / SCHEDULED state false-positive / spot-check 자연 영역 | `/investigate` → cron run 분석 (`gh run view`) → spot-check (**ADMIN view 필수** — Blogger `view=ADMIN` / WP `context=edit`) → DB query (`data/blog.db`) → fix (editor / writer prompt / publish path) → `/ship` → 다음 자연 cron 검증 신호 박제 | PR + 다음 cron 회귀 X 또는 fix 회수 결정 (`memory: project_f2a_strengthening_5_1.md` 정합) |
| `content-curate` (도메인) | 진단 = 콘텐츠 품질 부채 — niche prompt 갱신 후 검증 / spot-check N글 / disclaimer wording 분포 / 외부 링크 / 환각 도메인 / 길이·H2·H3 균형 / niche별 표준 형식 변동 | spot-check N글 (ADMIN view) → 품질 dimensions 측정 → prompt (`prompts/agents/content-writer.md`) 또는 editor 코드 fix → `/ship` → 회고 박제 | quality fix PR 또는 spot-check evidence-only 회고 (`lesson:` dispatch) |
| `audience-feedback` (도메인) | 진단 = GSC indexing 변화 / impressions trend / AdSense 상태 변동 / niche별 traffic 변동 / 사용자 metric 발화 / SEO baseline JSON 비교 (`docs/seo/baseline-*.json`) | GSC scrape (사용자 영역 시) 또는 baseline JSON 비교 → trend 분석 → action plan → (선택) SEO meta / robots / sitemap / Pages 코드 fix → `/ship` | trend 회고 박제 (`memory:` dispatch) 또는 SEO fix PR |
| `polish-ui` | 진단 = blog-autopilot 콘솔 UI 부채 — 대시보드 / settings page / topics 탭 / 사이드바 / 모바일 layout 깨짐 / 디자인 일관성 균열 (시스템 X) | `/plan-design-review` → `/design-review` → `/ship` | UI fix PR 또는 design system 박제 |
| `review-code` | 진단 = 스크립트·src 품질 / 테스트 부족 / 복잡도 누적 (`pnpm lint` / `pnpm test` 커버리지 / 큰 파일 300+ 줄) | `/health` → `/simplify` → `/review` → `/ship` | 품질 score 개선 또는 cleanup PR |
| `explore-idea` | 진단 = 신규 niche 후보 / 새 자동화 idea / 새 prompt agent 후보 / 새 platform 후보 (Medium / Substack / 신규 Blogger) / 사용자 ideation 발화 | `/office-hours` → `/plan-ceo-review` → `/plan-eng-review` → 구현 → `/ship` | spec/plan 박제 또는 사용자 reject |
| `expand-scope` (메인 자율) | 메타 기획 — (1) 직전 4 사이클 모두 small fix 만 (2) GH issue body 에 architecture/refactor/redesign/scope 키워드 (3) `meta-pattern` 누적 = "이 영역 재검토" (4) 사용자 N = milestone (5) `TODO.md` "큰 방향" 4주+ 미진행 | `/office-hours` → `/plan-ceo-review` (**SCOPE EXPANSION 강제**) → spec write → 구현 → `/ship` | spec + ship PR (success) / spec only + 사용자 review (partial) / "확장 가치 부족" → retro-only |
| `design-system` (메인 자율) | 시스템 디자인 — (1) `DESIGN.md` 갱신 ≥ 4주 또는 부재 (2) 사용자 발화 ("디자인 다듬어" / "공개 대비") (3) `meta-pattern` = "design chain 0회 N 사이클" (4) DESIGN.md vs 컴포넌트 균열 grep | `/design-consultation` → `/design-shotgun` → `/plan-design-review` → (선택) `/design-html` → 구현 → `/design-review` → `/ship` | design system PR / consultation+shotgun (partial) / "현 디자인 충분" → retro-only |
| `skill-evolution` (자동 발화) | SKILL.md 자가 갱신 — trigger OR (메인 자율 X): (1) `chain-evolution` subtype commit 5건 누적 (2) 같은 chain 5회 연속 fail (3) `cycle_n % 50 == 0` (4) `meta-pattern` body 에 "SKILL 갱신 필요" 명시 (5) 직전 20 사이클 동안 chain 1개 0회 발화 | trigger 증거 수집 → 갱신 영역 list → `/office-hours` → spec write → `~/projects/blog-autopilot/.claude/skills/develop-cycle-blog/SKILL.md` Edit → `pnpm test` smoke → commit `feat(skill):` → branch `develop-cycle-blog/skill-evolution-N` → PR + 사용자 review → `meta-pattern` dispatch (변경 diff) | SKILL 변경 PR + 사용자 머지 (success) / spec only + 사용자 review (partial) / "현 SKILL 충분" → retro-only |

### 책임 경계

- chain pool = 도구상자. 어떤 chain 들이 사용 가능한지 명시
- 선택 = 메인 자율 추론. 진단 결과 + chain pool 보고 자유 선택
- 실행 = chain sequence 직렬 호출 (Skill 도구 또는 Agent 도구). chain 안 sub-skill 실패 시 stop 조건 따라 회고

### default fallback

진단 결과가 chain pool 7개 (fix-incident / publish-incident / content-curate / audience-feedback / polish-ui / review-code / explore-idea) 어디에도 안 맞으면 `fix-incident` 자연 fallback (가장 일반화된 chain). 머니볼 `dimension-cycle` 같은 별도 fallback 없음 — niche 차원은 모든 chain 이 자연 인지.

## dispatch 채널 — submit-lesson.yml 단일 transport (4채널)

기존 `.github/workflows/submit-lesson.yml` (Phase 4a D4, commit `1d56120`) 가 이미 4 prefix (`lesson:` / `policy:` / `feedback:` / `memory:`) 모두 허브 (`kkyu92/playbook`) `worker-lesson` 채널 dispatch. 신규 workflow X — body 의 `subtype:` 라인으로 4채널 분류. 허브 측 단일 `worker-lesson` 채널이 subtype 보고 routing.

| 채널 | trigger | payload (commit body) | commit prefix + subtype | 빈도 가드 |
|---|---|---|---|---|
| `lesson` | 박제할 학습 발견 | lesson markdown (사례 / 원인 / 대응 / 박제 위치) | `lesson:` + `subtype:` 미지정 (= 기본 lesson 분류) | 자율 (사이클 1+ 가능) |
| `cycle-retro` | 매 사이클 끝 자율 | `cycle_n` / `chain_selected` / `outcome` / `retro.summary` / `next_recommended_chain` + 본 메인 한줄 메타 | `policy:` + `subtype: cycle-retro` | 매 사이클 1회 강제 |
| `meta-pattern` | N ≥ 5 누적 발견 자율 판단 | 패턴 description + 증거 (cycle_n list) + 추천 행동 | `memory:` + `subtype: meta-pattern` | 임계 충족 시만 (잡음 차단) |
| `chain-evolution` | 자율 chain 후보 판단 | 신규 chain spec — slug / trigger / 시퀀스 / stop 조건 / 발화 예시 | `memory:` + `subtype: chain-evolution` | 자율 (5건 누적 → `skill-evolution` trigger) |

### commit body 표준 형식 예시

```
memory: chain-evolution platform-migration chain 후보

subtype: chain-evolution
slug: platform-migration
trigger:
  - WP→Blogger 같은 cross-platform 마이그레이션 의제
  - 신규 platform 추가 (Medium / Substack)
  - 도메인 변경 (custom domain 도입)
sequence: /office-hours → /plan-ceo-review → /plan-eng-review → 마이그레이션 스크립트 → batch 실행 → /ship
stop: 마이그레이션 PR + cut-over 검증 또는 retro-only
evidence:
  - cycle 7: explore-idea 로 처리됐지만 batch 실행 영역 부재
  - cycle 9: 동일 패턴 두 번째 발생
recommendation: chain pool 11번째 추가 가치
```

### 단일 사이클 dispatch 한도

- 단일 사이클 dispatch ≤ 2 commit (cycle-retro 1 강제 + 메타 류 1 자율 = max 2)
- 매 사이클 4건 dispatch = 잡음 가드
- `meta-pattern` + `chain-evolution` 둘 다 한 사이클에 발화 X (자율 1택)

### 자가 발화 위치 (skill 시퀀스 안)

```
사이클 단계 4 (회고)
  ├── cycle_state JSON write           (~/.develop-cycle-blog/cycles/<n>.json)
  ├── (1) cycle-retro commit          ← 강제 dispatch (매 사이클)
  ├── 본 메인 자가 평가
  │     - 5+ 누적 메타 발견 있나?  → (2) meta-pattern commit
  │     - 신규 chain 후보 명확한가? → (3) chain-evolution commit
  │     - 둘 다 X                  → 추가 dispatch X
  ├── lesson 발견 시               → (4) lesson commit (자율)
  └── skill-evolution trigger 평가
```

## 사이클 단계 1 — 진단

### 풀 스캔

CLAUDE.md "세션 시작" + handoff drift 감지 정합. `HANDOFF_SNAPSHOT.md` 자동 픽업 (memory `feedback_session_handoff_trigger.md` 정합):

```bash
# git 상태
git log --oneline -20
git status

# 워크플로 / cron 결과
ls .github/workflows/
gh run list --workflow=auto-publish.yml --limit 5
gh run list --limit 10  # silent skip / cron health

# OPEN issue / PR
gh issue list --state open --limit 10
gh pr list --state open --limit 10

# DB 발행 상태 (publish-incident / audience-feedback 진단 input)
sqlite3 data/blog.db "SELECT date(published_at,'localtime'), niche, COUNT(*) FROM published_posts GROUP BY 1,2 ORDER BY 1 DESC LIMIT 14"

# 메모리 evidence (project_*.md)
ls /Users/kyusikkim/.claude/projects/-Users-kyusikkim-projects-blog-autopilot/memory/project_*.md
```

### 직전 3 cycle_state read

```bash
for n in $(($CYCLE_N - 1)) $(($CYCLE_N - 2)) $(($CYCLE_N - 3)); do
  cat ~/.develop-cycle-blog/cycles/$n.json 2>/dev/null
done
```

각 파일에서 `chain_selected` + `execution.outcome` + `retro.summary` + `retro.next_recommended_chain` 추출. 다음 진단 input.

### 중복 chain 회피 신호

직전 3 사이클이 모두 같은 chain 이면 다른 chain 우선 (LLM 추론 input).

### key_findings 추출

scan + 직전 cycle_state 결과 보고 메인이 주목한 발견 list 박제. 다음 chain 선택의 근거.

### 자율 처리 vs 사용자 결정 영역 분류 (자가 검열 방어)

진단 시 발견한 영역은 다음 분류로 즉시 결정:

- **자율 처리 가능** (즉시 chain 안에서 처리, TODO 박제 X):
  - 코드/스크립트/테스트/docs/prompts 변경 (workflow yaml 외)
  - DB 데이터 read-only query / spot-check
  - 메모리 갱신 (사용자 결정 영역 X)
  - 작은 cleanup (lint warnings, dead import, frontmatter)
- **사용자 결정 영역** (TODO.md 또는 메모리 carry-over 박제, 자율 처리 X):
  - workflow yaml 변경 (memory `feedback_claude_code_action_workflows_write_block` 정합)
  - secrets / force-push / `.env.local` 변경 (memory `feedback_automation_default_zone` 정합)
  - **외부 SaaS 자율 결제** — 절대 금지
  - **신규 외부 platform 가입** (AdSense / Naver / Medium 등 사용자 계정 영역)
  - **DB write / migration** (큰 batch 이전, e.g., WP→Blogger cut-over) — 사용자 GO 필수
  - **Cloudflare worker / Vercel free tier 변경** — memory `feedback_cloudflare_cron_slot_conservation` 정합

**자가 검열 방어**: "큰 작업 = 사용자 영역" 자율 default 편향 X. 영역 분류는 위 명시. small scope 만 default = 자가 검열 패턴 (memory `feedback_no_self_censorship` 정합).

chain 시퀀스 안 multiple fix OK — chain stop 조건 도달까지 1 PR 안에 여러 영역 처리 가능 (ROI ↑).

### chain 별 진단 source 명시 (다양성 보강)

매 진단이 한쪽 source 만 보면 chain 편중 발생. 10 chain 균형 trigger 위해 각 chain 의 source 진단 시 균형 인지:

| Chain | 진단 source (어디 봐야 trigger 자연) |
|---|---|
| `fix-incident` | open GH issues (bug/incident 류) / Vercel deploy log / `git log` debug commit / `pnpm test` 실패 / 사용자 incident 신고 / pat-expiry-check 알림 |
| `publish-incident` | `gh run view <auto-publish run_id>` log grep `FAIL\|✗\|TIMEOUT\|missing field\|invalid JSON` / `data/blog.db` `published_posts` 누적 회귀 / disclaimer 누락 spot-check / Blogger · WP API rate-limit / SCHEDULED state false-positive |
| `content-curate` | spot-check ADMIN view 결과 / niche별 표준 wording 적용률 / 외부 링크 / 환각 도메인 / 길이·H2·H3 분포 / `prompts/agents/content-writer.md` 갱신 후 검증 발화 |
| `audience-feedback` | GSC scrape 또는 사용자 측 GSC 화면 캡처 / `docs/seo/baseline-*.json` 비교 / impressions/clicks trend / AdSense 상태 / niche별 traffic 변동 / 사용자 metric 발화 |
| `polish-ui` | open GH issues (UI/design 류) / 사용자 UI 신고 / `/topics` `/posts` `/settings` 페이지 모바일 layout 깨짐 / 디자인 일관성 균열 |
| `review-code` | `pnpm lint` output / `pnpm test` 커버리지 / 큰 파일 (300+ 줄) 복잡도 / dead code / `health` score |
| `explore-idea` | open GH issues (idea/scout 류) / `TODO.md` "Next-Up" / 자연 발화 새 niche 후보 / 사용자 ideation 발화 / 신규 platform 후보 |
| `expand-scope` | `TODO.md` "큰 방향" 4주+ 미진행 / `meta-pattern` "이 영역 재검토" / 사용자 N=milestone 호출 |
| `design-system` | `DESIGN.md` 갱신 ≥ 4주 또는 부재 / 컴포넌트 균열 grep / 사용자 "공개 대비" 발화 |

진단 단계가 위 source 카테고리 균형 있게 훑은 후 key_findings 추출. 한 source 만 깊이 파고 다른 source 안 본 경우 회피.

### 진단 source 우선순위 — open GH issues 우선 (N 무관 자동 처리)

매 사이클 진단 단계 첫 step:

```bash
gh issue list --repo kkyu92/blog-autopilot --state open --limit 20
```

1. **open issue 있으면** → 그 중 1건 자율 선택 (issue body 보고 chain 매핑) → 사이클 진행. PR commit message 에 `Fixes #<num>` 박제 → 머지 시 자동 close
2. **issue 0 건 또는 직전 3 사이클이 같은 issue 영역 처리 후** → 기존 source (cron run / DB / lint / spot-check / 메모리 evidence) 진행
3. **N (사용자 호출 사이클 수) 와 issue 수 무관** — N=8 호출 시 open issue 5건 이면 5 사이클 issue 처리 + 3 사이클 기존 source 자연

issue 처리 시 매핑 예:
- "auto-publish cron silent skip" → `publish-incident` 또는 `fix-incident`
- "AS niche 글이 disclaimer 없음" → `publish-incident` 또는 `content-curate`
- "GSC indexing 0/220 회복 의제" → `audience-feedback`
- "신규 niche 추가 의제" → `explore-idea`
- "콘솔 모바일 layout 깨짐" → `polish-ui`
- "scripts/ 큰 파일 리팩토링" → `review-code`

issue body 보고 메인 자율 결정. 룰 X.

## 사이클 단계 2 — chain 선택

### 메인 자유 추론

진단 결과 + chain pool table 보고 메인 (Opus 4.7) 이 자유 선택. 룰 X.

```
입력: 진단 key_findings + chain pool table + 직전 3 cycle_state
출력: chain_selected (slug) + chain_reason (선택 이유 자연어)
```

### default fallback

진단 결과가 chain pool 7개 (fix-incident / publish-incident / content-curate / audience-feedback / polish-ui / review-code / explore-idea) 어디에도 안 맞으면 `fix-incident` 자연 fallback (가장 일반화).

### next_recommended_chain 힌트

직전 사이클 cycle_state.retro.next_recommended_chain 이 있으면 진단 input 으로 활용. 강제 X (메인 자율 결정 우선).

## 사이클 단계 3 — chain 시퀀스 실행

### 직렬 호출

선택한 chain 의 sequence 따라 skill 들을 순서대로 호출:

- 가벼운 step (단순 진단 / 단일 skill / 메인 컨텍스트 안 처리 가능) → Skill 도구
- 무거운 step (long horizon 작업 / context isolation 필요 / 병렬 작업) → Agent 도구

각 step 의 결과는 cycle_state.execution.skills_invoked / results 에 박제.

### chain stop 조건

각 chain 의 stop 조건 (chain pool table 참조) 도달 시 실행 종료. 결과는 outcome (`success` / `fail` / `partial`).

### commit + PR

chain 결과를 CLAUDE.md 자연 prefix (`feat / fix / chore / docs / test`) 따라 commit + branch (`develop-cycle-blog/<slug>-<n>`) + PR.

**자동 머지 X — 사용자 review default**. 단일 사용자라 추가 reviewer 없지만, blog-autopilot 변경은 자연 cron 발행에 직접 영향 → 머지 시점은 사용자 GO. PR 생성 + CI green 까지 자율, 머지 = 사용자 결정.

dispatch 채널 commit (cycle-retro / lesson / meta-pattern / chain-evolution) 은 main 직접 commit (PR X) — `submit-lesson.yml` 이 main push 자동 dispatch (workflow trigger `branches: [main]`). PR review 절차 불필요.

## 사이클 단계 4 — 회고

### cycle_state JSON write

`~/.develop-cycle-blog/cycles/<n>.json` 작성. 스키마:

```json
{
  "cycle_n": 12,
  "started_at": "2026-05-04T13:00:00Z",
  "ended_at": "2026-05-04T13:45:00Z",
  "diagnosis": {
    "scan_summary": "git log 20 / OPEN issue 0 / cron run 5/4 9/9 success / DB 84 누적 / 메모리 4 entry",
    "key_findings": ["...", "..."],
    "input_from_prev_cycles": ["cycle 11 chain=publish-incident outcome=success", "..."]
  },
  "chain_selected": "publish-incident",
  "chain_reason": "...",
  "execution": {
    "skills_invoked": ["investigate", "ship"],
    "results": {"investigate": "...", "ship": "..."},
    "outcome": "success"
  },
  "commit_hash": "abc1234",
  "pr_number": 67,
  "retro": {
    "summary": "...",
    "todos_added": ["..."],
    "next_recommended_chain": "content-curate",
    "next_recommended_reason": "..."
  }
}
```

### handoff carry-over 와 책임 분리

| 메커니즘 | 단위 | 위치 |
|---|---|---|
| handoff save | 세션 단위 | `~/.gstack/projects/kkyu92-blog-autopilot/checkpoints/` |
| HANDOFF_SNAPSHOT.md | 세션 단위 (빠른 픽업) | repo root |
| cycle_state | 사이클 단위 | `~/.develop-cycle-blog/cycles/<n>.json` |
| git commit | 변경 단위 | git history |
| TODO.md / STATUS.md | 사용자 가시 | repo root |
| 메모리 (auto-memory) | 사용자 정합 | `~/.claude/projects/-Users-kyusikkim-projects-blog-autopilot/memory/` |

### skill-evolution trigger 자동 평가 (매 사이클 retro 마지막 step)

cycle_state JSON write 후, dispatch 채널 commit 박제 후, 본 메인이 다음 trigger 5개 중 하나라도 충족 여부 자가 평가:

| # | 조건 | 평가 명령 |
|---|---|---|
| 1 | `chain-evolution` subtype commit 5건 누적 (전체 git history) | `git log --all --grep "subtype: chain-evolution" --oneline \| wc -l` ≥ 5 |
| 2 | 같은 chain 5회 연속 outcome=fail | 직전 5 cycle_state JSON read 후 `chain_selected` + `outcome=fail` 동일 5회 |
| 3 | `cycle_n % 50 == 0` (milestone) | $CYCLE_N % 50 == 0 |
| 4 | `meta-pattern` body 에 "SKILL 갱신 필요" 명시 | 본 사이클의 `meta-pattern` commit body grep "SKILL 갱신 필요" |
| 5 | 직전 20 사이클 동안 chain pool 의 chain 1개가 0회 발화 | 직전 20 cycle_state JSON 의 `chain_selected` distinct count vs chain pool 10개 비교 |

**충족 시 동작**: 다음 사이클 진단 단계 첫 step 에서 본 메인이 `~/.develop-cycle-blog/skill-evolution-pending` 마커 파일 존재 확인 → 존재 시 `skill-evolution` chain 강제 발화 (자율 X).

**충족 X**: 어떤 trigger 도 충족 안 됐으면 정상 진행.

**충족 시 마커 박제**:

```bash
echo "$CYCLE_N: $(git log -1 --format=%H)" > ~/.develop-cycle-blog/skill-evolution-pending
```

다음 사이클이 본 마커 발견 시 = `skill-evolution` chain 자동 발화. chain 끝 (= success 또는 retro-only) 시 마커 삭제 (`rm ~/.develop-cycle-blog/skill-evolution-pending`).

### 다음 사이클이 skill-evolution 강제 발화 (마커 발견 시)

진단 단계 첫 step:

```bash
if [ -f ~/.develop-cycle-blog/skill-evolution-pending ]; then
  echo "skill-evolution 자동 발화 — 마커: $(cat ~/.develop-cycle-blog/skill-evolution-pending)"
  # chain_selected = "skill-evolution" 자동 결정 (메인 자율 X)
  # 시퀀스: trigger 증거 수집 → 갱신 영역 list → /office-hours → spec write
  #         → ~/projects/blog-autopilot/.claude/skills/develop-cycle-blog/SKILL.md Edit
  #         → pnpm test smoke → commit feat(skill): → PR + 사용자 review
  #         → meta-pattern dispatch (변경 diff)
  # chain 끝: rm ~/.develop-cycle-blog/skill-evolution-pending
fi
```

## 실패 모드 & 안전장치

| 실패 | 안전장치 |
|---|---|
| chain pool 적용 조건 모호 | `fix-incident` 폴백 또는 신규 chain 박제 (다음 PR) |
| chain 안 sub-skill 실패 | cycle_state outcome=`fail` + retro 에 fail reason + 다음 사이클 회피 신호 |
| cycle_state JSON write 실패 | handoff save 호출 (안전망) |
| 메인이 chain 선택 잘못 | 사용자 끼어들기로 사이클 중단 |
| 직전 cycle_state read 실패 (파일 없음 / 손상) | input_from_prev_cycles = [] 빈 배열 |
| 동일 chain 3회 연속 | LLM 추론 input 으로 다른 chain 우선 |
| 메타 chain (`expand-scope` / `design-system`) 1사이클 동시 발화 | 발화 빈도 가드 (1택) |
| 메타 chain 본 chain 의 직전 발화 사이클 outcome ≠ success | 다음 발화 회피 (해당 chain 만). 다른 chain 1회 success 후 가능 |
| `skill-evolution` 무한 self-trigger | 직전 3 사이클이 `skill-evolution` 이면 회피. 마커 삭제 |
| `skill-evolution` smoke (`pnpm test`) fail | PR 생성 X. retro-only outcome=fail. 마커 유지 → 다음 사이클 재시도 |
| `meta-pattern` + `chain-evolution` 1사이클 동시 발화 | 자율 1택 (잡음 차단) |
| `submit-lesson.yml` dispatch silent skip | `gh run view --log` grep / 허브 측 worker-lesson Issue 수동 확인 (memory `feedback_worker_lesson_suggestion` 정합) |
| SKILL.md 잘못 변경 누적 | git history 자동 백업. 사용자가 `git revert <commit>` 1회 복구 |
| 외부 SaaS 자율 결제 시도 | 본 SKILL 안 paid API 호출 명령 박제 절대 X |
| 사용자에게 "이거 해주세요" 자율 요청 | carry-over 박제 채널만 (memory: subtype=needs). 직접 요청 명령 박제 X |
| `auto-publish.yml` cron 발행 사이클 충돌 | chain 시퀀스 안 `auto-publish.yml` workflow yaml 변경 X (사용자 GO 영역). publish 코드 (`src/`, `scripts/auto-publish.ts`) 변경은 OK |
| `data/blog.db` write 자율 시도 | read-only query (`SELECT`) 만 자율. `UPDATE / INSERT / DELETE` = 사용자 GO 영역 |
| Vercel free tier (deploy 100/일) 한도 도달 | `meta-pattern` dispatch + cycle outcome=fail. 자율 upgrade X |
| force-push / `.env.local` / secrets 자율 작업 | 사용자 GO 필수 (memory `feedback_automation_default_zone` 정합) |

## 호환성 & 차이 (vs 머니볼 / 허브)

| 차원 | 머니볼 (#1) | 허브 (#2) | blog (#3) |
|---|---|---|---|
| chain pool | 9개 (가설 검증 중심) | 11개 (메타 인프라 + 콘텐츠 큐레이션) | **10개** (publish 신뢰성 + 콘텐츠 + audience metric) |
| 도메인 chain | operational-analysis | curate / worker-incident-triage / closed-loop-design | **publish-incident / content-curate / audience-feedback** |
| 제외 chain | — | operational-analysis (사용자 metric 비공개) | dimension-cycle (legacy fallback 불필요) / worker-incident-triage / closed-loop-design |
| dispatch transport | `submit-lesson.yml` 워크플로 | commit body subtype (워크플로 X — 자기 자신) | **`submit-lesson.yml` 워크플로** (Phase 4a D4 박제 정합) |
| cycle_state location | `~/.develop-cycle/cycles/` | `~/.develop-cycle-hub/cycles/` | `~/.develop-cycle-blog/cycles/` |
| zero-touch watch.sh | 적용 (자동 다음 fire) | manual default (phase 2 후속) | **manual default** (phase 2 후속, 허브 패턴 채택) |
| commit prefix | feat/fix/lesson/policy/feedback/memory | CLAUDE.md 정합 (feat/fix/data/content/refactor) + dispatch 4종 | **feat/fix/chore/docs/test** (CLAUDE.md 자연) + dispatch 4종 (lesson/policy/feedback/memory) |
| branch prefix | `develop-cycle/<slug>` | `develop-cycle-hub/<slug>-<n>` | `develop-cycle-blog/<slug>-<n>` |
| auto-merge | R7 자동 머지 | Auto Merge to main 워크플로 자동 머지 | **사용자 review default** (자동 머지 X — 발행 cron 영향 직접) |
| smoke test | `pnpm test` | (없음, 위키 lint) | `pnpm test` (vitest 339+ tests) |
| 진단 source | open GH issues `hub-dispatch` 우선 + Sentry/lint/test/metric | open GH issues `hub-dispatch` 우선 + 위키 lint / silent-skip-tracker / 워커 inbound | open GH issues 우선 (label 정책 부재) + cron run / DB / spot-check / SEO baseline / 메모리 |

## 비용 가드

| 비용 종류 | 정책 |
|---|---|
| Claude Plan token (Max 요금제) | OK — 효율 신경. 메타 스킬 발화 시 토큰 모니터, fail 시 retro-only fallback |
| 외부 서비스 결제 | 자율 결제 절대 금지. carry-over 알림만 |
| Vercel free tier (deploy 100/일) | 자율 monitor + 자율 upgrade 금지. memory `feedback_deploy_strategy` 정합 (push 묶기) |
| GitHub Actions cron slot | memory `feedback_cloudflare_cron_slot_conservation` 정합 (Cloudflare Free 5 slot). 5개+ cron 도달 시 외부 scheduler default |
| Anthropic API ($) | `auto-publish.yml` cron 자체가 Anthropic API 사용 중. 추가 API 호출 자율 도입 시 사용자 GO (5/6 F2' 결정 의제) |
| 사용자 시간 | 본 메인이 사용자에게 "이거 해주세요" 자율 요청 금지 |

비용 가드 위반 차단 메커니즘:
- 본 SKILL 안 외부 paid API 호출 명령 박제 X
- 본 SKILL 안 force-push / 워크플로 yaml / secrets 작업 자율 명령 박제 X (사용자 GO 영역)
- `data/blog.db` write 자율 명령 박제 X (read-only query 만)

## 마이그레이션 path (단계적 발화)

| 단계 | 시점 | 발화 |
|---|---|---|
| 0 | 본 spec 머지 직후 | chain pool 10 즉시. 첫 사이클부터 `cycle-retro` commit 강제 |
| 1 | N ≥ 5 사이클 | `meta-pattern` / `chain-evolution` dispatch 가능 (자율 판단) |
| 2 | N ≥ 20 사이클 | `skill-evolution` 첫 발화 가능 + zero-touch watch.sh 적용 검토 |
| 3 | N = 50 milestone | `skill-evolution` 자동 발화 (50 milestone trigger) |
| 4 | N ≥ 100 누적 | 본 SKILL 자가 진화 N회 누적. chain pool 자체 변경 가능 |

## 첫 dogfood 권장 시점

5/5 WP→Blogger cut-over **완료 후** 첫 사이클 자연. 이유:

- 5/5 cut-over 자체는 마이그레이션 plan 박제 + 9.2h batch 이전 + 사용자 GO 영역 → develop-cycle 사이클 sub-skill 보다 직접 실행이 자연
- cut-over 후 5/6 첫 Blogger 분기 cron 자연 검증 → 본 SKILL 의 `publish-incident` chain 첫 자연 발화 conditions 완비
- 그 전 본 SKILL 박제만 PR + 사용자 review + 머지 = 도구 준비
- 사용자가 마이그레이션 전에 `/develop-cycle-blog 1` 호출 시 = `fix-incident` 또는 `content-curate` 자연 발화 (publish 영역 회귀 X 시)

## 컨텍스트 % 자가 판단 무시

manual default 라 사용자 직접 호출 + 사이클 사이 끼어들기 가능. 메인 자가 "N 너무 많지 않나?" 의심 X. memory `feedback_no_self_censorship` 정합.

**규칙**:

1. 사용자가 N 명시한 만큼 매 사이클 진행
2. 매 사이클 끝 = cycle_state JSON 박제 (다음 사이클 N 줄어듦)
3. handoff save 자동 호출 X — cycle_state JSON 으로 carry-over 충분
4. 사용자 끼어들기 ("stop" 입력) 가 유일한 stop 신호. 그 외엔 진행
5. 사용자 % 알림 (예: "지금 80% 야") 받으면 그 사이클 끝낸 후 정상 진행

## 호출 → 종료 보고

- **사이클 N 모두 success 끝**: "DONE — N 사이클 완료. 결과: {chain별 outcome 요약}. 다음 사용자 결정 영역: {carry-over 항목}"
- **부분 fail / partial**: "DONE_WITH_CONCERNS — N 사이클 중 M success / K partial / L fail. fail reason: {요약}"
- **사용자 끼어들기 중단**: "STOPPED — 사용자 영역 결정 대기"
