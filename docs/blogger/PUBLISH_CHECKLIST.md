# Blogger 콘솔 게시 체크리스트

> AdSense 신청 차단점 (Pages 3종 + GSC 색인) 해제용. 사용자 액션 가이드.

대상 사이트: `apt-signal.blogspot.com` (부동산시그널)

---

## 1. Pages 3종 게시

각 파일을 Blogger 콘솔의 페이지로 게시한다.

### 절차 (각 파일 공통)
1. https://www.blogger.com 로그인 → 부동산시그널 선택
2. 좌측 메뉴 → **페이지** → **새 페이지** 클릭
3. 우상단 편집 모드를 **"HTML 보기"** 로 전환 (펜 아이콘 옆 `<>` 토글)
4. 아래 표의 HTML 파일 내용을 그대로 복사해 붙여넣기
5. 페이지 제목 입력 (아래 표 참고)
6. 우상단 **게시** 클릭
7. 게시 후 URL 확인 (보통 `/p/<slug>.html`)

### 게시 대상

| # | 파일 | 페이지 제목 | 권장 slug | placeholder 채움 필요 |
|---|---|---|---|---|
| 1 | `docs/blogger/about.html` | 부동산시그널 소개 | `about` | 없음 (그대로 게시) |
| 2 | `docs/blogger/privacy.html` | 개인정보 처리방침 | `privacy` | 없음 (그대로 게시) |
| 3 | `docs/blogger/contact.html` | 문의 (Contact) | `contact` | `{{CONTACT_EMAIL}}`, `{{GOOGLE_FORM_URL}}`, `{{X_HANDLE}}` (없는 항목은 해당 섹션 통째로 삭제) |

### Contact 페이지 placeholder 처리

```
{{CONTACT_EMAIL}}      → 실제 이메일 (예: aptsignal@gmail.com)
{{GOOGLE_FORM_URL}}    → Google Form URL (없으면 "Google Form (선택)" 섹션 전체 삭제)
{{X_HANDLE}}           → X(Twitter) 핸들 (없으면 "X (구 Twitter)" 섹션 전체 삭제)
```

권장: 별도 alias 이메일을 만들어 노출 (`aptsignal@gmail.com` 류). 메인 이메일 직접 노출은 스팸 위험.

---

## 2. 페이지를 메뉴에 노출 (네비게이션 추가)

페이지 게시만 하면 사이트 메뉴에 자동으로 보이지 않을 수 있다. AdSense 검토자가 한눈에 찾을 수 있도록 메뉴에 노출시킨다.

### 절차
1. 좌측 메뉴 → **레이아웃**
2. 헤더 바로 아래 영역(또는 사이드바)에서 **가젯 추가** → **페이지** 가젯
3. About / Privacy / Contact 3개 페이지 체크
4. 저장

확인: 사이트 홈페이지 새로고침 → 헤더 아래 메뉴에 3개 링크 노출 여부.

---

## 3. GSC 색인 차단 해제 (REDIRECT_ERROR fix)

`docs/retro/2026-04-28-mid-review.md` § 7.6.1 참고.

### Step 3-1. Blogger 콘솔: 국가별 리디렉션 OFF

1. Blogger 콘솔 → 좌측 **설정**
2. 아래로 스크롤 → **"국가별 리디렉션"** 섹션
3. **"국가별 리디렉션 사용 안 함"** 토글을 **ON**으로 활성화
   - 핵심 fix: Googlebot이 위치별로 다른 응답을 받지 않도록 차단
4. 같은 화면 → "비공개" 섹션 → "검색엔진에 노출되도록 허용" ON 확인

### Step 3-2. GSC URL Inspection 색인 요청 (일일 quota 10~12개)

1. https://search.google.com/search-console 접속 → 부동산시그널 속성 선택
2. 좌측 **URL 검사**
3. 아래 URL을 차례대로 입력 → "라이브 URL 테스트" → "색인 요청"
4. 우선순위:
   - 홈페이지 `https://apt-signal.blogspot.com/`
   - About `https://apt-signal.blogspot.com/p/about.html` (게시 후)
   - Privacy `https://apt-signal.blogspot.com/p/privacy.html` (게시 후)
   - Contact `https://apt-signal.blogspot.com/p/contact.html` (게시 후)
   - 최근 게시글 7~8건 (최신순)

### Step 3-3. 24~72시간 후 재확인

```bash
node --env-file=.env.local scripts/mid-review/inspect.mjs
```

기대값: `pageFetchState`가 `REDIRECT_ERROR` → `SUCCESSFUL` 전환, `coverageState`가 `리디렉션 오류` → `URL이 Google에 등록되어 있음`.

---

## 4. AdSense 신청 시점 판단

다음 4가지 조건을 모두 만족할 때 신청한다.

| 조건 | 측정 |
|---|---|
| ✅ Pages 3종 게시 + 메뉴 노출 | Step 1·2 완료 |
| ✅ 홈페이지 색인 회복 | GSC URL Inspection이 `URL이 Google에 등록되어 있음` |
| ✅ 게시물 25건 이상 | `sqlite3 data/blog.db "SELECT COUNT(*) FROM published_posts WHERE platform='blogger_as'"` ≥ 25 |
| ✅ 운영 기간 4주 이상 (권장) | 4/26 시작 → 5/24 도달이 안전. 5/6 시점에는 1주 운영, 가속 가능하나 거절 risk 다소 ↑ |

### AdSense 신청 절차

1. https://www.google.com/adsense/start 접속
2. 사이트 추가 → `apt-signal.blogspot.com`
3. 국가/주소/계정 정보 입력 (광고 수익 송금용)
4. 사이트 코드 추가 — Blogger의 경우 콘솔 → 수익 메뉴에서 자동 연동 가능
5. 검토 대기 (보통 1~2주, AI 콘텐츠 시 더 길어질 수 있음)

### 거절될 경우 흔한 사유

- 콘텐츠 부족 → 글 수 + 운영 기간 확보 후 재신청
- "가치 있는 인벤토리 부족" → AI 패턴 강하게 보임 → 글 quality 보강 (출처 강화 / 개인 의견 추가 / 이미지 자체 제작)
- 정책 위반 (저작권 등) → 개별 글 검토

---

## 5. 후속 자동화 (선택)

Pages 게시 + 색인 회복 후 다음 사항을 코드로 통합할 수 있다.

- `scripts/mid-review/inspect.mjs`에 Pages 3종 URL 자동 포함
- `scripts/auto-publish.ts`에서 신규 글 게시 시 GSC URL Inspection 색인 요청 자동 호출 (Indexing API는 일반 페이지 미지원, URL Inspection API는 read-only — 자동화 어려움. 대신 sitemap.xml ping 자동화는 가능)
- AdSense 승인 후 광고 단위 코드 삽입 자동화

이건 5/6 평가 이후 의제로 분리 가능.
