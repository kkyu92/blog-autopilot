# Content Autopilot → Paperclip 전환 설계

> 작성일: 2026-04-02
> 상태: 설계 (구현 전)

---

## 1. 현재 상태 요약

### content-autopilot (Next.js 앱)
- **빌드/테스트/린트**: 모두 통과 (146 tests, 0 lint errors)
- **핵심 모듈 (재사용 대상)**:
  - `src/lib/claude.ts` (166줄) — Claude API 스트리밍 콘텐츠 생성 + SEO 메타
  - `src/lib/trends.ts` (182줄) — Google Trends RSS + Zum 국내이슈 + Google/Naver Suggest
  - `src/lib/blogger.ts` (142줄) — Blogger OAuth + 발행
  - `src/lib/naver.ts` (120줄) — Naver OAuth + 블로그 발행
  - `src/lib/medium.ts` (103줄) — Medium Integration Token 발행
  - `src/lib/substack.ts` (141줄) — Substack 발행
  - `src/lib/schema.ts` (68줄) — Drizzle ORM 스키마 (중복키워드 DB)
  - `src/lib/search-console.ts` (161줄) — Search Console API (성과 추적)
  - `src/lib/tokens.ts` (87줄) — OAuth 토큰 관리
  - `src/lib/sanitize.ts` (42줄) — HTML 살균
  - `src/lib/db.ts` (31줄) — SQLite 초기화

- **제거 대상 (Paperclip 대시보드로 대체)**:
  - `src/app/` — Next.js 페이지/라우트 (UI)
  - `src/components/` — React 컴포넌트
  - `src/hooks/` — React 훅

### Paperclip (v1, 44.5k stars)
- Node.js + PostgreSQL 기반 AI 에이전트 회사 오케스트레이션
- `claude_local` 어댑터로 Claude Code CLI를 heartbeat마다 실행
- 티켓 기반 태스크 관리 + 예산 추적 + 조직도
- 스킬 시스템으로 런타임 능력 주입 가능
- 단일 사용자 `local_trusted` 모드 지원

---

## 2. Paperclip 회사 구조 설계

### 회사 목표
"트렌드 키워드 기반 SEO 최적화 블로그 콘텐츠를 자동으로 생성하고 발행하여 검색 트래픽과 애드센스 수익을 만든다"

### 에이전트 조직도

```
CEO (사람 = 나)
├── Researcher (claude_local)
│   - 트렌드 키워드 수집
│   - 블로그 소스 크롤링/리서치
│   - 연관 키워드 분석
│
├── Analyst (claude_local)
│   - 트렌드 분석 + 글감 선별
│   - 키워드 경쟁도/검색량 평가
│   - 중복 키워드 필터링 (DB 조회)
│   - 발행 우선순위 결정
│
├── Writer (claude_local)
│   - 콘텐츠 생성 (톤별 차별화)
│   - SEO 메타데이터 생성
│   - 이미지 삽입
│   - 품질 검증 (AI 티 제거, 분량 체크)
│
└── Publisher (claude_local)
    - 멀티 플랫폼 발행 (Blogger/Naver/Medium/Substack)
    - 발행 결과 기록
    - 성과 추적 (Search Console)
    - 에러 핸들링 + 재시도
```

---

## 3. 에이전트별 상세 설계

### 3.1 Researcher

**역할**: 트렌드 키워드 수집 + 소스 리서치

**heartbeat 주기**: 6시간 (하루 4회)
- 한국 시간 기준 06:00, 12:00, 18:00, 00:00

**사용할 lib 모듈**:
- `trends.ts` → `getGoogleDailyTrends()`, `getDomesticIssues()`, `getRelatedKeywords()`

**워크플로우**:
1. Google Trends RSS에서 한국 인기 검색어 수집
2. Zum 실시간 이슈에서 국내 키워드 수집
3. 각 키워드에 대해 Google/Naver Suggest로 연관 키워드 확장
4. 결과를 DB에 저장 (중복 제거)
5. Analyst 에이전트에게 태스크 생성: "새 키워드 N건 분석 요청"

**프롬프트 템플릿 핵심**:
```
당신은 키워드 리서처입니다.
1. trends 모듈로 Google/국내 트렌드 키워드를 수집하세요
2. 이미 DB에 있는 키워드는 건너뛰세요
3. 새 키워드마다 연관 키워드를 수집하세요
4. 수집 결과를 DB에 저장하고 Analyst에게 분석 태스크를 생성하세요
```

---

### 3.2 Analyst

**역할**: 키워드 분석 + 글감 선별 + 우선순위 결정

**heartbeat 주기**: assignment 기반 (Researcher가 태스크 생성하면 깨어남)
- 백업 타이머: 12시간

**사용할 lib 모듈**:
- `schema.ts` → DB 조회 (기존 글, 발행 이력)
- `search-console.ts` → 기존 글의 검색 성과 데이터

**워크플로우**:
1. Researcher가 수집한 키워드 목록 받음
2. 각 키워드에 대해:
   - 이미 해당 키워드로 글이 있는지 확인
   - 검색량/경쟁도 추정 (Suggest 결과 수 기반)
   - Search Console 데이터로 유사 키워드 성과 확인
3. 상위 키워드 3~5개 선별
4. Writer 에이전트에게 태스크 생성: "키워드 X로 글 생성 요청"

**선별 기준**:
- 검색 트래픽 잠재력 높음
- 기존 글과 중복되지 않음
- YMYL 주제는 전문성 표현 필수 태그
- 애드센스 승인 기준 부합 (1000자+, 오리지널)

---

### 3.3 Writer

**역할**: 고품질 블로그 콘텐츠 생성

**heartbeat 주기**: assignment 기반 (Analyst가 태스크 생성하면 깨어남)
- 백업 타이머: 6시간

**사용할 lib 모듈**:
- `claude.ts` → `generateContent()` (스트리밍), `generateSeoMeta()`
- `sanitize.ts` → HTML 살균

**워크플로우**:
1. Analyst가 선별한 키워드 + 톤 + 참고자료 받음
2. claude.ts로 콘텐츠 생성 (톤: informative/conversational/expert)
3. 생성된 콘텐츠 품질 체크:
   - 분량 1000자 이상
   - AI 티 검사 (반복 패턴, 뻔한 도입부)
   - SEO 요소 (키워드 밀도, H2/H3 구조)
4. SEO 메타데이터 생성
5. DB에 저장 (status: draft)
6. Publisher 에이전트에게 태스크 생성: "글 ID X 발행 요청"

**품질 게이트 (자체 검증)**:
- 분량 < 1000자 → 재생성
- 키워드 미포함 → 재생성
- 3회 실패 → 에스컬레이션 (CEO에게 보고)

---

### 3.4 Publisher

**역할**: 멀티 플랫폼 발행 + 성과 추적

**heartbeat 주기**: assignment 기반 (Writer가 태스크 생성하면 깨어남)
- 백업 타이머: 1시간 (예약 발행 체크용)

**사용할 lib 모듈**:
- `blogger.ts` → Blogger 발행
- `naver.ts` → Naver 블로그 발행
- `medium.ts` → Medium 발행
- `substack.ts` → Substack 발행
- `tokens.ts` → OAuth 토큰 관리
- `search-console.ts` → 발행 후 성과 추적

**워크플로우**:
1. 발행할 글 ID와 대상 플랫폼 받음
2. 발행 전 체크:
   - OAuth 토큰 유효성 확인 (만료 시 자동 갱신)
   - 플랫폼별 포맷 변환 (Markdown → HTML)
3. 순차 발행 (Blogger → Naver → Medium → Substack)
4. 발행 결과 DB에 기록
5. 실패 시 3회 재시도, 그래도 실패 → 에스컬레이션

**발행 전 AdSense 체크리스트 (자동)**:
- 글 분량 1000자 이상
- HTTPS 환경 확인
- 소개/개인정보/문의 페이지 존재 여부

---

## 4. 기술 전환 계획

### Phase 0: Paperclip 설치 + 기본 설정 (수동)
```bash
# 집 PC
npx paperclipai onboard --yes
# 또는
git clone https://github.com/paperclipai/paperclip.git
cd paperclip && pnpm install && pnpm dev

# PM2로 상시 가동
npm install -g pm2
pm2 start "pnpm dev" --name paperclip
pm2 save && pm2 startup
```

**필요한 환경변수** (Paperclip 에이전트 env로 설정):
```
ANTHROPIC_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
NAVER_REDIRECT_URI=...
UNSPLASH_ACCESS_KEY=...
PIXABAY_API_KEY=...
DATABASE_PATH=./data/content.db
```

### Phase 1: lib/ 모듈 독립화
1. `src/lib/` 모듈들을 Next.js import alias (`@/lib/`) 의존 제거
2. 상대 경로로 변환하거나, `packages/content-lib/` 로 추출
3. 의존성: `@anthropic-ai/sdk`, `better-sqlite3`, `drizzle-orm`, `marked`, `sanitize-html`
4. 테스트 통과 확인

### Phase 2: Paperclip 에이전트 등록
1. Paperclip에 회사 생성: "Content Autopilot"
2. 에이전트 4개 등록 (Researcher, Analyst, Writer, Publisher)
3. 각 에이전트 설정:
   - adapter: `claude_local`
   - cwd: content-autopilot 프로젝트 디렉토리
   - heartbeat 주기: 위 설계 참조
   - 프롬프트 템플릿: 역할 + 워크플로우 + lib 사용법
   - env: API 키들

### Phase 3: 스킬 작성
Paperclip 스킬로 lib/ 모듈 래핑:
```
skills/
├── content-research/SKILL.md    # trends.ts 호출 래퍼
├── content-analyze/SKILL.md     # 키워드 분석 로직
├── content-write/SKILL.md       # claude.ts 호출 래퍼
└── content-publish/SKILL.md     # 발행 로직 래퍼
```

각 스킬은 해당 에이전트가 heartbeat에서 사용.

### Phase 4: 통합 테스트 + 안정화
1. 수동 wakeup으로 각 에이전트 개별 테스트
2. 전체 파이프라인 E2E: Researcher → Analyst → Writer → Publisher
3. 에러 핸들링 검증 (API 실패, 토큰 만료 등)
4. heartbeat 주기 조정 (토큰 소비량 모니터링)

### Phase 5: 기존 Next.js 앱 정리
1. Paperclip 안정 운영 확인 후
2. content-autopilot 레포 archive (삭제 X)
3. lib/ 모듈만 Paperclip 프로젝트 내로 이동

---

## 5. Heartbeat 주기 결정

| 에이전트 | 주기 | 근거 |
|----------|------|------|
| Researcher | 6시간 (timer) | 트렌드는 급변하지만 하루 4회면 충분 |
| Analyst | assignment + 12h backup | Researcher 결과 즉시 처리 |
| Writer | assignment + 6h backup | 글 생성은 즉시 반응 필요 |
| Publisher | assignment + 1h backup | 예약 발행 체크 필요 |

**일일 예상 토큰 소비** (대략):
- Researcher: heartbeat 4회 x ~2K tokens = ~8K
- Analyst: 1~2회 x ~3K = ~6K
- Writer: 3~5글 x ~10K = ~50K
- Publisher: 3~5회 x ~1K = ~5K
- **합계**: ~70K tokens/day, ~$2.1/day (Sonnet 기준)

---

## 6. 키워드 수집 소스

| 소스 | 모듈 | 상태 |
|------|------|------|
| Google Trends RSS (한국) | trends.ts | 구현 완료 |
| Zum 실시간 이슈 | trends.ts | 구현 완료 |
| Google Suggest | trends.ts | 구현 완료 |
| Naver Suggest | trends.ts | 구현 완료 |
| Search Console (기존 글 성과) | search-console.ts | 구현 완료 |

추가 고려:
- Naver DataLab (검색 트렌드) — 향후
- Google Keyword Planner API — 향후

---

## 7. 배포 플랫폼 결정

### 블로그 발행 대상
1. **Google Blogger** (메인) — AdSense 연동 최적, OAuth 완료
2. **Naver Blog** (서브) — 한국 트래픽, OAuth 완료
3. **Medium** (서브) — 영문 확장 시
4. **Substack** (서브) — 뉴스레터 형태

### AdSense 승인 기준 반영
- Writer 에이전트에 자동 적용:
  - 1000자 이상 강제
  - 오리지널 콘텐츠만 (크롤링 복사 금지)
  - AI 생성 티 제거
- Publisher 에이전트에 자동 적용:
  - HTTPS 확인
  - 필수 페이지(소개/개인정보/문의) 존재 확인

---

## 8. 저작권 처리

| 구분 | 정책 |
|------|------|
| 크롤링 범위 | 뉴스 제목 + URL만 수집 (본문 크롤링 금지) |
| 참고 자료 | Google/Naver 검색 결과 요약만 사용 |
| 콘텐츠 생성 | Claude API로 100% 창작 (참고자료 기반 재작성) |
| 이미지 | Unsplash/Pixabay (무료 라이선스) |
| 인용 표시 | 참고 자료 출처 URL 본문 하단에 표기 |

---

## 9. Tailscale + 싱크 전략

```
집 PC (Paperclip 서버, 24/7)
  ├── Tailscale IP: 100.x.x.1
  ├── Paperclip: http://100.x.x.1:3100
  └── PM2: paperclip 프로세스 상시 가동

회사 PC (Claude Code 작업용)
  ├── Tailscale IP: 100.x.x.2
  ├── Paperclip 대시보드 접속: http://100.x.x.1:3100
  └── Claude Code로 에이전트 설정 변경

폰 (모니터링 + 지시)
  ├── Tailscale IP: 100.x.x.3
  └── 브라우저로 Paperclip 대시보드 모니터링
```

---

## 10. 실행 순서 (우선순위)

### 즉시 (이번 주)
1. [ ] Paperclip 설치 (`npx paperclipai onboard --yes`)
2. [ ] PM2 설정 + 상시 가동
3. [ ] Tailscale 3곳 설치

### 단기 (1~2주)
4. [ ] Paperclip 회사 생성 + 에이전트 4개 등록
5. [ ] lib/ 모듈 Next.js 의존 제거 (Phase 1)
6. [ ] Researcher 에이전트 단독 테스트
7. [ ] Writer 에이전트 단독 테스트

### 중기 (2~4주)
8. [ ] 전체 파이프라인 연결 테스트
9. [ ] heartbeat 주기 튜닝 (토큰 소비 모니터링)
10. [ ] AdSense 승인 신청
11. [ ] 1주일 자동 운영 모니터링

### 장기 (1개월+)
12. [ ] content-autopilot 레포 archive
13. [ ] 추가 키워드 소스 연동
14. [ ] 성과 기반 키워드 선별 고도화
15. [ ] 회사 PC Paperclip 설치 (미러링 or 접속 전용)

---

_이 문서는 content-autopilot → Paperclip 전환의 설계 기준 문서입니다._
_구현 단계에서 세부 사항은 조정될 수 있습니다._
