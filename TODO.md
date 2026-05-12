# Content Autopilot — TODO

> 마지막 점검: 2026-05-12 (자동 점검)
> 빌드: **FAIL** (Next.js app/ 미존재, 미변동) | 테스트: **363 PASS / 0 FAIL** (미변동) | Lint: **5 errors, 2 warnings** (미변동)
>
> **5/12 KST 08:30 — runner sleep stuck 복구 (launchctl kickstart)**:
> - 5/10 cron failure RC = broker.actions.githubusercontent.com timeout (6:28/10:17/13:53 UTC) — runner heartbeat 통신 불안정. publish 0건.
> - 5/11 cron queued stuck = macOS sleep 후 process alive + heartbeat dead. 5/12 08:30 kickstart 로 즉시 pickup.
> - 박제: `feedback_runner_sleep_recovery.md` (sleep + broker timeout 양 family 동일 처방 = launchctl kickstart).
> - 진행 중: 5/11 cron (9 슬롯 = 5/12 KST 09/11/13) + 추가 dispatch slot_count=3 (5/12 KST 15/17/19) = niche당 6 = 18 backfill.
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

---

## 신규 발견 이슈 (2026-04-27)

### 빌드 오류 (미해결)
- [ ] **`pnpm build` FAIL** — Next.js가 `pages`/`app` 디렉토리를 찾지 못함. GUI 제거 후 Next.js 의존성 전체 정리 필요 (next, react, react-dom, shadcn 등 제거 또는 `package.json` build 스크립트 교체).

### Lint 에러 (2026-04-27 발견, 일부 수정)
- [x] `src/lib/__tests__/healthcheck.test.ts` — `any` 타입 **16개** 해소 완료 (2026-05-05 확인)
- [ ] `src/lib/__tests__/llm.test.ts` — `any` 타입 3개 (line 114, 122, 174) → 구체 타입 명시
- [ ] `src/lib/__tests__/trends.test.ts` — `any` 타입 2개 (line 29, 220) → 구체 타입 명시
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

## 다음 단계 (우선순위순)

### 즉시 (테스트 회귀 수정)
- [x] `auto-publish.test.ts` vi.mock llm에 `getClaudeCallStats` 추가 — 6개 FAIL → 0 FAIL 복구 완료

### 즉시 (빌드/린트 복구)
- [ ] Next.js 의존성 제거 — `next build` → CLI 전용 `package.json`으로 전환 (build 스크립트 삭제 또는 `tsc --noEmit`으로 교체)
- [ ] `eslint-config-next` → `@typescript-eslint/eslint-plugin` 등 범용 TS lint config으로 교체 (next 전용 규칙 제거)
- [ ] 테스트 파일 `any` 타입 명시화 (lint 5 errors 잔존) — `llm.test.ts` 3개, `trends.test.ts` 2개
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
