# Content Autopilot - Claude Code 설정

## 프로젝트 개요
키워드 트렌드 기반 블로그 콘텐츠 자동 생성 도구 (단일 사용자 전용)

## 기술 스택 (확정)
- Next.js 15 (App Router + API Routes) - 풀스택
- SQLite (better-sqlite3 또는 Drizzle ORM)
- textarea + Markdown 에디터 (Tiptap 제거)
- Claude API (콘텐츠 생성)
- Blogger API v3 (발행)

## 환경별 역할
- **home**: 메인 실행 환경 (코드 작성, 테스트, 배포)
- **office**: 검토 & 지시 환경 (GitHub Issues, STATUS.md)

## 자동 승인 규칙
- 파일 생성/수정/삭제 → 자동 승인
- git commit & push → 자동 승인
- 패키지 설치 → 자동 승인
- 외부 API 호출 → 자동 승인

## 컨텍스트 공유
- STATUS.md: 작업 상태 추적 (autoplan 전용)
- GitHub Issues: 작업 단위 히스토리
- PLAN.md: 구현 플랜 (리뷰 결과 포함)

## 테스트
- (TBD - 프로젝트 셋업 후 설정)

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
