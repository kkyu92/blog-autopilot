<!-- /autoplan restore point: /Users/kyusikkim/.gstack/projects/kkyu92-content-autopilot/main-autoplan-restore-20260401-221346.md -->
# 콘텐츠 자동화 시스템 (Content Autopilot) - 구현 플랜 v2

## Context

키워드 기반 블로그 콘텐츠 자동 생성 + Blogger 발행 **개인 도구**.
AI 콘텐츠가 실제로 검색 트래픽을 만드는지 검증하는 것이 1차 목표.

**핵심 가치**: 키워드 입력 → Claude AI 초안 생성 → Markdown 편집 → 원클릭 Blogger 발행

---

## 기술 스택 (확정)

| 항목 | 도구 | 이유 |
|------|------|------|
| 프레임워크 | Next.js 15 (App Router + API Routes) | 프론트+백엔드 통합, 풀스택 |
| DB | SQLite (better-sqlite3) | 단일 사용자, 설정 없이 즉시 사용 |
| ORM | Drizzle ORM (SQLite driver) | 타입 안전, 마이그레이션 지원 |
| 에디터 | textarea + Markdown | 단순, 시간 절약 (Tiptap 제거) |
| AI | Claude API (@anthropic-ai/sdk) | 본문 생성 + SEO 메타데이터 |
| 발행 | Blogger API v3 | OAuth 2.0, 한국 블로그 플랫폼 |
| UI | shadcn/ui + Tailwind CSS v4 | 빠른 UI 구성 |
| 상태관리 | TanStack Query v5 | 서버 상태 캐싱 |
| 패키지매니저 | pnpm | 빠르고 디스크 효율적 |

**핵심 의존성**:
- `@anthropic-ai/sdk` — Claude API 클라이언트
- `better-sqlite3` + `drizzle-orm` + `drizzle-kit` — DB
- `marked` — Markdown → HTML 변환
- `sanitize-html` — HTML 살균 (발행 전 XSS 방지)
- `nanoid` — 테이블 PK 생성
- `google-trends-api` — Google Trends 비공식 API (npm)
- `@tanstack/react-query` — 서버 상태 캐싱
- `@mozilla/readability` + `jsdom` — 웹페이지 본문 추출 (참고 자료 수집)

**배포 전략**:
- **MVP**: 로컬 실행 (`pnpm dev`). SQLite는 서버리스(Vercel) 비호환이므로 로컬 우선
- **검증 후**: VPS(Fly.io/Railway) 또는 Turso(LibSQL) 전환 검토
- Vercel 배포 시 DB를 Turso로 교체 필요 (Drizzle ORM이라 마이그레이션 용이)

**제거된 것들** (MVP 이후 재검토):
- ~~FastAPI~~ → Next.js API Routes로 통합
- ~~Supabase~~ → SQLite로 단순화
- ~~Redis~~ → 불필요 (단일 사용자)
- ~~Tiptap~~ → textarea + Markdown
- ~~Instagram/Threads~~ → Blogger만 MVP
- ~~OpenAI API~~ → Claude 단일 API
- ~~DALL-E/FLUX/Unsplash~~ → 이미지는 수동 (MVP)
- ~~예약 발행~~ → 즉시 발행만 (MVP)

**예상 비용** (월):
- Claude API: ~$5-15 (하루 5-10건 생성 기준, Sonnet 사용 시)
- 도메인/서버: $0 (로컬 MVP) → $5-7 (VPS 전환 시)
- Blogger API: 무료

---

## 프로젝트 구조

```
blog-autopilot/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # 대시보드 (파이프라인 상태)
│   │   ├── topics/
│   │   │   └── page.tsx        # 키워드 조회 + 기회 랭킹
│   │   ├── editor/
│   │   │   └── [id]/
│   │   │       └── page.tsx    # Markdown 에디터 + 미리보기
│   │   ├── posts/
│   │   │   └── page.tsx        # 콘텐츠 목록 (상태별 필터)
│   │   ├── settings/
│   │   │   └── page.tsx        # API 키 설정 + Blogger 연결
│   │   ├── onboarding/
│   │   │   └── page.tsx        # 첫 실행 위자드
│   │   ├── api/
│   │   │   ├── keywords/
│   │   │   │   ├── trending/route.ts   # GET: 실시간 인기 키워드 자동 조회
│   │   │   │   └── search/route.ts     # GET: 키워드 수동 검색
│   │   │   ├── content/
│   │   │   │   ├── route.ts            # GET: 목록, POST: 생성
│   │   │   │   ├── [id]/route.ts       # GET/PUT/DELETE: 개별 콘텐츠
│   │   │   │   └── generate/route.ts   # POST: Claude AI 생성 (streaming)
│   │   │   ├── publish/
│   │   │   │   ├── blogger/route.ts    # POST: Blogger 발행
│   │   │   │   └── naver/route.ts      # POST: 네이버 블로그 발행
│   │   │   ├── auth/
│   │   │   │   ├── blogger/
│   │   │   │   │   ├── route.ts        # GET: OAuth 시작
│   │   │   │   │   └── callback/route.ts # GET: OAuth 콜백
│   │   │   │   └── naver/
│   │   │   │       ├── route.ts        # GET: OAuth 시작
│   │   │   │       └── callback/route.ts # GET: OAuth 콜백
│   │   │   └── settings/route.ts       # GET/PUT: 설정 CRUD
│   │   └── layout.tsx          # 루트 레이아웃 (사이드바)
│   ├── components/
│   │   ├── ui/                 # shadcn/ui
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   └── header.tsx
│   │   └── editor/
│   │       ├── markdown-editor.tsx    # textarea + 툴바
│   │       └── preview.tsx            # Markdown → HTML 미리보기
│   ├── lib/
│   │   ├── db.ts               # SQLite 연결 + Drizzle 인스턴스
│   │   ├── schema.ts           # Drizzle 스키마 정의
│   │   ├── claude.ts           # Claude API 클라이언트
│   │   ├── blogger.ts          # Blogger API 클라이언트
│   │   ├── auth.ts             # 간단한 Bearer token 인증
│   │   └── sanitize.ts         # HTML 살균 (sanitize-html)
│   ├── hooks/
│   │   └── use-streaming.ts    # AI 생성 streaming 훅
│   └── types/
│       └── index.ts
├── drizzle/
│   └── migrations/             # Drizzle Kit 마이그레이션
├── data/
│   └── content.db              # SQLite DB 파일 (.gitignore)
├── .env.example
├── .env.local                  # (.gitignore)
├── next.config.ts
├── tailwind.config.ts
├── drizzle.config.ts
├── package.json
├── PLAN.md
├── STATUS.md
├── CLAUDE.md
└── README.md
```

---

## DB 스키마 (SQLite)

```sql
CREATE TABLE keywords (
    id TEXT PRIMARY KEY,              -- nanoid 생성
    keyword TEXT NOT NULL UNIQUE,
    trend_data TEXT,                   -- JSON 문자열 (트렌드 응답 캐시)
    related_keywords TEXT,             -- JSON 배열 문자열
    competition_score REAL,
    search_volume INTEGER,
    cached_at TEXT,                    -- ISO 8601 문자열
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE contents (
    id TEXT PRIMARY KEY,              -- nanoid 생성
    title TEXT NOT NULL,
    body TEXT NOT NULL,               -- Markdown 형태
    body_html TEXT,                   -- Markdown → HTML 변환 결과 (발행용)
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'failed')),
    keyword_id TEXT REFERENCES keywords(id),
    tone TEXT DEFAULT 'informative',  -- 'informative', 'conversational', 'expert'
    seo_title TEXT,
    seo_description TEXT,
    seo_tags TEXT,                    -- JSON 배열 문자열
    source_urls TEXT,                 -- JSON 배열 문자열 (참고 URL)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE publications (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT 'blogger',
    external_id TEXT,                 -- Blogger 게시물 ID
    external_url TEXT,                -- 발행된 URL
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'published', 'failed')),
    published_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_publications_content ON publications(content_id);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- 설정 예: claude_api_key, blogger_tokens (JSON), default_tone

-- 초기화 시 실행:
PRAGMA journal_mode = WAL;       -- 동시 읽기 성능
PRAGMA foreign_keys = ON;        -- FK 제약 활성화
```

### 상태 머신

```
콘텐츠 상태:
  draft ──(발행 클릭)──→ [발행 시도] ──(성공)──→ published
                                      └──(실패)──→ failed
  failed ──(재시도)──→ [발행 시도] ──→ ...
  published ──(삭제)──→ (DB에서 제거)

발행 상태:
  pending ──→ published | failed
```

---

## 핵심 파이프라인

### 1. 키워드 & 트렌드 (`/topics`)

**실시간 트렌드 자동 표시** (사용자가 따로 검색하지 않아도 됨):

**API**:
- `GET /api/keywords/trending` — 페이지 로드 시 자동 호출. Google Trends 실시간 인기 키워드 반환
- `GET /api/keywords/search?q=키워드` — 추가 검색이 필요할 때

**Google Trends 연동** (`google-trends-api` npm 패키지):
- `dailyTrends({ geo: 'KR' })` — 한국 실시간 인기 검색어
- `interestOverTime({ keyword })` — 특정 키워드 트렌드 추이
- `relatedQueries({ keyword })` — 관련 검색어
- 5분 간격 자동 갱신 (TanStack Query refetchInterval)
- 캐싱: DB에 24시간 TTL로 저장, 중복 API 호출 방지
- **비공식 API 불안정 대비**: 실패 시 마지막 캐시 데이터 표시 + 수동 검색 fallback
- **Rate limit 대비**: 요청 간 1초 딜레이, 실패 시 지수 백오프

**UI**:
- 페이지 상단: "지금 뜨는 키워드" 섹션 (자동 로드, 검색 불필요)
- 각 카드: 키워드, 트렌드 점수 배지, 관련 키워드 태그, "이 주제로 생성" 버튼
- 하단: 수동 검색 입력 (추가 탐색용)
- **Loading state**: 스켈레톤 카드 3개 + "트렌드 불러오는 중..."
- **Error state**: "실시간 트렌드를 가져오지 못했습니다. 아래에서 직접 검색하세요"
- **Stale data state**: "5분 전 데이터" 배지 표시

### 1.5 참고 자료 자동 수집 (키워드 → 상위 사이트 분석)

**플로우**:
```
키워드 입력 → Google Custom Search API → 상위 5개 URL 추출
→ 각 URL 본문 추출 (@mozilla/readability + jsdom)
→ 본문 요약 (각 1000자 제한) → source_urls + source_summaries DB 저장
→ Claude에 참고 자료로 전달 → 새로운 글 창작
```

**API**: `POST /api/content/research`
- 입력: keyword
- Google Custom Search API로 상위 5개 결과 검색
- 각 URL fetch → `@mozilla/readability`로 본문 추출
- 본문을 1000자로 요약 (또는 앞부분 추출)
- 결과를 `source_urls` (JSON 배열)로 저장

**핵심 의존성 추가**:
- `@mozilla/readability` + `jsdom` — 웹페이지 본문 추출
- Google Custom Search API — 상위 검색 결과 (무료 100회/일)

**에러 처리**:
- URL fetch 실패: 해당 URL 스킵, 나머지로 진행
- Custom Search API 할당량 초과: "검색 할당량 초과. 내일 다시 시도하거나 URL을 직접 입력하세요"
- 크롤링 차단 (403/robots.txt): 해당 URL 스킵

### 2. AI 콘텐츠 생성 (`/editor/[id]`)

**API**: `POST /api/content/generate` (Streaming SSE)

- 입력: keyword, tone, target_length, source_summaries (자동 수집 또는 수동 입력)
- Claude API streaming → SSE로 클라이언트에 실시간 전송
- Markdown 형태로 생성 (H2/H3 구조화)
- 생성 완료 후 자동 저장 (draft 상태)

**Claude 프롬프트 템플릿**:

```
System:
당신은 한국어 블로그 콘텐츠 전문 작가입니다.
톤: {tone} (informative=정보 전달형, conversational=대화체, expert=전문가)
다음 규칙을 따르세요:
- H2, H3 소제목으로 구조화
- 2000-3000자 분량
- SEO 친화적: 키워드를 제목, 첫 문단, 소제목에 자연스럽게 포함
- 독자에게 실질적인 가치를 제공하는 내용
- 마지막에 요약 또는 행동 촉구 포함

User:
키워드: {keyword}
원하는 분량: {target_length}자
{참고 자료가 있으면: "참고 자료:\n{source_summaries}"}

위 키워드에 대한 블로그 글을 Markdown 형식으로 작성해주세요.
```

**SEO 메타데이터 생성** (같은 Claude 호출 또는 별도 호출):
```
다음 블로그 글의 SEO 메타데이터를 JSON으로 생성하세요:
- seo_title: 60자 이내
- seo_description: 155자 이내
- seo_tags: 5-10개 키워드 배열

글 제목: {title}
글 내용 첫 500자: {body_preview}
```

**Streaming SSE 구현 주의사항**:
- TransformStream tee 패턴: 하나는 클라이언트 전송, 하나는 서버 누적 (DB 저장용)
- AbortController: 클라이언트 연결 해제 시 Claude API 호출 즉시 중단 (토큰 절약)
- DB write는 stream close callback 안에서 await (핸들러 exit 전 완료 보장)

**UI (에디터)**:
- 레이아웃: 좌측 70% textarea (Markdown), 우측 30% 미리보기 (HTML 렌더링)
- **모바일 (<768px)**: 세로 스택, 에디터/미리보기 탭 전환
- 상단: 제목 입력, 톤 선택 드롭다운 (기본값: informative)
- 하단: SEO 섹션 (기본 접힘) + 발행 버튼
- **Auto-save**: 1초 debounce, "저장됨" / "저장 중..." 표시기
- **Streaming state**: textarea에 텍스트가 실시간으로 나타남 + "생성 중..." 배지 + 취소 버튼
- **Empty state**: "키워드를 선택하거나 직접 글을 작성하세요"
- **Error state**: "AI 생성 실패. 다시 시도하거나 직접 작성하세요" + 재시도 버튼
- **키워드→에디터 전환**: "이 주제로 생성" 클릭 → draft 레코드 즉시 생성 → `/editor/[id]` 리다이렉트 → 자동 생성 시작
- **발행 후 편집**: published 상태도 편집 가능. 재발행 시 새 publications 행 생성 (이력 보존)

### 3. 블로그 발행 (Blogger + 네이버)

**API**:
- `POST /api/publish/blogger` — Blogger 발행
- `POST /api/publish/naver` — 네이버 블로그 발행

**공통 플로우**:
- 입력: content_id, platform
- Markdown → HTML 변환 (marked 라이브러리)
- HTML 살균 (sanitize-html, 허용 태그 화이트리스트)
- 플랫폼별 API로 발행
- 토큰 만료 체크 → 자동 갱신

**Blogger OAuth 플로우**:
```
사용자 → /api/auth/blogger → Google OAuth 동의 화면
→ 동의 → /api/auth/blogger/callback → state nonce 검증 → tokens DB 저장
→ 설정 화면으로 리다이렉트 ("연결 완료")
```

**네이버 OAuth 플로우**:
```
사용자 → /api/auth/naver → 네이버 로그인 동의 화면
→ 동의 → /api/auth/naver/callback → state nonce 검증 → tokens DB 저장
→ 설정 화면으로 리다이렉트 ("연결 완료")
```
- 네이버 블로그 API: `https://openapi.naver.com/blog/writePost.json`
- 필요 권한: `blog` scope

**OAuth 보안**:
- `state` nonce 생성 → 쿠키에 저장 → callback에서 검증 (CSRF 방지)
- 토큰 갱신 mutex: 동시 갱신 요청 방지 (race condition 방어)

**토큰 관리**:
- `settings` 테이블에 `blogger_tokens`, `naver_tokens` 키로 JSON 저장
- 매 발행 전 `expires_at - now < 5분` 체크 → 선제적 갱신
- 갱신 실패 → 재인증 안내 UI

**발행 후**:
- 성공 화면: "발행 완료!" + 블로그 글 링크 + "다음 주제 찾기" 버튼
- 실패 화면: 에러 메시지 + 재시도 버튼
- 플랫폼 선택 UI: 발행 버튼에 드롭다운 (Blogger / 네이버 / 둘 다)

---

## 페이지별 UI 사양

### 대시보드 (`/`)
- **목적**: 파이프라인 현황 + 실시간 트렌드 한눈에 보기
- 상단: **지금 뜨는 키워드 TOP 5** (Google Trends 자동 로드, 클릭하면 바로 글 생성)
- 중단: 초안 N개 | 발행 완료 N개 | 실패 N개 (이번 주)
- 하단: 최근 초안 리스트 (이어서 편집)
- **Empty state**: 첫 실행 시 온보딩 위자드로 리다이렉트

### 키워드 (`/topics`)
- 위에 상세 설명

### 에디터 (`/editor/[id]`)
- 위에 상세 설명

### 콘텐츠 목록 (`/posts`)
- 테이블 뷰: 제목, 상태 배지, 생성일, 발행일
- 상태 필터 탭: 전체 | 초안 | 발행 완료 | 실패
- 각 행: 편집 링크, 발행/재시도 버튼
- **Empty state**: "아직 작성한 글이 없습니다. 새 주제를 찾아보세요"

### 설정 (`/settings`)
- Claude API 키 입력 (마스킹 표시)
- Blogger 연결 상태 + 연결/해제 버튼
- 기본 톤 선택
- **간결하게**: 다른 설정은 필요할 때 추가

### 온보딩 (`/onboarding`)
- Step 1: Claude API 키 입력 → 유효성 검증 (간단한 API 호출)
- Step 2: Blogger 연결 (OAuth) → 연결 확인
- Step 3: "첫 번째 키워드를 검색해보세요" → `/topics`로 이동

---

## 인증 & 보안

- **Bearer token 인증**: 환경변수 `AUTH_TOKEN`으로 설정, 모든 API 라우트에서 검증
- **HTML 살균**: Claude 생성물에서 script, iframe, on* 이벤트 등 제거
- **프롬프트 인젝션 방어**: 크롤링 텍스트는 HTML 태그 제거 후 길이 제한 + 구분자로 감싸서 Claude에 전달
- **API 키 저장**: .env.local (로컬 개발), 배포 시 해당 플랫폼 환경변수
- **CORS**: 같은 오리진만 허용 (Next.js 기본)

---

## 테스트 전략

| 유형 | 대상 | 도구 |
|------|------|------|
| Unit | 프롬프트 생성, HTML 살균, Markdown 변환 | Vitest |
| Integration | Blogger API 발행 (mock), DB CRUD | Vitest |
| E2E | 키워드 → 생성 → 발행 전체 플로우 (mock externals) | Playwright |

**최소 테스트 목록**:
- Claude 프롬프트 템플릿이 올바른 구조 생성하는지
- HTML sanitize가 script 태그 제거하는지
- Markdown → HTML 변환이 정상인지
- Blogger 토큰 갱신 로직
- 네이버 토큰 갱신 로직
- 콘텐츠 CRUD API (updatedAt 자동 갱신 포함)
- 빈 입력/잘못된 입력 에러 핸들링
- OAuth state nonce CSRF 검증
- SSE 스트리밍 중단 시 AbortController 동작
- source_urls 길이 제한 (10KB)

---

## 에러 핸들링

| 에러 | 원인 | 자동 복구 | 사용자 메시지 |
|------|------|----------|-------------|
| Claude API 429 | Rate limit | 지수 백오프 3회 재시도 | "AI 서버가 바쁩니다. 잠시 후 다시 시도됩니다" |
| Claude API 500 | 서버 에러 | 1회 재시도 | "AI 생성 실패. 다시 시도해주세요" |
| Claude 빈 응답 | 프롬프트 문제 | 없음 | "생성된 내용이 없습니다. 다른 키워드로 시도해보세요" |
| Blogger 401 | 토큰 만료 | refresh_token으로 갱신 | (자동 갱신, 실패 시) "블로그 재연결이 필요합니다" |
| Blogger 403 | 권한 없음 | 없음 | "블로그에 글을 올릴 권한이 없습니다. 설정을 확인하세요" |
| SQLite 잠금 | 동시 접근 | 100ms 후 재시도 | (투명하게 처리) |
| 트렌드 조회 실패 | API 불안정 | graceful degradation | "트렌드 조회 실패. 키워드를 직접 입력해서 진행할 수 있습니다" |
| 네이버 API 401 | 토큰 만료 | refresh_token 갱신 | (자동 갱신, 실패 시) "네이버 블로그 재연결이 필요합니다" |
| 네이버 API 403 | 권한/스팸 감지 | 없음 | "네이버에 글을 올릴 수 없습니다. 권한을 확인하세요" |
| SSE 클라이언트 중단 | 브라우저 닫힘 | AbortController 즉시 중단 | (투명하게 처리, 토큰 절약) |

---

## 구현 순서

```
Phase 1: 프로젝트 셋업 (CC: ~30분)
  ├─ Next.js 15 프로젝트 생성
  ├─ SQLite + Drizzle ORM 설정
  ├─ DB 마이그레이션 실행
  ├─ shadcn/ui 설치
  ├─ 기본 레이아웃 (사이드바 + 헤더)
  └─ Bearer token 인증 미들웨어

Phase 2: 핵심 파이프라인 (CC: ~1.5시간)
  ├─ 참고 자료 자동 수집 (Google Custom Search + readability)
  ├─ Claude API 연동 (streaming + AbortController)
  ├─ 콘텐츠 생성 API + 에디터 페이지 (auto-save)
  ├─ Markdown → HTML 변환 + 살균
  ├─ 콘텐츠 CRUD API
  └─ 콘텐츠 목록 페이지

Phase 3: 블로그 발행 연동 (CC: ~1.5시간)
  ├─ Blogger OAuth 플로우 (state nonce CSRF 포함)
  ├─ 네이버 OAuth 플로우
  ├─ 토큰 저장 + 자동 갱신 (mutex)
  ├─ 발행 API (Blogger + 네이버)
  └─ 발행 결과 UI + 플랫폼 선택

Phase 4: 키워드 + 대시보드 (CC: ~30분)
  ├─ 키워드 조회 (Google Trends 시도 + fallback)
  ├─ 키워드 페이지 UI
  ├─ 대시보드 페이지
  └─ 온보딩 위자드

Phase 5: 마무리 (CC: ~30분)
  ├─ 설정 페이지
  ├─ 테스트 작성
  ├─ .env.example + README
  └─ 로컬 실행 가이드 (배포는 검증 후)
```

---

## 검증 방법

1. **Phase 1 완료**: `pnpm dev`로 기동, 사이드바 있는 빈 페이지 표시
2. **Phase 2 완료**: 키워드 입력 → Claude가 streaming으로 글 생성 → DB 저장
3. **Phase 3 완료**: 생성된 글 → "발행" 클릭 → 실제 Blogger에 포스트 게시
4. **Phase 4 완료**: 키워드 조회 → 주제 선택 → 글 생성 → 발행 E2E 동작
5. **전체 완료**: 대시보드에서 현황 확인, 설정에서 API 변경 정상 동작

---

## 확정된 Taste Decisions

- [x] #8: 네이버 블로그 → MVP에 포함 확정 (2차 autoplan에서 변경)
- [x] #16: Claude 프롬프트 → MVP 개발과 동시에 반복 개선
- [x] #20: Google Trends → 실시간 연동 확정. 대시보드+키워드 페이지에 자동 표시

## 확정된 사항 (기존 미확정 → 확정)

- [x] 배포 환경: MVP는 로컬 실행, 검증 후 VPS 또는 Turso 전환
- [x] API 비용: Claude Sonnet 기준 월 $5-15 (하루 5-10건)
- [ ] 커스텀 도메인 — 배포 전환 시 결정

---

## 구현 시 주의사항 (2차 리뷰 반영)

- **db.ts**: lazy-init 패턴 사용 (빌드 타임 fs 에러 방지)
- **updatedAt**: 모든 UPDATE 쿼리에서 명시적으로 설정
- **source_urls**: Claude에 전달 시 10KB 제한
- **OAuth tokens**: 평문 저장 (MVP). VPS 배포 시 암호화 필요

---

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail (2차 autoplan, 2026-04-01)

| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|---------------|-----------|-----------|
| 1 | CEO | /office-hours 스킵 | Mechanical | P6 (action) | 이미 3차 리뷰 완료된 플랜 |
| 2 | CEO | 네이버 블로그 MVP 포함 | User Decision | — | 사용자 선택 (C: 둘 다) |
| 3 | CEO | Search Console 연동 | Taste | P1 (completeness) | 핵심 가설 측정에 필요하지만 scope 증가 |
| 4 | CEO | Approach A (순차 구현) 선택 | Mechanical | P1+P3 | Phase 1 완료 상태에서 가장 직관적 |
| 5 | Design | 발행 후 편집 가능 | Mechanical | P1 (completeness) | published 상태도 편집, 재발행 시 새 row |
| 6 | Design | Auto-save 추가 | Mechanical | P1 (completeness) | 1초 debounce + 저장 표시기 |
| 7 | Design | 키워드→에디터 전환 | Mechanical | P5 (explicit) | draft 생성 → redirect → 자동 생성 |
| 8 | Design | 모바일 에디터 | Mechanical | P3 (pragmatic) | <768px 세로 스택 + 탭 전환 |
| 9 | Eng | OAuth state CSRF | Mechanical | P1 (completeness) | nonce + 쿠키 검증 |
| 10 | Eng | SSE AbortController | Mechanical | P1 (completeness) | 클라이언트 중단 시 토큰 절약 |
| 11 | Eng | TransformStream tee | Mechanical | P5 (explicit) | 스트리밍 + DB 저장 동시 처리 |
| 12 | Eng | 토큰 갱신 mutex | Mechanical | P5 (explicit) | 동시 갱신 race condition 방어 |
| 13 | Eng | db.ts lazy-init | Mechanical | P5 (explicit) | 빌드 타임 에러 방지 |
| 14 | Eng | updatedAt 명시적 설정 | Mechanical | P1 (completeness) | SQLite trigger 대신 app layer |
| 15 | Eng | source_urls 10KB 제한 | Mechanical | P3 (pragmatic) | Claude API 비용 방지 |

---

## GSTACK REVIEW REPORT (autoplan 2차, 2026-04-01)

| Review | Trigger | Runs | Status | 핵심 발견 |
|--------|---------|------|--------|----------|
| CEO Review | `/plan-ceo-review` | 1 | DONE | 네이버 블로그 MVP 포함 확정, 가설 측정 방법 질문 |
| Design Review | `/plan-design-review` | 1 | DONE | 에디터 save state, 발행 후 편집, 모바일 대응 |
| Eng Review | `/plan-eng-review` | 1 | DONE | OAuth CSRF, SSE 안정성, DB lazy-init |
| Voices | subagent-only | 3 | DONE | Codex 미설치. Claude subagent 3회 (CEO/Design/Eng) |

### Cross-Phase Themes
**Theme: OAuth 보안** — CEO (premise #3)와 Eng (CSRF state) 모두 OAuth 관련 우려 제기. 고신뢰 신호.

**VERDICT:** 15건 auto-decided, 1건 taste decision, 1건 user decision. 네이버 블로그 추가로 Phase 3 scope 증가.
