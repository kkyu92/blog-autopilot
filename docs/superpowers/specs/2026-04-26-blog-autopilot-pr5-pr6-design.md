# blog-autopilot PR5 + PR6 Design Spec

**작성일**: 2026-04-26
**Status**: DRAFT — pending user review
**Scope**: PR5 (lib + 테스트, 외부 영향 0) + PR6 (workflow + smoke, 외부 영향 ON)
**대체**: PLAN_v2_autopilot_workers.md §3.4~§3.6 (LLM 호출/cron/Playbook 통합 부분)
**보존**: PLAN_v2 §11~§14 (운영 구조, 6슬롯, schema 베이스, 시즌 캘린더)
**Brainstorming 결과**: superpowers:brainstorming skill 통한 PLAN_v2 충돌 해소 + gap 발굴

---

## 1. Background

PLAN_v2_autopilot_workers.md (2026-04-25 작성, APPROVED)는 blog-autopilot 마이그레이션 마스터 플랜. 이번 spec은 PR5/PR6 구현 진입 전 brainstorming으로 발견한 **PLAN_v2와 사용자 메모리 결정 사이 6개 충돌** 해소 + **PLAN_v2와 conversational 결정 양쪽에 빠진 critical gap 2개** 추가.

### 충돌 해소 결과

| # | 항목 | PLAN_v2 원안 | 이 spec 결정 | 사유 |
|---|---|---|---|---|
| 1 | 인프라 | GitHub Actions hosted runner | **self-hosted runner** (집 PC) | 메모리 `feedback_api_key_usage.md` (ANTHROPIC_API_KEY 금지) + `feedback_claude_code_subscription.md` (Claude Code Max) 양쪽 통과. 폰 트리거 비전 보존 |
| 2 | LLM 호출 | `lib/claude.ts` Anthropic SDK | **`claude` CLI spawn** (`--dangerously-skip-permissions`) | 위와 동일 메모리 제약. paperclip `claude_local` 패턴 일치 |
| 3 | Dedup window | 30일 + Evergreen 90일 | **4단계 (slug 영구 + 24h strict + 7d loose with 트렌드 override + evergreen 90d)** | hot topic 후속 글 cluster 가치 + cannibalization 방지 절충 |
| 4 | 알림 채널 | Playbook dispatch | **Playbook dispatch 보존** (PLAN_v2 §3.6 살아남) + GitHub Issue (Playbook 미운영 시 대체 fallback) | self-hosted runner는 workflow에서 직접 dispatch 가능 |
| 5 | 발행 슬롯 | 09/11/13/15/17/19 KST 6개 중 niche당 3개 랜덤 | **PLAN_v2 그대로 + WordPress/Blogger API native `scheduled_for` 활용** (자체 picker cron 제거) | 코드 단순화. 플랫폼 native 신뢰 |
| 6 | cron 시간 | 01:00 KST 정각 | **01:17 KST** | 외부 API(WP/Pexels) 정각 폭주 회피. self-hosted runner 자체 부담은 없음 |

### Brainstorming 발굴 gap (양쪽 모두 빠진 항목)

| Gap | 위험 | 해결 |
|---|---|---|
| 사전 헬스체크 부재 | 토큰 만료 silent fail → 며칠간 발행 0 | cron 첫 step에 5종 healthcheck. 1개라도 fail → cron skip + Issue |
| 같은 cron 내 slug 충돌 | `UNIQUE(niche, slug)` constraint로 9개 중 일부 INSERT 실패 | 9개 batch INSERT 전 자체 중복 체크 + suffix `-2` 자동 변형 |

---

## 2. 목표 (Goal)

1회 cron 사이클 = **9개 게시물 발행** (3 niche × 3 slot, niche=WS/TS/AS), 카테고리 매칭, 이미지 + 본문 품질 완성도 우선. 자동화 무인 운영. 사람 개입은 최종 폐기 시에만 (GitHub Issue).

---

## 3. 통합 결정 매트릭스 (13개)

| 항목 | 결정 |
|---|---|
| 모든 에이전트 모델 | `claude-sonnet-4-6` 통일 |
| LLM 호출 | `claude` CLI spawn (`--dangerously-skip-permissions`) |
| AGENTS.md 페르소나 | paperclip 5개 (`prompts/agents/{trend-hunter, content-writer, content-editor, image-curator, publisher}.md`) 그대로 복사 |
| 인프라 | self-hosted GitHub Actions runner (집 PC, daemon 백그라운드) |
| 트리거 진입점 | `schedule: '17 1 * * *'` + `workflow_dispatch` (폰 수동) + `repository_dispatch` (Phase 2) |
| 발행 슬롯 | API native `scheduled_for=09/11/13/15/17/19 KST` 중 niche당 3개 랜덤 |
| 에러 처리 | 게시물 단위 격리. cron 내 retry (editor 2회, publisher 3회 exp backoff). 최종 fail = Playbook dispatch + DB `status='failed'`. 큐잉 없음 |
| Dedup 4단계 | L1 slug 영구 + L2 keyword 24h strict + L3 keyword 7d loose with 트렌드 (급상승+priority≥80) override + L4 evergreen 90d strict |
| Slug 충돌 | 9개 batch INSERT 전 자체 중복 체크 + suffix `-2` 자동 변형 |
| 헬스체크 | cron 첫 step. Pixabay/Pexels/WP-WS/WP-TS/Blogger-AS 5종 가벼운 GET. 1개라도 fail → cron skip + dispatch |
| Niche 격리 | UNIQUE(niche, slug). dedup·queue·slot_time 모두 niche별 독립 |
| 시즌 캘린더 | `niches/seasonal-calendar.yaml` (PLAN_v2 §14 그대로). boost +20% |
| 카테고리 분산 | 한 카테고리 30% 초과 금지 (3일 윈도우, Trend Hunter prompt에 강제) |
| cron 시간 | `'17 1 * * *'` (01:17 KST). 외부 API 정각 트래픽 폭주 회피 |
| Evergreen 판단 책임자 | **Trend Hunter** — pickQueue output JSON에 `evergreen: boolean` 필드 추가. dedup이 이 플래그로 L4 분기 |
| Editor feedback 형식 | 자유 텍스트 (Korean). Writer가 attempt 2 prompt에 `\n\n[Editor 피드백]\n{feedback}` 형식으로 append |
| scheduled_slot 형식 | DB 저장은 `'HH:MM'` 문자열 (`'09:00'`, `'11:00'` 등). API native 호출 시 `scheduledFor`는 ISO 8601 timestamp로 변환 (해당 날짜 + slot 시간 KST → UTC) |

---

## 4. Architecture

```
[GitHub Actions runner — workflow auto-publish.yml]
        │
   3가지 진입점:
        ├─ schedule: '17 1 * * *' (매일 01:17 KST 자동)
        ├─ workflow_dispatch (폰 GitHub 앱 "Run workflow" 수동)
        └─ repository_dispatch (Phase 2: Playbook hub에서 자동 호출)
        │
        ▼
   [self-hosted runner = 집 PC, LaunchAgent daemon]
        │
        ▼
  scripts/auto-publish.ts   (오케스트레이터)
        │
   ┌────┼────────────────────────────────────────┐
   ▼    ▼                                        ▼
 lib/healthcheck.ts        lib/llm.ts (claude CLI spawn)
   │ 5 services 검증           │
   │ fail → exit + dispatch    ▼
   │                       prompts/agents/*.md (5 페르소나)
   ▼
 통과 시 진행 →
   trends.ts → dedup.ts (4-tier) → llm.ts(writer) → 
   editor.ts (revision 2회) → images.ts (Pexels→Pixabay→placeholder) →
   wordpress.ts/blogger.ts (API native scheduled_for=09/11/13/15/17/19) →
   DB published_posts INSERT
        │
        ▼
   workflow 정상 종료 → GitHub Actions UI ✅
   ※ 매 사이클 Playbook dispatch는 Phase 2에서 추가 (out of scope)
   ※ PR5/PR6에서는 폐기 시에만 Issue 생성 (사람 개입 신호)
```

**핵심 원칙**:
- 인터페이스 = GitHub (트리거/로그/알림 모두 GitHub 앱)
- 실행 = PC (self-hosted runner)
- 상태 = SQLite (`published_posts` 테이블 단일 소스)
- 외부 API native 활용 (scheduled_for, no 자체 picker cron)

---

## 5. Components

### PR5 — 코드 (외부 영향 0)

| 파일 | 책임 | 핵심 인터페이스 |
|---|---|---|
| `drizzle/migrations/0001_pr5_schema_boost.sql` | PR4 schema 보강 | `status` (`published`\|`failed`), `failure_reason`, `draft_json`, `metadata.evergreen`, `UNIQUE(niche, slug)`, `scheduled_slot` |
| `src/lib/healthcheck.ts` | 5종 서비스 가벼운 ping | `runAll(): Promise<HealthReport>` — fail 1개라도 있으면 throw |
| `src/lib/llm.ts` | `claude` CLI spawn wrapper | `callClaude({systemPrompt, userMessage, model='sonnet', expectJson?, timeoutMs=60000}): Promise<string>` |
| `src/lib/dedup.ts` | 4단계 dedup | `checkAndResolve(niche, keyword, evergreen): Promise<DedupResult>` — `pass`\|`skip`\|`follow_up`\|`slug_variant` |
| `src/lib/slug.ts` | slug 생성 + 충돌 변형 | `makeSlug(title): string`, `resolveBatchCollisions(slugs[]): string[]` |
| `src/lib/editor.ts` | QA gate + revision feedback | `review(draft): Promise<{verdict, score, reason?, feedback?}>` |
| `src/lib/images.ts` | 이미지 검색 + fallback chain | `fetchForSlots(slots[]): Promise<ImageResult[]>` — Pexels→Pixabay→placeholder. UA `blog-autopilot/1.0` 필수 |
| `src/lib/wordpress.ts` | 기존 + 스케줄 발행 | `publishScheduled(blogId, post, scheduledFor): Promise<{externalId, url}>` (status=future) |
| `src/lib/blogger.ts` | 기존 + 스케줄 발행 | `publishScheduled(blogId, post, scheduledFor)` |
| `src/lib/trends.ts` | 기존 + 큐 5~6, evergreen 플래그, dedup pre-filter | `pickQueue(niche, count=5): Promise<KeywordCandidate[]>` |
| `prompts/agents/*.md` | paperclip 5개 페르소나 복사 | trend-hunter, content-writer, content-editor, image-curator, publisher |
| `src/lib/__tests__/*.test.ts` | Vitest 단위 테스트 | dedup 4단계, slug 충돌, healthcheck mock 5종, llm.ts spawn mock, editor revision, images fallback, wordpress retry |
| `package.json` | vitest 의존 추가 | `vitest@^1`, `@vitest/coverage-v8` |
| `.github/workflows/test.yml` | CI 자동 테스트 (외부 API 0) | on push/PR → vitest run --coverage |

### PR6 — Workflow (외부 영향 ON)

| 파일 | 책임 |
|---|---|
| `scripts/auto-publish.ts` | 오케스트레이터. 헬스체크 → trend → 9개 슬롯 격리 처리 → batch slug 검사 → DB insert → 요약 출력 + dispatch |
| `.github/workflows/auto-publish.yml` | `schedule: '17 1 * * *'` + `workflow_dispatch` (niche choice). `runs-on: self-hosted`. 마지막 step에서 Playbook dispatch |
| `docs/runner-setup.md` | self-hosted runner 셋업 1회 가이드 (brew → token → LaunchAgent + macOS caffeinate 설정) |
| (manual) | smoke test — 사용자 컨펌 후 `gh workflow run` 1회 |

### 책임 격리 원칙

- `healthcheck.ts`: 외부 API 4xx/5xx 감지만. 토큰 갱신 책임 없음 (사람 수동)
- `llm.ts`: `claude` CLI 호출만. 프롬프트 조립은 caller 책임
- `dedup.ts`: 의사결정만. DB write 안 함 (caller가 결정)
- `slug.ts`: 순수 함수 (DB 조회 없음. 이미 만들어진 list만 받음)

### 의존성 흐름

```
auto-publish.ts (PR6)
    ↓ uses
healthcheck.ts → trends.ts → dedup.ts → slug.ts
                    ↓
                  llm.ts ← prompts/agents/*.md
                    ↓
                editor.ts (revision feedback loop)
                    ↓
                images.ts
                    ↓
              wordpress.ts / blogger.ts
                    ↓
                drizzle (DB insert)
```

각 lib는 단방향 의존. 순환 없음. 단위 테스트 격리 쉬움.

---

## 6. Data Flow

### 한 cron 사이클 전체 시퀀스

```
[01:17 trigger: schedule | workflow_dispatch | repository_dispatch]
                                │
                                ▼
            [healthcheck.runAll()]  ⏱ ~5초
                ├─ Pixabay GET  /api?key=
                ├─ Pexels   GET  /v1/search?query=test (UA: blog-autopilot/1.0)
                ├─ WP-WS    GET  /sites/{id}/posts?number=1
                ├─ WP-TS    GET  /sites/{id}/posts?number=1
                └─ Blogger  GET  /blogs/{id}/posts?maxResults=1
                                │
                ┌───────────────┴───────────────┐
                │                               │
            ALL PASS                       ANY FAIL
                │                               │
                ▼                               ▼
    [trends.pickQueue per niche]     gh api dispatches issue
       WS: [k1..k5]                  ("토큰 만료: WP-WS")
       TS: [k1..k5]                       │
       AS: [k1..k5]                  exit 0 (cron 정상 종료, but skip)
                │
                ▼
    [9 slots = 3 niche × 3 slot, sequential]

    For each (niche, slotIdx in 1..3):
    │
    │   keyword = trends_queue[niche].next()
    │
    │   ┌─ dedup.checkAndResolve(niche, keyword, evergreen)
    │   │     └─ result: pass | skip | follow_up | slug_variant
    │   │
    │   │  if skip: continue (try next keyword in queue)
    │   │  if queue exhausted: log + dispatch issue + continue next slot
    │   │
    │   ▼
    │   ┌─ writer loop (revision max 2):
    │   │     attempt 1: llm.callClaude(content-writer.md, keyword) → JSON
    │   │     editor.review(draft) → pass | revision_needed
    │   │     if revision_needed:
    │   │         attempt 2: llm.callClaude(writer.md, keyword + editor feedback)
    │   │         editor.review(draft2) → pass | revision_needed
    │   │     if all 2 fail: throw 'editor_reject_x2'
    │   │
    │   ▼
    │   ┌─ images.fetchForSlots(draft.image_slots[])
    │   │     for each slot: Pexels → fail → Pixabay → fail → placeholder
    │   │     return draft with images filled in
    │   │
    │   ▼
    │   ┌─ slot_time = pickRandomSlot([09,11,13,15,17,19], used_for_niche_today)
    │   │     used_for_niche_today.add(slot_time)
    │   │
    │   ▼
    │   ┌─ wordpress/blogger.publishScheduled(blogId, post, slot_time)
    │   │     [retry 3 with exp backoff: 1s, 2s, 4s]
    │   │     returns {externalId, externalUrl}
    │   │
    │   ▼
    │   ┌─ DB INSERT published_posts (status='published', scheduled_slot, externalId, ...)
    │   │
    │   catch err:
    │      DB INSERT (status='failed', failure_reason, draft_json)
    │      gh api dispatches → Playbook → Issue
    │      continue (next slot)
    │
    └─ end loop
                │
                ▼
    [batch summary 출력]
       success: N / failed: M / skipped: K
       console + ~/logs/blog-autopilot.log
       exit 0 (workflow 성공으로 표시)
                │
                ▼
    [GitHub Actions UI: ✅ green checkmark + logs 영구 보관]
    [폰 GitHub 앱 push: workflow 완료 알림 — GitHub native]

    ※ Slug 충돌 처리: 별도 batch 단계 없음. 각 슬롯 처리 시 in-memory `usedSlugsByNiche: Map<niche, Set<slug>>` 유지. 
       writer output의 slug가 이미 set에 있으면 즉시 suffix 변형 (-2, -3 ...) 후 set 추가. 
       그 후 publisher → DB INSERT. UNIQUE constraint와 사전 회피로 이중 방어.

    ※ 매 사이클 dispatch 알림은 PR5/PR6 범위 밖 (Phase 2 Playbook 통합 시 추가). 
       PR5/PR6에서는 GitHub Actions UI workflow 결과 (✅/❌)와 폐기 시 Issue만으로 충분.
```

### 주요 데이터 변환 (in → out)

| Step | In | Out (JSON shape 핵심) |
|---|---|---|
| `trends.pickQueue` | `niche` | `[{keyword, category, content_type, search_volume_trend, priority_score, evergreen: boolean, image_keywords[]}, ...×5]` (evergreen 판단은 Trend Hunter prompt 책임) |
| `dedup.checkAndResolve` | `niche, keyword, evergreen` | `{action: 'pass'\|'skip'\|'follow_up'\|'slug_variant', reason, recent_post?, suggested_content_type?}` |
| `llm.callClaude(writer)` | `prompts/agents/content-writer.md` + keyword JSON | `{title, slug, meta_description, content_html, image_slots[], chart_slots[], faq_schema[], word_count}` |
| `editor.review` | writer output JSON | `{verdict: 'pass'\|'revision_needed', score: 0-100, reason?: string, feedback?: string}` (feedback는 자유 텍스트 Korean. Writer attempt 2 prompt에 그대로 append) |
| `images.fetchForSlots` | `image_slots[]` (search keywords) | `[{slot_id, image_url, photographer, source: 'pexels'\|'pixabay'\|'placeholder', alt_text}]` |
| `wordpress.publishScheduled` | post + `scheduledFor: ISO 8601 UTC string` (호출 시 `'09:00' KST` → 해당 날짜 ISO UTC로 변환) | `{externalId, externalUrl, scheduledAt}` |

### 격리 보장 원칙

- **슬롯 간 격리**: 한 슬롯 throw → catch → DB insert (failed) → continue. 다른 슬롯에 영향 0
- **niche 간 격리**: queue, dedup, slot_time 모두 niche별 독립 상태
- **DB 트랜잭션**: 각 슬롯 INSERT는 독립 트랜잭션. 부분 실패 가능 (의도)
- **claude CLI 격리**: 각 호출 = 새 process. 콘텍스트 leak 0

---

## 7. Error Handling

### 5단계 × 9개 게시물 = 45개 잠재 실패 지점 처리 매트릭스

| 단계 | Fail 모드 | 처리 |
|---|---|---|
| **0. Healthcheck** | 5종 중 하나 401/timeout/5xx | 즉시 dispatch issue + cron skip (9개 진입 안 함) |
| **1. Trend** | API 0건, rate limit | niches yaml backup 키워드 fallback. 없으면 skip + dispatch |
| **2. Dedup** | 큐 모두 skip | dispatch issue, 다음 슬롯 |
| **3. Writer** | JSON parse fail, claude CLI hang/timeout | retry 1회 → 그래도 fail 시 그 슬롯 폐기 |
| **4. Editor** | revision_needed | Writer 재호출 with editor feedback (최대 2회). 3번째도 fail → 폐기 |
| **5. Image** | Pexels 0 → Pixabay 0 → 모두 fail | placeholder 발행 강행 |
| **6. Publisher** | WP 4xx/5xx, OAuth 만료, dedup 충돌 | 재시도 3회 (exp backoff 1s/2s/4s). 토큰 만료 시 dispatch alert. dedup이면 skip |

### 알림 정책 (시그널/노이즈 trade-off)

- **GitHub Issue 생성 시점**: 최종 폐기 시에만 (자동 재시도 중 알림 안 옴)
- **자동 재시도/큐잉**: **없음** (트렌드 키워드 시간 민감성 — 다음 cron까지 기다리면 신선도 손실)
- **운영 진행 상황**: 매 cron 끝 콘솔 + `~/logs/blog-autopilot.log` 한 줄 요약 (`success: N, failed: M, skipped: K`)

### 폐기 Issue 포맷 예시

```
Title: [blog-autopilot] 게시물 폐기: WS / "키워드명"
Body:
- niche: WS
- keyword: 봄나들이 명소
- 폐기 단계: editor (revision 2회 모두 reject)
- 사유: word_count<1200
- draft_json: <전문>
- 권장 조치: 키워드 폐기 / 수동 트리거 / 페르소나 검토
```

---

## 8. Testing

### 도구 + 구조

```
package.json devDeps: vitest@^1, @vitest/coverage-v8
src/lib/__tests__/*.test.ts      ← 단위 (모듈 격리)
src/scripts/__tests__/*.test.ts  ← 통합 (auto-publish 한 슬롯 end-to-end)
vitest.config.ts: pool='threads', coverage threshold lib/ 80%
```

### 단위 테스트 매트릭스

| 모듈 | 핵심 케이스 | Mock 대상 |
|---|---|---|
| **dedup.ts** | L1 slug 영구 / L2 24h strict / L3 7d follow_up (급상승+score≥80) / L3 7d skip (일반) / L4 evergreen 90d strict | in-memory SQLite (`better-sqlite3 ':memory:'`) |
| **slug.ts** | 한글→영문 변환 / batch 9개 중 같은 slug 2개 → `-2` suffix / 특수문자·이모지 정화 | 순수 함수 (mock 0) |
| **healthcheck.ts** | 5종 200 pass / 1개 401 fail / 1개 timeout fail / 1개 5xx fail / report에 fail 서비스명 노출 | `vi.mock(global.fetch)` |
| **llm.ts** | exec 정상 stdout → string / exit code 1 → throw / 60초 timeout → throw / expectJson + invalid JSON → throw | `vi.mock('node:child_process')` |
| **editor.ts** | word_count ≥ 1200 → pass / < 1200 → revision_needed + feedback / image_slots < 2 → revision / llm fail → throw | `vi.mock('./llm')` |
| **images.ts** | Pexels 200 → return / Pexels 0 hits → Pixabay fallback / Pixabay 0 → placeholder / Pexels 1010 Cloudflare → Pixabay / UA 헤더 검증 | `vi.mock(global.fetch)` |
| **wordpress/blogger.ts** | publishScheduled 정상 / 401 → throw / 5xx → retry 3 exp backoff / scheduled_for ISO 정확 전달 | `vi.mock(global.fetch)` |
| **trends.ts** | 큐 5~6 정렬 / evergreen 플래그 출력 / 카테고리 분산 30% 룰 | trend API mock |

### 통합 테스트 시나리오 (auto-publish.ts)

| 시나리오 | 검증 |
|---|---|
| **golden path**: 1 niche 1 slot, 모든 lib mock, end-to-end | DB에 `status='published'` insert + scheduled_for 정확 + dispatch 호출 0회 |
| **editor reject 1회 + 2회차 pass** | revision loop 작동, 최종 published, llm 2회 호출 검증 |
| **editor reject 2회 → 폐기** | DB `status='failed'`, dispatch 1회 (Issue), 다음 슬롯 영향 0 |
| **dedup skip 후 다음 keyword 진행** | trends.queue.next() 2회 호출, 최종 다른 keyword로 published |
| **healthcheck fail 시나리오** | 9 슬롯 진입 안 함, 즉시 dispatch 호출 + exit 0 |
| **모든 이미지 fail → placeholder** | placeholder image_url로 published, warning log |
| **batch slug 충돌**: 같은 niche 슬롯 2개가 같은 slug 생성 | 슬롯 2의 slug에 `-2` suffix, 둘 다 published |

### CI 자동 실행

`.github/workflows/test.yml` (PR5에 포함):

```yaml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest    # GitHub-hosted (테스트는 외부 API mock, 비용 0)
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm vitest run --coverage
```

→ PR 만들면 자동 테스트, 실패 시 merge 차단.

### Smoke test 절차 (PR6 land 직전, 사용자 컨펌)

```bash
# 1. self-hosted runner 등록 완료 확인
gh api repos/kkyu92/blog-autopilot/actions/runners | jq '.runners[].status'
# → "online"

# 2. 헬스체크만 단독 실행
gh workflow run auto-publish.yml -f mode=healthcheck-only
# → workflow ✅ 확인

# 3. 1건 smoke (사용자 컨펌 후)
gh workflow run auto-publish.yml -f niche=WS -f slot_count=1
# → WordPress WS 사이트에서 글 게재 확인
# → DB published_posts에 row 1개 확인
# → Playbook Issue 알림 (없으면 정상)

# 4. 다음 cron 사이클 자연 발화 대기 (다음날 01:17 KST)
```

### 테스트 통과 기준 (PR5 land 조건)

- 단위 테스트: lib/ 80% coverage
- 통합 테스트: 7개 시나리오 모두 pass
- CI workflow green
- 외부 API 호출 0건 (모두 mock)

---

## 9. Out of Scope (Phase 2 backlog)

PR5/PR6에 포함하지 않음. 운영 데이터 누적 후 패턴 보고 자동화 추가.

| 항목 | 미루는 사유 |
|---|---|
| AdSense 수익 모니터링 | WordPress/Blogger 어드민 native 활용. 자동화는 Phase 2 |
| DB 백업 자동화 | gitignored .db만 별도 cron. PR5/PR6 범위 밖 |
| Emergency unpublish 자동화 | 사람 수동 (WordPress/Blogger UI 직접) |
| 페르소나 A/B testing | over-engineering. 운영 데이터로 페르소나 효과 평가 후 도입 |
| WordPress 401 토큰 자동 갱신 | 헬스체크 통합 필요. PR5는 감지만, 갱신은 사람 수동 |
| 같은 키워드 N회 reject 시 블랙리스트 자동 추가 | 운영 패턴 보고 결정 |
| publisher 5xx 같은 cron 내 30분 후 단발 재시도 | 신선도 살아있지만 코드 복잡도. Phase 2 |
| repository_dispatch (Playbook hub 통합) | PLAN_v2 §3.6. PR5/PR6 범위 밖 |

---

## 10. Open Questions

없음. brainstorming 단계에서 모든 결정 락인.

---

## 11. Decision Trail (왜 이렇게 결정됐는지)

| 결정 | 후보 | 선택 사유 |
|---|---|---|
| 인프라 self-hosted runner | 로컬 cron / GitHub-hosted runner / 하이브리드 webhook / self-hosted | 메모리 제약 + PLAN_v2 폰 트리거 비전 동시 통과하는 유일 옵션. 비용 0 |
| LLM `claude` CLI spawn | Anthropic SDK / paperclip 인프라 이식 / `claude` CLI shell out | 메모리 ANTHROPIC_API_KEY 금지 + Claude Code Max 활용. paperclip 인프라 이식은 over-engineering |
| Dedup 4단계 하이브리드 | 단일 7일 / 30일 / 4단계 (slug + 24h + 7d + evergreen 90d) | hot topic 후속 글 + cluster cannibalization 방지 절충. evergreen은 PLAN_v2 흡수 |
| 발행 슬롯 API native | 즉시 발행 / 자체 picker cron / API native scheduled_for | 코드 단순화. paperclip 22일 검증된 6슬롯 패턴 부활 |
| 알림 최종 폐기 시에만 | 매 실패마다 / 폐기 시에만 / 하이브리드 (Issue + 코멘트) | "GitHub Issue = 사람 개입 필요" 단일 의미 유지. 노이즈 0 |
| 자동 재시도/큐잉 없음 | 자동 큐잉 retry 2회 / 영구 폐기 / 다음날 1회 | 트렌드 키워드 시간 민감성 (paperclip Trend Hunter `keyword_queue_{YYYY-MM-DD}.json`이 day-level idempotency 명시) |
| PR 2개 분할 | 단일 / 2개 / 3개 | PR5 외부 영향 0 단독 테스트 가능 + PR6 smoke 분리. PR1-4 단일 브랜치 패턴과 일관성 유지 |
| cron 01:17 | 01:00 정각 / 01:17 prime | 외부 API(WP/Pexels) 정각 트래픽 폭주 회피. 1시간대는 일반 부담 적지만 best practice |

---

## 12. References

- `~/.gstack/projects/kyusikkim/PLAN_v2_autopilot_workers.md` (마스터 플랜, 2026-04-25 APPROVED)
- `~/.gstack/projects/kyusikkim/blog-autopilot-staging/db-schema.md` (PR4 schema 출처)
- `~/projects/company-package/agents/*/AGENTS.md` (paperclip 페르소나 5개, PR5 복사 대상)
- `~/projects/company-package/.paperclip.yaml` (paperclip claude_local 패턴 정찰 출처)
- 메모리 `feedback_api_key_usage.md`: ANTHROPIC_API_KEY 에이전트 토론 전용
- 메모리 `feedback_claude_code_subscription.md`: Claude Code Max 구독 우선
- 메모리 `feedback_first_principles_simplification.md`: DB·GUI·분석 레이어 추가 전 위임·CLI 먼저 검토
- 체크포인트 `~/.gstack/projects/kyusikkim/checkpoints/20260425-190008-blog-autopilot-phase1-pr1-4-llm-pattern-pending.md` (PR4까지 완료 상태)
