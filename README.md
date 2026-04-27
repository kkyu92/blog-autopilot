# Blog Autopilot

키워드 트렌드 기반 블로그 콘텐츠 자동 생성 도구. 키워드 입력 → Claude AI 초안 생성 → Markdown 편집 → 원클릭 Blogger/네이버 발행.

## 기술 스택

- Next.js 15 (App Router + API Routes)
- SQLite + Drizzle ORM
- Claude API (콘텐츠 생성)
- Google Trends API (키워드 트렌드)
- Blogger API v3 / 네이버 블로그 API

## 시작하기

```bash
# 의존성 설치
pnpm install

# 환경변수 설정
cp .env.example .env.local
# .env.local에 ANTHROPIC_API_KEY 등 입력

# DB 마이그레이션
pnpm drizzle-kit push

# 개발 서버 실행
pnpm dev
```

http://localhost:3000 접속 후 온보딩 가이드를 따라 설정합니다.

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `ANTHROPIC_API_KEY` | O | Claude API 키 |
| `GOOGLE_CLIENT_ID` | △ | Blogger OAuth (발행 시 필요) |
| `GOOGLE_CLIENT_SECRET` | △ | Blogger OAuth |
| `NAVER_CLIENT_ID` | △ | 네이버 OAuth (발행 시 필요) |
| `NAVER_CLIENT_SECRET` | △ | 네이버 OAuth |
| `GOOGLE_CSE_API_KEY` | X | 참고 자료 자동 수집 |
| `GOOGLE_CSE_ID` | X | 참고 자료 자동 수집 |
| `AUTH_TOKEN` | X | API 인증 (미설정 시 인증 없음) |

## 테스트

```bash
pnpm test
```

## 프로젝트 구조

```
src/
├── app/                # Next.js App Router
│   ├── api/           # API Routes
│   │   ├── content/   # 콘텐츠 CRUD + AI 생성
│   │   ├── keywords/  # 트렌드 + 검색
│   │   ├── publish/   # Blogger/네이버 발행
│   │   ├── auth/      # OAuth 플로우
│   │   └── settings/  # 설정 CRUD
│   ├── editor/[id]/   # Markdown 에디터
│   ├── topics/        # 키워드 탐색
│   ├── posts/         # 콘텐츠 목록
│   ├── settings/      # 설정 페이지
│   └── onboarding/    # 온보딩 위자드
├── components/        # UI 컴포넌트
├── hooks/             # React 훅
└── lib/               # 유틸리티
    ├── claude.ts      # Claude API 클라이언트
    ├── blogger.ts     # Blogger API
    ├── naver.ts       # 네이버 블로그 API
    ├── trends.ts      # Google Trends
    ├── sanitize.ts    # HTML 살균
    ├── tokens.ts      # OAuth 토큰 관리
    ├── schema.ts      # DB 스키마
    └── db.ts          # DB 연결
```
