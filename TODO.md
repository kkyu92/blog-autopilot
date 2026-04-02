# Content Autopilot — TODO

> 마지막 점검: 2026-04-02 09:40 KST
> 빌드: PASS | 테스트: 146/146 PASS | Lint: 0 errors, 0 warnings

---

## MVP 기능 (전체 완료)
- [x] Phase 1: 프로젝트 셋업 (Next.js, SQLite, shadcn/ui, 레이아웃, 인증)
- [x] Phase 2: 핵심 파이프라인 (Claude API, 에디터, CRUD, 리서치)
- [x] Phase 3: 블로그 발행 연동 (Blogger/네이버 OAuth, 토큰 관리, 발행 API)
- [x] Phase 4: 키워드 + 대시보드 (Google Trends, 온보딩)
- [x] Phase 5: 마무리 (설정, 테스트, README)
- [x] 텔레그램 봇
- [x] 트렌드 위젯, 자동저장, 프롬프트 튜닝, 에러 핸들링 UX, 원클릭 발행
- [x] 예약 발행, 벌크 생성, 이미지 검색, 테스트 커버리지
- [x] VPS 배포 설정, DB 백업, 성과 추적, Medium/Substack 지원
- [x] CI/CD (GitHub Actions), Issue Agent, /api/health version 필드

---

## 완료: Lint 에러/경고 수정
- [x] ESLint Errors 9개 → 0개 (topics, editor, page, settings 수정)
- [x] ESLint Warnings 5개 → 0개 (미사용 import/변수 제거, dependency 수정)

---

## 완료: 보안 수정
- [x] `src/app/api/backup/route.ts` — `execSync` → `execFileSync` + path traversal 검증
- [x] Substack 비밀번호 — `SUBSTACK_PASSWORD` 환경변수 우선 사용

---

## 인프라 & 배포 (미완료)
- [ ] Fly.io 배포 활성화 — `fly auth login` → `./scripts/fly-setup.sh` → secrets 설정 → 첫 배포
- [ ] Google OAuth 재연동 — Search Console scope 추가됨. 설정에서 Blogger 연결 해제 후 재연결
- [ ] Search Console 사이트 등록 — 설정에서 `search_console_site` URL 입력

---

## 코드 품질 (리팩토링)
- [ ] `src/app/editor/[id]/page.tsx` — 659줄 단일 파일. EditorContent/SchedulePublish/ImageSearch 분리
- [ ] `src/app/page.tsx` — PerformanceWidget 인라인 → 별도 컴포넌트 파일
- [ ] `src/app/api/publish/schedule/route.ts:107` — cron GET 자기 자신 fetch (순환) → 직접 함수 호출
- [ ] Medium/Substack 발행 로직 중복 → 공통 `publishContent()` 헬퍼 추출

---

## UX/성능 개선
- [ ] 대시보드 stats 카드 — 모바일 1열 → 항상 3열 (`grid-cols-3`)
- [ ] 키워드 탐색 — 벌크 생성 버튼 로딩 상태 없음
- [ ] 에디터 — Medium/Substack 버튼 로딩 스피너 없음 (재클릭 가능)
- [ ] 설정 페이지 — 섹션 저장 후 입력 필드 초기화 안 됨
- [ ] 트렌딩 API — 외부 API 실패 시 캐시된 이전 결과 반환

---

## 장기 개선 아이디어
- [ ] 콘텐츠 목록 — 검색/정렬 기능
- [ ] 발행 이력 조회 페이지
- [ ] 다크 모드 지원
- [ ] 대시보드 성과 추이 차트 (SVG 바차트)

---

## 테스트
- [x] `pnpm lint` 에러 0으로 만들기
- [ ] CI workflow에 `pnpm lint` 단계 추가

---

_이 파일은 매 평일 오전 7시 자동 점검으로 업데이트됩니다._
