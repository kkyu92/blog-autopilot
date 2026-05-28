# Content Autopilot — TODO

> 마지막 점검: 2026-05-28 (평일 아침 자동 점검)
> 빌드: **FAIL** (Next.js app/ 미존재, 미변동) | 테스트: **368 PASS / 0 FAIL** (전회 동일) | Lint: **0 errors, 1 warning** (pages dir 경고만)
>
> **5/26 주요 변경사항** (5/24 이후 cycles 6-7):
> - `1b2bc06` fix(publish): attempt 2 schema fail 시 attempt 1 soft-pass salvage (5/25 TS 가고시마 RC)
> - `1991f16` policy: cycle 6 retro — worker-incident-triage SUCCESS — 이슈 13건 → 0건
> - `485634d` fix(ci): issue-agent OAuth→ANTHROPIC_API_KEY 전환
> - `a887598` fix(editor): inferStatus array 응답 drift → revision_needed fallback (5/26 cron 1 fail RC)
> - `91ae837` fix(ci): issue-agent self-hosted + claude CLI 직접 실행 (Max 구독 활용)
> - **5/26 품질 spot-check**: 최근 15건 quality_score 85-93 (avg ~89). failure 0건. 총 누적 **370건**.
> - **5/25 cron 1 fail → 수동 backfill 완료**: AS 청약 가점 계산 editor array drift → fix + dispatch 재발행.
> - **다음 cron 검증 대기**: 5/27 KST 02:57 자연 cron — array drift fix 첫 운영 검증 예정.
>
> **5/24 주요 변경사항** (5/21 이후 develop-cycle 5회):
> - `47023e3` cycle 1 fix-incident: trends Test 12 timeout fix → **365/365 PASS** (7 FAIL 전체 해소)
> - `dbeb01a` cycle 2 explore-idea: AEO (Answer Engine Optimization) 지침 통합 (issue #98)
> - `006b846` cycle 3 review-code: 미사용 변수 3건 + coverage eslint 제거 → **lint 0 warnings 달성**
> - `111e844` cycle 4 content-curate: editor quality_score DB 저장 (out.review.score INSERT 누락 수정)
> - `9709cc8` cycle 5 review-code: auto-publish.ts 모듈 분리 — slot-utils + html-utils 추출 (-110줄)
>
> **5/21 주요 변경사항** (5/19 이후 8개 커밋):
> - `dd53edb` feat(adsense): E-E-A-T 강화 — author box 자동 주입 + 공식 출처 링크 필수화 → **editor.test.ts 5 FAIL 유발**
> - `d4418db` feat(adsense): JSON-LD Article+FAQPage schema 주입 → **auto-publish.test.ts Scenario 9 FAIL 유발**
> - `2c921d4` fix(llm): jsonrepair로 content_html 이중이스케이프 수정
> - `c052d46` feat(publish): 일 발행 9→12 (4 slot)
> - `5b10a35` feat(molit): 국토교통부 실거래가 API 연동 — AS 니치 실데이터 주입
> - `9bb3137` feat(patch-molit-data): AS 기존 게시물 14건 실거래가 섹션 일괄 패치 스크립트
>
> **5/19 주요 변경사항**:
> - `2788473` feat(daily-check) + fix(trends): pickQueue fallback retry + KST 08:17 cron 자동화 정리 커밋 (2026-05-19 KST 07:19)
>
> **5/13~5/18 주요 변경사항**:
> - `a3b8e05` fix(auto-publish): pickAllQueues count = slotCount+3 buffer (AS queue exhausted 재발 방지)
> - `0362dbe` feat(llm): BLOG_LLM_MODEL_OVERRIDE env var — sonnet 한도 도달 시 opus 폴백
> - `bdca69f` fix(auto-publish): writer 15min SIGTERM 시 1회 자동 retry (5/17 8/9 건 대응)
> - `7f0787f` fix(trends): pickQueue fallback retry — LLM count 미달 반환 시 부족분 추가 호출
> - `2db670b` feat(daily-check): KST 08:17 cron 자동화 — 9/9 검증 + 부족 자동 보충 dispatch
>
> **5/12 KST 08:30 — runner sleep stuck 복구 (launchctl kickstart)**:
> - 5/10 cron failure RC = broker.actions.githubusercontent.com timeout (6:28/10:17/13:53 UTC) — runner heartbeat 통신 불안정. publish 0건.
> - 5/11 cron queued stuck = macOS sleep 후 process alive + heartbeat dead. 5/12 08:30 kickstart 로 즉시 pickup.
> - 박제: `feedback_runner_sleep_recovery.md`.
>
> **5/12 KST 15~16 — HANG family RC 정정 + visibility log + 18 backfill 달성**:
> - HANG family 3회 박제 RC 정정: 진짜 hang 1회 (writer attempt 1 retry JSON drift), 나머지 2회 = premature cancel + slow LLM 정상.
> - callClaude visibility 로그 (commit `18801c6`) — 60초 주기 `[llm] still waiting` 출력. premature cancel 방지.
> - JSON drift 패턴 직접 캡처: "부킹닷컴 해킹 피해 대처법 2026" 키워드. HTML 내 unescaped `"` → JSON.parse fail → retry hang → SIGTERM 15min 자연 처리.
> - `scripts/blogger/publish-from-draft.ts` (드래프트 JSON 직접 발행 도구) 추가: writer-stage fail 시 raw dump 수동 fix + publish.
> - 누적 발행 **218** (AS 54 / HS 81 / TS 83). 5/12 = AS 6 / HS 6 / TS 6 = **18/18 목표 달성**.
>
> **박제 갱신**:
> - `feedback_auto_publish_slot_transition_hang.md` 완전 재작성: HANG family → premature cancel family + slow LLM.
>
> **5/12 GSC 96+h 미해소**:
> - AS homepage REDIRECT_ERROR lastCrawl 2026-05-08T01:33Z 그대로. mobile theme 토글 fix 효과 GSC 측 미반영. 자연 영역 (96+h) 초과 = 사용자 GSC URL Inspection 색인 재요청 + 추가 24~48h 대기.

---

## 완료 항목

### MVP + 인프라
- [x] Phase 1~5: Next.js 풀스택 앱 (에디터, CRUD, OAuth, 대시보드)
- [x] CI/CD (GitHub Actions) + Issue Agent
- [x] Paperclip 설치 + PM2 상시 가동
- [x] Tailscale 3곳 연결 (집/회사/폰)
- [x] Paperclip 에이전트 5개 등록 (CEO/Researcher/Writer/QA/Publisher)
- [x] 에이전트 한국어 응답 설정
- [x] GUI 제거 — CLI 전환 (PR1: src/app, components, hooks 삭제, fly.toml 제거)

### 플랫폼 연동
- [x] Google Blogger OAuth 연결 + 발행 테스트 성공
- [x] WordPress.com OAuth 연결 + 발행 테스트 성공
- [x] 네이버/Medium/Substack 완전 제거 (API 종료)

### 코드 품질
- [x] Writer SDK 호출 제거 (직접 글 작성, Max 구독)
- [x] 삭제 시 외부 플랫폼 연동 삭제 + 확인 모달
- [x] 콘텐츠 목록에 플랫폼 뱃지 + 외부 링크 표시
- [x] `src/lib/llm.ts` require() → ES import 교체 완료 (3 errors 제거)
- [x] `src/lib/llm.ts:25` 미사용 변수 `close` 제거 완료 (1 warning 제거)

### 신규 기능 (2026-04-27)
- [x] feat(healthcheck): pingWithRetry — transient 실패 자동 재시도 (3회, exponential backoff) (#29)
- [x] feat(as): REAL_ESTATE_KEYWORDS 13개 보강 (정책브리핑 매칭 확대) (#28)
- [x] feat(as): 5번째 source — google-news-market (시장/세금/정비사업 보완) (#30)
- [x] docs: 발전 로드맵 ROADMAP.md 추가

### 안정성 패치 + AdSense 준비 (2026-04-29)
- [x] fix(reliability): F1' 5종 sub-fix — spawn retry(F1'-c), timeout, orphan-kill, inferStatus fallback(F1'-d)
- [x] feat: Phase 4a D4 — policy/feedback/memory prefix dispatch to playbook (#41)
- [x] docs(adsense): Blogger Pages 3종 HTML 템플릿 완성 (docs/blogger/about.html, privacy.html, contact.html)
- [x] docs(adsense): PUBLISH_CHECKLIST.md — Blogger 게시 절차 + AdSense 신청 기준 가이드 작성

### 안정성 패치 + Blogger 도구 (2026-04-30)
- [x] fix(reliability): F2-A writer schema retry + F2-B timeout 600s→900s — 4/30 cron 3 fail 분석 대응
- [x] fix(editor): inferStatus final_meta fallback — 4/29 1 fail 회수
- [x] feat(blogger-pages): scripts/blogger/update-pages.mjs — Pages API 직접 갱신 도구 추가
- [x] feat(blogger-posts): scripts/blogger/update-posts.mjs — AS spot-check P0 fix (환각 도메인 제거, 면책 고지 추가)
- [x] **테스트 회귀 수정**: auto-publish.test.ts vi.mock에 `getClaudeCallStats` 추가 — 6 FAIL → 0 FAIL (350 PASS)

### 신뢰성 + 마이그레이션 (2026-05-01~05-05)
- [x] fix(reliability): F2-A 강화 — revision_feedback wording + JSON_RETRY_GUARD (5/1 evidence)
- [x] feat(spotcheck-5-1): WP update-posts.mjs 신규 + Blogger update-posts.mjs 5/1 P0 fix
- [x] fix(reliability): editor inferStatus — flat final_meta drift fallback (5/2 evidence)
- [x] fix(reliability): writeAndReview disclaimer auto-apply — caller가 review.modified_html 반영
- [x] feat(reliability): L1 editor fallback + L2 writer prompt — disclaimer 누락 차단 (5/3~5/4 evidence)
- [x] feat(migration): WP → Blogger cut-over 통합 변경 (5/5) — wp-to-blogger.mjs RC 완성
- [x] fix(migration): OAuth token refresh per publish + already-migrated skip — 매 발행 직전 토큰 갱신

### 안정성 패치 + 자동화 강화 (2026-05-13~05-18)
- [x] fix(auto-publish): pickAllQueues count = slotCount+3 buffer — AS queue exhausted 재발 방지 (a3b8e05)
- [x] feat(llm): BLOG_LLM_MODEL_OVERRIDE env var — sonnet 한도 도달 시 opus 폴백 지원 (0362dbe)
- [x] fix(auto-publish): writer 15min SIGTERM 1회 자동 retry — callWriterWithTimeoutRetry 내부 helper (bdca69f)
- [x] fix(trends): pickQueue fallback retry — LLM count 미달 시 부족분 추가 호출로 자동 보충 (7f0787f)
- [x] feat(daily-check): KST 08:17 cron 자동화 — 9/9 검증, 부족 시 dispatch fill, RC 분석 + 이슈 생성 (2db670b)

### AdSense + 품질 강화 + 리팩토링 (2026-05-21~05-24)
- [x] feat(adsense): E-E-A-T 강화 — author box 자동 주입 + 공식 출처 링크 필수화 (dd53edb)
- [x] feat(adsense): JSON-LD Article+FAQPage schema 주입 (d4418db)
- [x] fix(llm): jsonrepair로 content_html 이중이스케이프 수정 (2c921d4)
- [x] feat(publish): 일 발행 9→12 (4 slot) (c052d46)
- [x] feat(molit): 국토교통부 실거래가 API 연동 — AS 니치 실데이터 주입 (5b10a35)
- [x] fix-incident: trends Test 12 timeout fix — 365/365 PASS 달성 (47023e3, cycle 1)
- [x] feat(prompts): AEO 지침 통합 — issue #98 (dbeb01a, cycle 2)
- [x] chore(lint): 미사용 변수 3건 + coverage eslint 제거 — lint 0 warnings 달성 (006b846, cycle 3)
- [x] fix(publish): editor quality_score DB 저장 — out.review.score INSERT 누락 수정 (111e844, cycle 4)
- [x] refactor(publish): auto-publish.ts 모듈 분리 — slot-utils + html-utils 추출 (-110줄) (9709cc8, cycle 5)

---

## 신규 발견 이슈 (2026-04-27)

### 빌드 오류 (미해결)
- [ ] **`pnpm build` FAIL** — Next.js가 `pages`/`app` 디렉토리를 찾지 못함. GUI 제거 후 Next.js 의존성 전체 정리 필요 (next, react, react-dom, shadcn 등 제거 또는 `package.json` build 스크립트 교체).

### Lint 에러 (2026-04-27 발견, 일부 수정)
- [x] `src/lib/__tests__/healthcheck.test.ts` — `any` 타입 **16개** 해소 완료 (2026-05-05 확인)
- [ ] `src/lib/__tests__/llm.test.ts` — `any` 타입 3개 (line 114, 122, 174) → 구체 타입 명시
- [ ] `src/lib/__tests__/trends.test.ts` — `any` 타입 5개 (line 29×4, line 220×1) → 구체 타입 명시 (35b0690 에서 NO_SIGNALS에 realestate/wellness/travel 추가로 3개 증가)
- [x] `src/lib/blogger.ts:295` — 미사용 변수 `niche` (warning) — b20ae93 `normalizeLabels(niche, ...)` 호출 추가로 해소 (2026-05-10 확인)
- [ ] `eslint-config-next` — "Pages directory cannot be found" 경고 발생 (CLI 전환 후 next 전용 lint 규칙 잔존)

---

## 신규 발견 이슈 (2026-04-29)

### 테스트 회귀 (즉시 수정 필요)
- [x] **`auto-publish.test.ts` Scenario 1~4, 6, 7 총 6개 FAIL** — `getClaudeCallStats` vi.mock 추가로 수정 완료 (2026-04-30 확인: 350 PASS)

### Lint 신규 경고 (2026-04-29)
- [ ] `scripts/mid-review/fetch.mjs:80` — `toIsoDate` 함수 정의 후 미사용 (`@typescript-eslint/no-unused-vars` warning) — 함수 제거 또는 실제 사용 코드 추가

---

## 신규 발견 이슈 (2026-05-05)

- [ ] `scripts/migration/wp-to-blogger.mjs:180` — `accessToken` 초기화 후 미사용 (lint warning 신규) — per-publish freshToken으로 교체됐으므로 초기 선언 제거
- [ ] `auto-publish.ts:666` — TODO(post-PR6): uniqueIndex(slug, platform) 충돌 처리 미구현
- [ ] `auto-publish.ts:751` — TODO(post-PR6): N consecutive 백업 fail 시 queue_exhausted dispatchIssue 미구현

---

## 신규 발견 이슈 (2026-05-06)

- [ ] `scripts/migration/relabel-as.mjs` — AS 라벨 통합(21→6) 스크립트 추가됨 (f4c0ebc). dry-run 확인 후 `--apply` 실행 필요 (Blogger API + DB 동시 갱신)
- [ ] `docs/blogger/CONSOLE_SETUP_GUIDE.md` — Search Console 설정 가이드 추가됨. 사용자가 Google Search Console에서 검색설명 ON 여부 확인 필요

---

## 신규 발견 이슈 (2026-05-10)

신규 린트/빌드 이슈 없음. 주요 변경 내역:
- `c1c0d50` fix(reliability): editor inferStatus chunk drift fallback (drift family 8번째)
- `b20ae93` feat(labels): AS publisher normalize — `blogger.ts` niche 경고 사이드 이펙트 해소
- `ba5cbd0` feat(labels): substring 매칭 추가 — LLM 자유 keyword 통합 6 자동 흡수
- 테스트 파일 24개 / 363개 통과 (지난 점검 대비 +24개)

---

## 신규 발견 이슈 (2026-05-12 야간)

- [ ] `src/lib/__tests__/trends.test.ts:29` — `35b0690` 커밋 사이드 이펙트: NO_SIGNALS에 realestate/wellness/travel `any[]` 3개 추가 → lint errors 5→8. `as SignalMap` 또는 구체 타입으로 교체 필요.

---

## 신규 발견 이슈 (2026-05-18)

신규 lint/빌드 이슈 없음. 주요 변경 내역:
- `2db670b` feat(daily-check): KST 08:17 cron 자동화 스크립트 + 워크플로우 신규 추가
- `7f0787f` fix(trends): pickQueue fallback retry (테스트 363/363 통과 확인)
- `bdca69f` fix(auto-publish): writer timeout 자동 retry
- `0362dbe` feat(llm): BLOG_LLM_MODEL_OVERRIDE env var

잠재 위험:
- [ ] `.github/workflows/*.yml` — 모든 워크플로우에서 `pnpm/action-setup version: 9` 지정, 하지만 실제 사용 버전은 v10.33.0. 현재 self-hosted runner에서 정상 동작 중이나, lockfile 포맷 불일치로 GitHub-hosted runner 이용 시 문제 가능. `packageManager` 필드 추가 또는 `version: 10` 으로 통일 권장.
- [ ] `STATUS.md` — 내용이 GUI 시절 기준으로 outdated (테스트 13개 표기, 실제 363개). 혼선 방지를 위해 CLI 전환 이후 현황으로 갱신 필요.

---

## 신규 발견 이슈 (2026-05-19)

신규 lint/빌드/테스트 이슈 없음. 상태 전회와 동일. 주요 확인 사항:
- `2788473` (May 19 KST 07:19) — daily-check + trends 관련 커밋 정리. 코드 변경 없음(빈 커밋 형태).
- STATUS.md 여전히 outdated (테스트 13개 표기, 실제 363개) — 5/18에 이어 미수정.
- 모든 워크플로우 `pnpm/action-setup version: 9` vs 실제 v10.33.0 불일치 — 5/18에 이어 미수정.

---

## 신규 발견 이슈 (2026-05-21)

### 테스트 회귀 (즉시 수정 필요) — 5/19 대비 0→7 FAIL

- [x] **`editor.test.ts` 5 FAIL** — cycle 1 fix-incident에서 해소 (47023e3). 365/365 PASS 달성.
  - `factcheck disclaimer_added=true → disclaimer_inserted=true + modified_html 반환 (input 불변)`
  - `factcheck disclaimer issue + "⚠️ 면책 고지" 있음 → fallback skip`
  - `factcheck disclaimer issue + "⚖️ 면책고지" 있음 → fallback skip`
  - `factcheck disclaimer issue + "※ 면책 고지" 있음 → fallback skip`
  - `factcheck needs_revision + source issue만 → fallback inject 안 함`
- [x] **`auto-publish.test.ts` Scenario 9 FAIL** — cycle 1 fix-incident에서 해소 (47023e3).
- [x] **`trends.test.ts` `signals.daily_trends injection` FAIL** — cycle 1 fix-incident에서 해소 (47023e3). timeout 조정 완료.

### Lint 신규 경고 (2026-05-21)

- [x] `scripts/patch-author-box.mjs:72` — `getAccessToken` 함수 미사용 warning — cycle 3 review-code에서 해소 (006b846, lint 0 warnings 달성)

---

## 신규 발견 이슈 (2026-05-28 아침 자동 점검)

신규 lint/빌드/테스트 이슈 없음. 상태 전회(2026-05-27)와 동일:
- 테스트 368/368 PASS — 0 FAIL.
- Lint 0 errors, 1 warning — `eslint-config-next` pages dir 경고만 잔존.
- Build FAIL — Next.js app/ 미존재 (CLI 전환 후 구조적 문제, 실질 영향 없음).
- pnpm install 정상 (793 packages, lockfile up to date).

잠재 항목 (신규):
- [ ] `pnpm` 업데이트 가능: 현재 v10.33.0 → v11.4.0 — 안정화 후 업그레이드 검토.
- [ ] `STATUS.md` — 여전히 GUI 시절 기준 (테스트 13개 표기, 실제 368개). 5주째 미수정.
- [ ] `.github/workflows/*.yml` — `pnpm/action-setup version: 9` vs 실제 v10.33.0 불일치. self-hosted에선 정상이나 GitHub-hosted 사용 시 잠재 위험.

---

## 신규 발견 이슈 (2026-05-27 아침 자동 점검)

신규 lint/빌드/테스트 이슈 없음. 상태 전회(2026-05-26)와 동일:
- 테스트 368/368 PASS — 0 FAIL.
- Lint 0 errors, 1 warning — `eslint-config-next` pages dir 경고만 잔존.
- Build FAIL — Next.js app/ 미존재 (CLI 전환 후 구조적 문제, 실질 영향 없음).
- pnpm install 정상 (793 packages, lockfile up to date).

---

## 신규 발견 이슈 (2026-05-26 아침 자동 점검)

신규 lint/빌드/테스트 이슈 없음. 상태 전회(cycle 7 spot-check)와 동일:
- 테스트 368/368 PASS — 0 FAIL.
- Lint 0 errors, 1 warning — `eslint-config-next` pages dir 경고만 잔존.
- Build FAIL — Next.js app/ 미존재 (CLI 전환 후 구조적 문제, 실질 영향 없음).
- pnpm install 정상 (793 packages, lockfile up to date).

---

## 신규 발견 이슈 (2026-05-24)

신규 lint/빌드/테스트 이슈 없음. 주요 확인 사항:
- 테스트 365/365 PASS — 5/21 7 FAIL 전체 해소 확인.
- Lint 0 errors, 1 warning — `eslint-config-next` pages dir 경고만 잔존 (Next.js 의존성 잔존으로 인한 구조적 경고, 실질 에러 없음).
- `scripts/auto-publish.ts:687,772` — TODO(post-PR6) 2건 여전히 미구현 (uniqueIndex 충돌 처리, queue_exhausted dispatchIssue). 기능 영향 없음, 안정화 후 구현 예정.
- STATUS.md 여전히 outdated (테스트 13개 표기, 실제 365개) — 3주째 미수정.
- 모든 워크플로우 `pnpm/action-setup version: 9` vs 실제 v10.33.0 불일치 — 5/18에 이어 미수정.

---

## 다음 단계 (우선순위순)

### 즉시 (테스트 회귀 수정)
- [x] `auto-publish.test.ts` vi.mock llm에 `getClaudeCallStats` 추가 — 6개 FAIL → 0 FAIL 복구 완료

### 즉시 (빌드/린트 복구)
- [ ] Next.js 의존성 제거 — `next build` → CLI 전용 `package.json`으로 전환 (build 스크립트 삭제 또는 `tsc --noEmit`으로 교체)
- [ ] `eslint-config-next` → `@typescript-eslint/eslint-plugin` 등 범용 TS lint config으로 교체 (next 전용 규칙 제거)
- [ ] 테스트 파일 `any` 타입 명시화 (lint 8 errors 잔존) — `llm.test.ts` 3개, `trends.test.ts` 5개
- [ ] `scripts/mid-review/fetch.mjs:80` `toIsoDate` 미사용 함수 제거 (lint warning)
- [ ] `scripts/migration/wp-to-blogger.mjs:180` `accessToken` 초기 선언 제거 (lint warning 신규)

### 즉시 (AdSense 승인 준비 — 사용자 수동 액션)
- [x] Blogger Pages HTML 템플릿 준비 완료 (docs/blogger/about.html, privacy.html, contact.html)
- [ ] Blogger에 소개(About) 페이지 게시 (docs/blogger/PUBLISH_CHECKLIST.md 절차 참고)
- [ ] Blogger에 개인정보처리방침(Privacy Policy) 페이지 게시
- [ ] Blogger에 문의(Contact) 페이지 게시
- [ ] 페이지 3종 메뉴 노출 (레이아웃 → 페이지 가젯)
- [ ] 글 25개 이상 축적 (AdSense 신청 기준)

### 단기 (파이프라인 완성)
- [ ] Paperclip 에이전트 전체 E2E 테스트 (Researcher → Writer → QA → Publisher)
- [ ] CI workflow에 `pnpm lint` 단계 추가
- [ ] AdSense 승인 신청

### 중기 (안정화)
- [ ] 1주일 자동 운영 모니터링
- [ ] 회사 PC로 Paperclip 서버 이전 (24/7)
- [ ] 성과 기반 키워드 전략 자동 개선

### 장기
- [ ] 다중 블로그 운영
- [ ] 추가 키워드 소스 연동
- [ ] 글 200개 달성
- [ ] WordPress.com 비즈니스 플랜 업그레이드 (AdSense)

---

_이 파일은 매 평일 오전 7시 자동 점검으로 업데이트됩니다._
