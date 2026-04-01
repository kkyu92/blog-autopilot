<!-- /autoplan restore point: /Users/kyusikkim/.gstack/projects/kkyu92-content-autopilot/main-autoplan-restore-20260401-065949.md -->
# 콘텐츠 자동화 시스템 (Content Autopilot) - 구현 플랜

## Context

키워드 트렌드 기반 블로그 콘텐츠 자동 생성 및 멀티 플랫폼 배포 개인 도구를 구축한다.
현재 단계는 **단일 사용자 전용 도구**이며, 검증 후 SaaS 전환을 고려한다.

**핵심 가치**: 키워드 발굴 → AI 초안 생성 → 사용자 검토 → 원클릭 배포의 반자동 파이프라인으로 콘텐츠 제작 시간을 대폭 단축.

---

## Phase 1: 프로젝트 셋업 및 기반 구축

### 1-1. 모노레포 구조 생성

```
content-autopilot/
├── frontend/                 # Next.js 15 (App Router)
│   ├── src/
│   │   ├── app/              # App Router 페이지
│   │   │   ├── (dashboard)/  # 대시보드 레이아웃 그룹
│   │   │   ├── topics/       # 주제 발굴
│   │   │   ├── editor/       # 콘텐츠 생성/편집
│   │   │   ├── blog/         # 블로그 관리
│   │   │   ├── settings/     # 설정
│   │   │   └── layout.tsx    # 루트 레이아웃 (사이드바 포함)
│   │   ├── components/
│   │   │   ├── ui/           # shadcn/ui 컴포넌트
│   │   │   ├── editor/       # 리치 텍스트 에디터 관련
│   │   │   ├── images/       # 이미지 선택/배치 관련
│   │   │   └── layout/       # 사이드바, 헤더 등
│   │   ├── lib/              # 유틸리티, API 클라이언트
│   │   ├── hooks/            # 커스텀 훅
│   │   └── types/            # TypeScript 타입 정의
│   ├── public/
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   └── package.json
├── backend/                  # FastAPI
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── trends.py      # 트렌드 분석 엔드포인트
│   │   │       ├── crawl.py       # 크롤링 엔드포인트
│   │   │       ├── content.py     # 콘텐츠 CRUD
│   │   │       ├── images.py      # 이미지 서비스
│   │   │       ├── publish.py     # 배포 엔드포인트
│   │   │       └── settings.py    # 설정 엔드포인트
│   │   ├── services/
│   │   │   ├── trend_service.py   # Google Trends + YouTube 분석
│   │   │   ├── crawl_service.py   # 블로그 크롤링
│   │   │   ├── ai_service.py      # Claude/OpenAI 콘텐츠 생성
│   │   │   ├── image_service.py   # 이미지 수집/생성
│   │   │   └── publish_service.py # Blogger/Instagram 배포
│   │   ├── models/                # Pydantic 모델
│   │   ├── db/                    # DB 연결, 쿼리
│   │   ├── core/
│   │   │   ├── config.py          # 환경변수, 설정
│   │   │   └── dependencies.py    # 의존성 주입
│   │   └── main.py
│   ├── tests/
│   ├── Dockerfile
│   ├── pyproject.toml             # uv 사용
│   └── requirements.txt
├── supabase/
│   └── migrations/                # SQL 마이그레이션 파일
├── docker-compose.yml             # 로컬 개발용
├── .env.example
├── .gitignore
└── README.md
```

### 1-2. 기술 스택 셋업 상세

| 항목 | 도구 | 설정 사항 |
|------|------|----------|
| 프론트 패키지 매니저 | pnpm | workspace 설정 |
| 백엔드 패키지 매니저 | uv | Python 3.12+ |
| 프론트 UI | shadcn/ui + Tailwind v4 | 다크모드 지원 |
| 리치 텍스트 에디터 | Tiptap | 이미지 삽입, CTA 블록 커스텀 노드 |
| 상태 관리 | Zustand | 에디터 상태, 이미지 선택 상태 |
| API 통신 | TanStack Query v5 | 캐싱, 낙관적 업데이트 |
| 폼 관리 | React Hook Form + Zod | 설정 화면, SEO 메타 편집 |
| 백엔드 비동기 HTTP | httpx | 외부 API 호출 |
| 크롤링 | BeautifulSoup4 + httpx | 블로그 텍스트/이미지 추출 |
| 작업 큐 | 없음 (MVP) | 추후 Celery/ARQ 도입 검토 |

### 1-3. DB 스키마 (보완)

```sql
-- 원본 문서 기반 + 누락된 컬럼/인덱스 보완

CREATE TABLE api_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,           -- 'blogger', 'instagram', 'youtube', 'unsplash', 'openai', 'claude'
    credentials JSONB NOT NULL,       -- 암호화된 토큰/키 저장
    metadata JSONB,                   -- 블로그 ID, 계정 정보 등
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL,
    trend_data JSONB,                 -- Google Trends 응답 캐시
    youtube_data JSONB,               -- YouTube 분석 결과 캐시
    related_keywords TEXT[],          -- 연관 키워드 배열
    competition_score REAL,           -- 경쟁도 (0-1)
    search_volume INTEGER,            -- 월간 검색량 추정치
    cached_at TIMESTAMPTZ,            -- 캐시 만료 판단용
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_keywords_keyword ON keywords (keyword);
CREATE INDEX idx_keywords_cached_at ON keywords (cached_at);

CREATE TABLE tone_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,               -- '정보 전달형', '대화체', '전문가 톤'
    prompt_template TEXT NOT NULL,    -- AI에 전달할 톤 지시 프롬프트
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE blog_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    parent_id UUID REFERENCES blog_categories(id),  -- 계층 구조 지원
    series_name TEXT,                 -- 시리즈 이름 (nullable)
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE contents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,               -- HTML 형태
    status TEXT NOT NULL DEFAULT 'draft',  -- draft, review, scheduled, published
    keyword_id UUID REFERENCES keywords(id),
    category_id UUID REFERENCES blog_categories(id),
    tone_preset_id UUID REFERENCES tone_presets(id),
    seo_title TEXT,
    seo_description TEXT,
    seo_tags TEXT[],
    cta_config JSONB,                 -- CTA 버튼 설정 (텍스트, URL, 위치)
    source_urls TEXT[],               -- 참고한 원본 블로그 URL들
    scheduled_at TIMESTAMPTZ,         -- 예약 발행 시간
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_contents_status ON contents (status);
CREATE INDEX idx_contents_scheduled ON contents (scheduled_at) WHERE scheduled_at IS NOT NULL;

CREATE TABLE content_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    source_type TEXT NOT NULL,        -- 'crawled', 'stock', 'ai_generated'
    source_provider TEXT,             -- 'unsplash', 'pexels', 'dall-e', 'flux'
    source_url TEXT,                  -- 원본 출처 URL
    alt_text TEXT,
    usage_type TEXT NOT NULL,         -- 'thumbnail', 'body', 'instagram'
    position INTEGER,                 -- 본문 내 위치 (순서)
    metadata JSONB,                   -- 크기, 포맷, 라이선스 정보
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_content_images_content ON content_images (content_id);

CREATE TABLE publications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id UUID REFERENCES contents(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,           -- 'blogger', 'instagram', 'threads'
    external_id TEXT,                 -- 플랫폼 측 게시물 ID
    external_url TEXT,                -- 발행된 게시물 URL
    status TEXT NOT NULL DEFAULT 'pending', -- pending, published, failed, deleted
    published_at TIMESTAMPTZ,
    error_message TEXT,               -- 실패 시 에러 내용
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_publications_content ON publications (content_id);
CREATE INDEX idx_publications_platform ON publications (platform, status);
```

---

## Phase 2: 핵심 파이프라인 구현 (주제 발굴 → AI 생성)

### 2-1. 트렌드 분석 서비스

**백엔드 (`trend_service.py`)**
- Google Trends 분석: `google-trends-api-toolkit` 사용
  - 키워드 인기도 추이 (최근 7일/30일/90일)
  - 연관 키워드 추출
  - 지역별 관심도 (한국 기준)
- YouTube Data API v3 분석:
  - 키워드 관련 최근 영상 검색
  - 구독자 대비 조회수 비율로 "떠오르는 주제" 판별
  - 영상 제목/태그에서 추가 키워드 추출
- **캐싱 전략**: 동일 키워드 재검색 시 `keywords.cached_at` 기준 24시간 이내면 캐시 반환. Redis(Upstash)에 인기 키워드 TTL 캐싱.

**프론트 (`/topics`)**
- 키워드 입력 → 트렌드 점수 + 관련 키워드 카드 그리드
- 각 카드: 키워드, 검색량 그래프(미니 차트), 경쟁도 배지, YouTube 인기 영상 썸네일
- "이 주제로 콘텐츠 생성" 버튼 → 에디터로 이동

### 2-2. 크롤링 서비스

**백엔드 (`crawl_service.py`)**
- 선택한 키워드로 Google 검색 상위 5-10개 블로그 크롤링
- 추출 대상:
  - 본문 텍스트 (HTML 구조 유지)
  - 이미지 URL + alt 텍스트
  - 메타 태그 (title, description)
- **주의 사항**:
  - `robots.txt` 준수
  - 크롤링 간격 1-2초 딜레이
  - User-Agent 명시
  - 크롤링된 이미지는 참고용으로만 사용 (저작권 안내 UI 표시)

### 2-3. AI 콘텐츠 생성 서비스

**백엔드 (`ai_service.py`)**
- **Claude API (주력)**: 본문 생성
  - 입력: 키워드 + 크롤링된 참고 자료 + 톤 프리셋 프롬프트 + SEO 지침
  - 출력: HTML 형태의 블로그 본문 (H2/H3 구조화, 이미지 삽입 위치 마커 포함)
  - 프롬프트 구조:
    ```
    시스템: 톤 프리셋 + SEO 가이드라인
    사용자: 키워드 + 참고 자료 요약 + 원하는 분량/구조
    ```
- **OpenAI API (보조)**: SEO 메타데이터 생성
  - SEO 제목 (60자 이내)
  - 메타 설명 (155자 이내)
  - 태그/키워드 추출 (5-10개)
  - 구조화된 JSON 응답 (`response_format: json`)
- **부분 재생성**: 특정 문단만 선택하여 AI 재작성 요청 가능
- **Redis 캐싱**: 동일 키워드+톤 조합의 응답을 30분 TTL로 캐싱 (비용 절감)

### 2-4. 이미지 서비스

**백엔드 (`image_service.py`)**
- **탭 1 - 크롤링 이미지**: `crawl_service`에서 수집한 이미지 목록 반환 (출처 URL 포함)
- **탭 2 - 무료 스톡**: Unsplash/Pexels API 키워드 검색
  - 적정 해상도(1200x630 이상) 필터링
  - 라이선스 정보 포함
- **탭 3 - AI 생성**: DALL-E 3 / FLUX API
  - 키워드 기반 자동 프롬프트 생성
  - 썸네일용(16:9), 본문용(4:3), 인스타용(1:1) 비율 옵션
- **이미지 저장**: Supabase Storage에 선택된 이미지 업로드 → CDN URL 반환

---

## Phase 3: 콘텐츠 편집기 및 배포

### 3-1. 콘텐츠 편집기 (`/editor/[id]`)

**핵심 컴포넌트:**
- **Tiptap 리치 텍스트 에디터**
  - 커스텀 노드: 이미지 블록 (캡션 + 출처), CTA 버튼 블록
  - 툴바: 제목(H2/H3), 볼드, 리스트, 링크, 이미지 삽입, CTA 삽입
  - 부분 선택 → "AI 재생성" 플로팅 버튼
- **이미지 패널** (사이드 패널)
  - 3개 탭 (크롤링/스톡/AI) 전환
  - 드래그 앤 드롭으로 본문 내 이미지 배치
  - 썸네일 이미지 지정 (대표 이미지)
- **SEO 패널** (하단 또는 사이드)
  - SEO 제목, 메타 설명 편집
  - 태그 입력 (자동 추천 + 수동 추가/삭제)
  - SEO 점수 시각화 (제목 길이, 키워드 밀도 등 체크리스트)
- **CTA 설정**
  - 프리셋: 구독 유도, 더보기, 제휴 링크 (쿠팡 파트너스 등)
  - 위치: 본문 중간, 본문 하단 선택
  - 텍스트/URL 커스텀
- **미리보기 모드**
  - 블로그 미리보기 (실제 Blogger 스타일)
  - 인스타그램 미리보기 (이미지 + 캡션 변환)
- **발행 설정**
  - 카테고리/시리즈 선택
  - 즉시 발행 vs 예약 발행 (날짜/시간 선택)
  - 플랫폼 선택 (Blogger, Instagram 체크박스)
  - 출처 표기 방식 (하단 링크 포함/생략)

### 3-2. 배포 서비스

**백엔드 (`publish_service.py`)**
- **Blogger API v3**:
  - OAuth 2.0 인증 플로우
  - 포스트 생성 (HTML 본문, 라벨, 예약 시간)
  - 이미지는 Supabase Storage CDN URL 참조
- **Instagram Graph API**:
  - 블로그 본문 → 인스타 캡션 자동 변환 (AI 요약)
  - 이미지 비율 자동 조정 (1:1 크롭)
  - 해시태그 자동 생성
- **예약 발행**: `scheduled_at` 기반 — 백엔드에서 주기적 체크 (cron 또는 APScheduler)
- **에러 핸들링**: 실패 시 `publications.error_message`에 기록, 재시도 버튼 제공

---

## Phase 4: 관리 화면

### 4-1. 블로그 관리 (`/blog`)
- 콘텐츠 목록 (상태별 필터: 초안/검토중/예약/발행완료)
- 카테고리/시리즈 CRUD
- 발행 스케줄 캘린더 뷰
- 발행된 글의 외부 링크 바로가기

### 4-2. 대시보드 (`/`)
- 최근 발행 콘텐츠 카드 (최근 5건)
- 발행 현황 요약 (이번 주/이번 달 발행 수)
- 트렌드 키워드 요약 (최근 검색한 키워드 중 상승 추세)
- 빠른 액션: "새 주제 발굴", "초안 이어쓰기"

### 4-3. 설정 (`/settings`)
- **API 연결 관리**
  - 각 서비스별 API 키/토큰 입력 및 연결 상태 표시
  - Blogger OAuth 연결/해제
  - Instagram 비즈니스 계정 연결
- **블로그 설정**
  - 기본 Blogger 블로그 선택
  - 기본 카테고리/라벨 매핑
- **톤 프리셋 관리**
  - 기본 제공: 정보 전달형, 대화체, 전문가 톤
  - 커스텀 톤 추가/편집 (프롬프트 직접 수정)
- **CTA 프리셋 관리**
  - 자주 쓰는 CTA 템플릿 저장
- **기본 SEO 설정**
  - 기본 태그, 출처 표기 방식 기본값

---

## Phase 5 (추후): 확장

- YouTube 탭 구현 (영상 스크립트 기반 블로그 변환)
- Threads 배포 연동
- n8n 워크플로우 통합 (파이프라인 복잡도 증가 시)
- 멀티유저/SaaS 전환 (Supabase Auth + Stripe)
- 성과 분석 (Google Analytics API 연동, AdSense 수익 추적)

---

## 원본 문서 대비 보완 사항

| 영역 | 원본에서 누락/미비 | 보완 내용 |
|------|------------------|----------|
| **DB 스키마** | 컬럼 정의, 인덱스, 관계 없음 | 전체 DDL + 인덱스 + FK 관계 정의 |
| **프론트 상태관리** | 미정 | Zustand + TanStack Query 선정 |
| **리치 텍스트 에디터** | "에디터" 언급만 | Tiptap 선정 + 커스텀 노드(CTA, 이미지 블록) 설계 |
| **AI 프롬프트 구조** | "Claude로 생성" 수준 | 시스템/사용자 프롬프트 분리, 부분 재생성, 캐싱 전략 |
| **이미지 저장소** | 미정 | Supabase Storage → CDN URL 파이프라인 |
| **인증 플로우** | "Blogger API" 언급만 | OAuth 2.0 플로우 + 토큰 갱신 로직 명시 |
| **예약 발행** | "예약 발행" 언급만 | APScheduler 기반 주기적 체크 + 재시도 로직 |
| **에디터 UX** | 검토 항목 리스트만 | 컴포넌트별 구체적 UI 구조 + 인터랙션 설계 |
| **SEO 최적화** | "SEO 메타" 수준 | SEO 점수 체크리스트 시각화, 제목 길이/키워드 밀도 검증 |
| **캐싱 전략** | "Redis 캐싱" 언급만 | 키워드 캐시 24h TTL, AI 응답 30분 TTL 구체화 |
| **에러 핸들링** | 없음 | 배포 실패 기록 + 재시도 UX |
| **프로젝트 구조** | 없음 | 전체 디렉토리 트리 + 파일별 역할 정의 |
| **백엔드 패키지 매니저** | 미정 | uv 선정 (빠르고 모던한 Python 패키지 관리) |
| **폼/검증** | 없음 | React Hook Form + Zod 선정 |

---

## 구현 순서 (권장)

```
Phase 1 (셋업)           ██░░░░░░░░░░░░░░░░░░
  ├─ 모노레포 생성
  ├─ Next.js + FastAPI 보일러플레이트
  ├─ Supabase 프로젝트 + DB 마이그레이션
  ├─ Docker Compose (로컬 개발)
  └─ 환경변수 + .env 설정

Phase 2 (핵심 파이프라인)  ░░░░██████████░░░░░░
  ├─ 트렌드 분석 (백엔드 API + 프론트 UI)
  ├─ 크롤링 서비스
  ├─ AI 콘텐츠 생성 서비스
  └─ 이미지 서비스

Phase 3 (편집 + 배포)     ░░░░░░░░░░░░████████
  ├─ Tiptap 에디터 + 이미지 패널
  ├─ SEO 패널 + CTA 설정
  ├─ 미리보기 모드
  ├─ Blogger 배포
  └─ Instagram 배포

Phase 4 (관리 화면)       ░░░░░░░░░░░░░░░░████
  ├─ 블로그 관리 + 캘린더
  ├─ 대시보드
  └─ 설정 화면
```

---

## 검증 방법

1. **Phase 1 완료 검증**: `docker-compose up`으로 프론트/백엔드 동시 기동, Supabase 연결 확인
2. **Phase 2 완료 검증**: 키워드 입력 → 트렌드 데이터 조회 → AI 초안 생성까지 E2E 동작
3. **Phase 3 완료 검증**: 에디터에서 초안 편집 → 이미지 배치 → Blogger에 실제 포스팅 발행
4. **Phase 4 완료 검증**: 대시보드에서 발행 현황 확인, 설정에서 API 키 변경 후 정상 동작

---

## gstack 스킬 & 에이전트 역할 매핑

프로젝트 각 단계에서 gstack 스킬을 **담당자 역할**로 활용한다.

### 역할별 스킬 배치

| 역할 | gstack 스킬 | 담당 업무 |
|------|-------------|----------|
| **CEO / 프로덕트 오너** | `/gstack-plan-ceo-review` | 제품 비전 검증, 스코프 조정, "10-star 제품" 관점으로 플랜 챌린지 |
| **CTO / 엔지니어링 매니저** | `/gstack-plan-eng-review` | 아키텍처 리뷰, 데이터 플로우, 엣지 케이스, 테스트 커버리지, 성능 설계 |
| **디자인 디렉터** | `/gstack-design-consultation` | 디자인 시스템 수립 (컬러, 타이포, 레이아웃), DESIGN.md 생성 |
| **디자인 QA** | `/gstack-design-review` | 시각적 일관성 검수, 스페이싱/계층 구조 문제 발견 및 수정 |
| **보안 책임자 (CSO)** | `/gstack-cso` | OWASP Top 10, STRIDE 위협 모델링, API 키 관리 보안 감사 |
| **QA 엔지니어** | `/gstack-qa` | 웹앱 체계적 테스트, 버그 발견 및 자동 수정, 헬스 스코어 리포트 |
| **코드 리뷰어** | `/gstack-review` | PR 리뷰 (SQL 안전성, LLM 신뢰 경계, 조건부 부작용 검출) |
| **릴리즈 매니저** | `/gstack-ship` | 버전 범핑, CHANGELOG 업데이트, PR 생성 및 푸시 |
| **배포 엔지니어** | `/gstack-land-and-deploy` | PR 머지 → CI 대기 → 프로덕션 배포 → 헬스 체크 |
| **SRE / 모니터링** | `/gstack-canary` | 배포 후 카나리 모니터링, 콘솔 에러/성능 이상 감지 |
| **성능 엔지니어** | `/gstack-benchmark` | 페이지 로드 타임, Core Web Vitals, 번들 사이즈 추적 |
| **디버거** | `/gstack-investigate` | 버그 근본 원인 조사 (4단계: 조사 → 분석 → 가설 → 구현) |
| **테크 라이터** | `/gstack-document-release` | 배포 후 문서 업데이트 (README, ARCHITECTURE, CHANGELOG) |
| **스크럼 마스터** | `/gstack-retro` | 주간 회고, 커밋 히스토리 분석, 생산성 트렌드 |
| **자동 리뷰 파이프라인** | `/gstack-autoplan` | CEO → 디자인 → 엔지니어링 리뷰를 한 번에 자동 실행 |

### Phase별 스킬 활용 워크플로우

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 0: 플랜 검증                                           │
│                                                             │
│  /gstack-plan-ceo-review  →  제품 비전/스코프 검증              │
│  /gstack-plan-eng-review  →  아키텍처/기술 설계 검증             │
│  /gstack-autoplan         →  위 리뷰 자동 순차 실행             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Phase 1: 프로젝트 셋업                                        │
│                                                             │
│  /gstack-design-consultation → 디자인 시스템 (DESIGN.md) 수립   │
│  /gstack-cso                → API 키 관리/환경변수 보안 감사     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Phase 2-3: 핵심 기능 구현                                      │
│                                                             │
│  (개발 중)                                                    │
│  /gstack-investigate   →  버그 발생 시 근본 원인 조사            │
│                                                             │
│  (기능 완성 후)                                                │
│  /gstack-qa            →  각 기능별 QA + 자동 수정              │
│  /gstack-design-review →  UI/UX 시각적 검수 + 자동 수정         │
│  /gstack-benchmark     →  에디터/대시보드 성능 베이스라인 측정     │
│  /gstack-review        →  PR 코드 리뷰                        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Phase 4: 배포                                                │
│                                                             │
│  /gstack-ship             →  PR 생성 + 버전/CHANGELOG          │
│  /gstack-land-and-deploy  →  머지 → 배포 → 헬스체크             │
│  /gstack-canary           →  프로덕션 카나리 모니터링             │
│  /gstack-document-release →  문서 동기화                       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ 주기적                                                       │
│                                                             │
│  /gstack-retro     →  주간 회고 (생산성, 코드 품질 트렌드)        │
│  /gstack-cso       →  월간 보안 감사 (종합 스캔)                 │
│  /gstack-benchmark →  PR마다 성능 회귀 체크                     │
└─────────────────────────────────────────────────────────────┘
```

### 추천 실행 순서 (Phase 0 - 지금 바로)

플랜이 확정되었으므로, 구현 시작 전 아래 순서로 리뷰를 돌리는 것을 추천:

1. **`/gstack-plan-ceo-review`** — 제품 비전이 충분히 야심찬지, 스코프가 적절한지 검증
2. **`/gstack-plan-eng-review`** — 아키텍처/DB 설계/API 구조가 견고한지 검증
3. **`/gstack-design-consultation`** — Phase 1 시작 시 디자인 시스템부터 수립

또는 **`/gstack-autoplan`** 으로 1-2를 한 번에 자동 실행 가능.

---

## 확정 사항

- [x] 프로젝트 생성 위치: `~/projects/content-autopilot`
- [x] GitHub: Private 레포 생성
- [x] 구현 시작: 다음 세션에서 Phase 1부터 진행

## 미확정 사항 (추후 논의)

- [ ] 배포 환경 확정 (Vercel Free vs Pro, Railway vs Render)
- [ ] API 비용 월 예산 (Claude API, DALL-E, Upstash Redis)
- [ ] 도메인 여부 (커스텀 도메인 or Vercel 기본)

---

## GSTACK REVIEW REPORT

| Review | Trigger | Runs | Status | 핵심 발견 |
|--------|---------|------|--------|----------|
| CEO Review | `/plan-ceo-review` | 1 | DONE | MVP 스코프 과대, 차별화 부재, 실사용 검증 선행 필요 |
| Eng Review | `/plan-eng-review` | 1 | DONE | 인증 P0 누락, 비동기 처리 필수, DB 스키마 제약 조건 미비 |
| Design Review | `/plan-design-review` | 1 | DONE | 에디터 인지 과부하, 온보딩 설계 부재, UX 상태 패턴 전무 |

---

### CEO 리뷰 요약

**핵심 메시지: 도구를 만들기 전에 글을 먼저 써라.**

1. **MVP가 너무 크다.** 현재 플랜은 V2에 가깝다. 진짜 MVP는 "CLI 스크립트 하나: 키워드 → Claude API → 블로그 글 → Blogger 발행"이면 하루 만에 동작한다.

2. **차별화 포인트가 없다.** Jasper, Koala.sh, Surfer SEO 등 이미 존재하는 경쟁사 대비 뚜렷한 차별화가 없다. 한국 시장 특화(네이버 블로그, 쿠팡 파트너스, 한국어 SEO)가 유력한 방향.

3. **검증 안 된 가정들:**
   - AI 콘텐츠가 Google SEO에서 효과적인가? (Helpful Content Update 이후 필터링 강화)
   - Google 검색 크롤링은 ToS 위반 (SerpAPI 같은 대안 필요)
   - Claude + OpenAI 두 API가 필요한가? (Claude 하나로 통일 가능)
   - Instagram은 MVP에서 제거 권장 (Facebook 앱 심사만 1주)

4. **기술 스택 단순화 권장:**
   - Next.js API Routes로 백엔드 통합 (FastAPI 제거)
   - SQLite로 시작 (Supabase 불필요)
   - textarea + 마크다운 (Tiptap 에디터 = 시간 블랙홀)

5. **SaaS 전환은 잊어라 (지금은).** 6개월 실사용 데이터 이후 판단.

---

### 엔지니어링 리뷰 요약

**핵심 메시지: 기능은 잘 정리됐지만 비기능 요구사항(보안, 성능, 테스트)이 빠져서 "배포 불가능" 상태.**

**P0 (구현 전 반드시 해결):**
- **인증이 전혀 없다.** 배포하면 URL 아는 누구나 API 키, 콘텐츠 전체에 접근. Supabase Auth 또는 최소 Bearer token 필수.

**P1 (설계 반영 필요):**
- **비동기 처리 패턴 없음.** 크롤링(10-20초) + AI 생성(10-30초) + 이미지(15-60초) = 동기 HTTP로 불가. FastAPI BackgroundTasks + SSE 필수.
- **API 키 암호화 전략 없음.** `api_connections.credentials`에 application-level encryption 필요.
- **Claude streaming 미사용.** 본문 생성 시 streaming → SSE로 실시간 타이핑 효과 필수.

**P2 (DB/API 보완):**
- `keywords.keyword`에 UNIQUE 제약 없음 → 캐시 로직 무의미
- `contents.status` 등 TEXT 컬럼에 CHECK 제약 없음
- `updated_at` 자동 갱신 트리거 없음 (moddatetime 확장 사용)
- 목록 API에 N+1 위험 (콘텐츠 + 이미지 + 발행상태 JOIN 필요)
- 페이지네이션 전략 없음
- 프론트-백 API 타입 동기화 방법 없음 (OpenAPI codegen 필요)
- CORS 설정 전략 없음
- 크롤링 SSRF 위험 (인증 없이 임의 URL 크롤링 가능)
- 테스트 전략 전무 (자동 테스트 0개)
- CI/CD 파이프라인 없음

**병렬 구현 가능:**
- Lane A (프론트 중심): 트렌드+크롤링 → 에디터
- Lane B (백엔드 중심): AI+이미지 서비스 + 배포 서비스
- 합류: Phase 4 관리 화면

---

### /autoplan 2차 리뷰 (2026-04-01)

**Phase 1 CEO 결론: 플랜을 Approach B (경량 웹앱)으로 단순화.**
- Next.js 풀스택 (API Routes) + SQLite + textarea 에디터
- Instagram/Threads 제거, Redis/Supabase 제거, FastAPI 제거, Tiptap 제거
- 핵심: 키워드 조회 → Claude 글 생성 → Blogger 발행

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|---------------|-----------|-----------|----------|
| 1 | CEO | FastAPI → Next.js API Routes | Mechanical | P5 (explicit) | 단일 사용자 도구에 두 서버 불필요 | FastAPI 유지 |
| 2 | CEO | Supabase → SQLite | Mechanical | P5 (explicit) | 단일 사용자에 관리형 DB 과설계 | Supabase |
| 3 | CEO | Tiptap → textarea + markdown | Mechanical | P3 (pragmatic) | 에디터 커스터마이징은 시간 블랙홀 | Tiptap |
| 4 | CEO | Instagram 제거 | Mechanical | P3 (pragmatic) | Facebook 심사 1주, MVP 가치 낮음 | Instagram 포함 |
| 5 | CEO | Redis 제거 | Mechanical | P5 (explicit) | SQLite + 인메모리 캐시로 충분 | Redis |
| 6 | CEO | Claude 단일 API | Mechanical | P4 (DRY) | Claude + OpenAI 두 API 불필요 | 듀얼 API |
| 7 | CEO | Bearer token 인증 추가 | Mechanical | P1 (completeness) | 인증 없이 배포 불가 | 인증 없음 |
| 8 | CEO | 네이버 블로그 우선 검토 | Taste | P3 (pragmatic) | 한국 시장에서 Blogger만으로 불충분할 수 있음 | Blogger only |
| 9 | Design | 플랜 전체 리라이트 필요 | Mechanical | P1 (completeness) | 현재 플랜이 단순화된 스택을 반영하지 않음 | 부분 수정 |
| 10 | Design | SQLite 스키마 재작성 | Mechanical | P5 (explicit) | PostgreSQL 전용 문법(UUID, JSONB, TEXT[]) SQLite 호환 불가 | PG 스키마 유지 |
| 11 | Design | textarea → HTML 파이프라인 확정 | Mechanical | P5 (explicit) | Markdown 입력 → HTML 변환으로 확정 | Raw HTML |
| 12 | Design | Next.js API Routes 구조 정의 | Mechanical | P1 (completeness) | FastAPI 제거 후 API 설계 공백 | FastAPI 참조 유지 |
| 13 | Design | 첫 실행 온보딩 위자드 추가 | Mechanical | P1 (completeness) | Claude API 키 → Blogger 연결 → 첫 키워드 3단계 | 설정 화면 몰아넣기 |
| 14 | Design | AI 생성 중 streaming UX | Mechanical | P1 (completeness) | 5-30초 대기 중 UX 전무 | 로딩 스피너만 |
| 15 | Design | empty/loading/error 상태 전체 정의 | Mechanical | P1 (completeness) | 모든 페이지에 상태 패턴 필요 | happy path only |
| 16 | Design | Claude 프롬프트 템플릿 실제 작성 | Taste | P1 (completeness) | 제품 핵심 IP인데 "설명"만 있고 실제 프롬프트 없음 | 추후 작성 |

---

### 디자인 리뷰 요약

**전체 평가: 4/10. 백엔드는 탄탄, 프론트는 "이런 화면이 있다" 수준에서 멈춤.**

| 차원 | 점수 | 핵심 이슈 |
|------|------|----------|
| 정보 구조 | 5/10 | 크롤링 결과 화면 누락, /blog 과부하 |
| 사용자 플로우 | 3/10 | 키워드→에디터 중간 단계 전무, AI 생성 대기 UX 없음 |
| 에디터 UX | 4/10 | 인지 과부하, 레이아웃 미결정 |
| 이미지 관리 | 5/10 | 탭 구조 OK, 저작권/비용 피드백 없음 |
| 대시보드 | 5/10 | 단일 사용자에 부적합한 메트릭 |
| 모바일/반응형 | 0/10 | 언급 없음 |
| 온보딩 | 1/10 | 6개 API를 설정 화면에 몰아넣음 |
| 접근성 | 1/10 | 언급 없음 |
| UX 상태 패턴 | 1/10 | empty/loading/error 상태 전무 |

**우선 수정:**
1. **콘텐츠 생성 위자드** 설계 (키워드 → 크롤링 → 톤 선택 → AI 생성 → 에디터)
2. **에디터 레이아웃 확정** — 탭 기반 사이드 패널 추천 (한 번에 하나만 표시)
3. **모든 화면에 empty/loading/error 상태** 추가
4. **점진적 온보딩** — 처음에 Claude API 키 하나만 → 기능 사용 시 추가 연결 요청
5. **모바일 전략** — 에디터는 데스크톱 전용, 대시보드/목록은 반응형
6. **접근성** — 드래그앤드롭 키보드 대안, SEO 점수 색상+텍스트 조합
