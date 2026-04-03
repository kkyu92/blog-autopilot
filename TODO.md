# Content Autopilot — TODO

> 마지막 점검: 2026-04-03 14:30 KST
> 빌드: PASS | 테스트: 219/219 PASS | Lint: 0 errors, 0 warnings

---

## 완료 항목

### MVP + 인프라
- [x] Phase 1~5: Next.js 풀스택 앱 (에디터, CRUD, OAuth, 대시보드)
- [x] CI/CD (GitHub Actions) + Issue Agent
- [x] Paperclip 설치 + PM2 상시 가동
- [x] Tailscale 3곳 연결 (집/회사/폰)
- [x] Paperclip 에이전트 5개 등록 (CEO/Researcher/Writer/QA/Publisher)
- [x] 에이전트 한국어 응답 설정

### 플랫폼 연동
- [x] Google Blogger OAuth 연결 + 발행 테스트 성공
- [x] WordPress.com OAuth 연결 + 발행 테스트 성공
- [x] 네이버/Medium/Substack 완전 제거 (API 종료)

### 코드 품질
- [x] Lint 에러 0개 달성
- [x] Writer SDK 호출 제거 (직접 글 작성, Max 구독)
- [x] 삭제 시 외부 플랫폼 연동 삭제 + 확인 모달
- [x] 콘텐츠 목록에 플랫폼 뱃지 + 외부 링크 표시

---

## 다음 단계 (우선순위순)

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
