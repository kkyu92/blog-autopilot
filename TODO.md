# Content Autopilot — TODO

## 우선순위 높음 (실사용 필수)
- [x] 1. 대시보드 트렌드 위젯 — Google/국내 이슈 TOP 5 + 바로 생성 링크
- [x] 2. 에디터 자동저장 — 1초 debounce auto-save + 저장 상태 표시기 (기존 구현 확인)
- [x] 3. 콘텐츠 생성 프롬프트 튜닝 — 톤별 차별화, AI 티 제거, 한국어 자연스러움
- [x] 4. 에러 핸들링 UX — sonner 토스트 알림 (저장 실패, 발행 성공/실패)
- [x] 5. 키워드→생성→발행 원클릭 — 생성 후 자동 발행 체크박스 (Blogger/네이버)

## 우선순위 중간 (편의성)
- [x] 6. 예약 발행 — 날짜/시간 선택 + 플랫폼 지정 + cron API
- [x] 7. 벌크 생성 — 키워드 멀티 선택 (최대 10개) + 일괄 AI 생성
- [x] 8. 이미지 자동 삽입 — Unsplash/Pixabay 이미지 검색 + 에디터 삽입
- [x] 9. 테스트 커버리지 확대 — 73→146개 (API 검증, 트렌드 파싱, 프롬프트 빌더, 스키마)

## 우선순위 낮음 (장기)
- [x] 10. VPS 배포 — Dockerfile + fly.toml + standalone 빌드 + DATABASE_PATH 지원
- [x] 11. DB 백업 — scripts/backup-db.mjs + /api/backup 엔드포인트 (최대 7개 로테이션)
- [x] 12. 성과 추적 — Search Console API 연동 + 대시보드 성과 위젯 (클릭/노출/CTR/순위)
- [x] 13. 추가 플랫폼 — Medium (Integration Token) + Substack (Cookie 기반) 발행 지원

## 인프라 & 배포 (즉시)
- [x] 14. GitHub Actions CI/CD — main push → 테스트 → Fly.io 자동 배포
- [ ] 15. Fly.io 배포 활성화 — `fly auth login` → `./scripts/fly-setup.sh` → secrets 설정 → 첫 배포
      - `fly auth login`
      - `./scripts/fly-setup.sh`
      - `fly secrets set ANTHROPIC_API_KEY=... GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... AUTH_TOKEN=...`
      - `fly tokens create deploy` → GitHub Settings > Secrets > `FLY_API_TOKEN` 추가
      - `fly deploy`
- [ ] 16. Google OAuth 재연동 — Search Console scope 추가됨. 설정에서 Blogger 연결 해제 후 재연결
- [ ] 17. Search Console 사이트 등록 — 설정에서 `search_console_site` URL 입력

## QA 리뷰 결과 (2026-04-02)

### 긴급 (보안)
- [ ] `src/lib/substack.ts` — Substack 비밀번호가 settings DB에 평문 저장됨. 최소한 암호화 또는 환경변수로 전환 필요
- [ ] `src/app/api/backup/route.ts:16` — `dbPath`가 사용자 입력 없이 환경변수에서 오지만 `execSync`에 직접 삽입됨. path 검증 추가 권장

### 높음 (코드 품질)
- [ ] `src/app/editor/[id]/page.tsx` — 659줄 단일 파일. EditorContent/SchedulePublish/ImageSearch 컴포넌트 분리 필요
- [ ] `src/app/page.tsx` — PerformanceWidget이 같은 파일에 인라인. 별도 컴포넌트 파일로 분리
- [ ] `src/app/api/publish/schedule/route.ts:107` — cron GET이 자기 자신의 서버에 fetch 호출 (순환). 직접 함수 호출로 변경 권장
- [ ] Medium/Substack 발행 로직 중복 — publish 라우트 4개(blogger/naver/medium/substack)가 거의 같은 패턴. 공통 publishContent() 헬퍼 추출

### 중간 (UX/성능)
- [ ] 대시보드 stats 카드 — 모바일에서 1열 표시. `sm:grid-cols-3` 대신 `grid-cols-3`으로 항상 3열 (숫자만이라 좁아도 OK)
- [ ] 키워드 탐색 페이지 — 벌크 선택 후 "선택한 N개 일괄 생성" 버튼의 로딩 상태 없음
- [ ] 에디터 페이지 — Medium/Substack 버튼에 로딩 스피너 없음 (발행 중 재클릭 가능)
- [ ] 설정 페이지 — 각 섹션 저장 후 입력 필드 초기화 안 됨 (Substack은 password만 초기화)
- [ ] `/api/keywords/trending` 및 `/api/keywords/naver-trending` — 외부 API 실패 시 빈 배열 대신 캐시된 이전 결과 반환하도록 개선

### 낮음 (개선 아이디어)
- [ ] 콘텐츠 목록 페이지 — 검색/정렬 기능 없음. 글 수 많아지면 불편
- [ ] 발행 이력 조회 — publications 테이블 데이터를 UI에서 볼 수 없음. 발행 이력 페이지 추가
- [ ] 다크 모드 지원 — Tailwind dark: 클래스 활용
- [ ] 대시보드 성과 위젯 — 날짜별 추이 차트 (간단한 SVG 바차트)
- [ ] 에디터 — 글자 수 카운터 실시간 표시 (목표 분량 대비)
