# Content Autopilot — TODO

> 마지막 점검: 2026-04-27 22:23 KST
> 빌드: **FAIL** (Next.js app/ 제거 후 의존성 정리 필요) | 테스트: 304/304 PASS (+76) | Lint: 21 errors, 1 warning

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

---

## 신규 발견 이슈 (2026-04-27)

### 빌드 오류 (미해결)
- [ ] **`pnpm build` FAIL** — Next.js가 `pages`/`app` 디렉토리를 찾지 못함. GUI 제거 후 Next.js 의존성 전체 정리 필요 (next, react, react-dom, shadcn 등 제거 또는 `package.json` build 스크립트 교체).

### Lint 에러 (21 errors, 1 warning)
- [ ] `src/lib/__tests__/healthcheck.test.ts` — `any` 타입 **16개** → 구체 타입 명시 (`@typescript-eslint/no-explicit-any`) — pingWithRetry 테스트 추가로 4개 신규 증가
- [ ] `src/lib/__tests__/llm.test.ts` — `any` 타입 3개 → 구체 타입 명시
- [ ] `src/lib/__tests__/trends.test.ts` — `any` 타입 2개 → 구체 타입 명시
- [ ] `src/lib/blogger.ts:295` — 미사용 변수 `niche` (warning)
- [ ] `eslint-config-next` — "Pages directory cannot be found" 경고 발생 (CLI 전환 후 next 전용 lint 규칙 잔존, eslint-config-next → 범용 TS lint config 교체 필요)

---

## 다음 단계 (우선순위순)

### 즉시 (빌드/린트 복구)
- [ ] Next.js 의존성 제거 — `next build` → CLI 전용 `package.json`으로 전환 (build 스크립트 삭제 또는 `tsc --noEmit`으로 교체)
- [ ] `eslint-config-next` → `@typescript-eslint/eslint-plugin` 등 범용 TS lint config으로 교체 (next 전용 규칙 제거)
- [ ] 테스트 파일 `any` 타입 명시화 (lint 21 errors) — `as any` → `as ReturnType<typeof vi.fn>` 등 vitest 타입 활용
- [ ] `blogger.ts` `niche` 미사용 변수 제거 (lint 1 warning)

### 즉시 (AdSense 승인 준비)
- [ ] Blogger에 소개(About) 페이지 생성
- [ ] Blogger에 개인정보처리방침(Privacy Policy) 페이지 생성
- [ ] Blogger에 문의(Contact) 페이지 생성
- [ ] 글 15~20개 축적 (Paperclip 에이전트 자율 운영)

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
