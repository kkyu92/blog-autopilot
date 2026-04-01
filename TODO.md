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
