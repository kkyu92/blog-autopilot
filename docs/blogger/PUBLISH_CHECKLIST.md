# Blogger 콘솔 게시 체크리스트

> AdSense 신청 차단점 (Pages 3종 + GSC 색인) 해제용. 사용자 액션 가이드.

대상 사이트: `apt-signal.blogspot.com` (부동산시그널)

---

## 1. Pages 3종 게시

각 파일을 Blogger 콘솔의 페이지로 게시한다.

> ⚠️ **Blogger 2024+ Pages는 제목 무관 `/p/blog-page*.html` slug 자동 생성**. 영어 제목 트릭, 한국어 제목 모두 무효. URL은 페이지 생성 순서·내부 ID에 따라 결정되며 사후 변경 불가. 4/29 본 프로젝트 실측 결과:
>
> - 1번째 게시: `/p/blog-page.html`
> - 2번째 게시: `/p/blog-page_29.html` (또는 다른 숫자)
> - 3번째 게시: `/p/blog-page_86.html` (또는 다른 숫자)
>
> → 본문 내부 링크는 게시 후 실제 URL을 확인한 뒤 정정해야 한다.

### 절차 (각 파일 공통)
1. https://www.blogger.com 로그인 → 부동산시그널 선택
2. 좌측 메뉴 → **페이지** → **새 페이지** 클릭
3. 제목 입력 (한국어 가능): "부동산시그널 소개" / "개인정보 처리방침" / "문의 (Contact)"
4. 우상단 편집 모드 토글에서 **"HTML 보기"** 선택 (작성 모드 아님)
5. 본문 영역에 보이는 placeholder `<p>&nbsp;</p>`를 **Cmd+A → Delete**로 비운 뒤, HTML 파일 내용을 통째로 붙여넣기 (Cmd+V)
6. 우상단 **게시** 클릭
7. **"보기"** 버튼으로 실제 URL 확인 → 메모해 둘 것 (예: `/p/blog-page.html`)

> ⚠️ 주의: 게시 후 **HTML 보기와 작성 모드를 토글하지 말 것**. Blogger가 HTML을 망가뜨리는 경우가 있다. 미리보기 버튼은 안전.

### 게시 대상

| # | 파일 | 페이지 제목 | 실제 URL (4/29 측정) | placeholder 채움 |
|---|---|---|---|---|
| 1 | `docs/blogger/about.html` | 부동산시그널 소개 | `/p/blog-page.html` | 없음 |
| 2 | `docs/blogger/privacy.html` | 개인정보 처리방침 | `/p/blog-page_29.html` | 없음 |
| 3 | `docs/blogger/contact.html` | 문의 (Contact) | `/p/blog-page_86.html` | `{{CONTACT_EMAIL}}`, `{{GOOGLE_FORM_URL}}`, `{{X_HANDLE}}` |

> 본 repo의 about.html / privacy.html은 위 실제 URL에 맞춰 내부 링크가 박혀 있다. 신규 게시 시 URL이 다르게 나오면 (일반적으로 그러함) 본문의 `<a href="/p/blog-page_29.html">` 등을 실제 URL로 수정한 뒤 게시한다.

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
3. 자동 감지 영역에 페이지 3종이 안 뜨면 → **외부 링크 직접 입력** (Blogger 페이지 가젯 자동 감지가 늦거나 안 되는 경우 흔함)
4. 외부 링크 3개 등록 (4/29 측정 URL 기준):
   - 소개 → `https://apt-signal.blogspot.com/p/blog-page.html`
   - 개인정보처리방침 → `https://apt-signal.blogspot.com/p/blog-page_29.html`
   - 문의 → `https://apt-signal.blogspot.com/p/blog-page_86.html`
5. 저장

> ⚠️ 메뉴에 `/p/about.html` 같은 가짜 깔끔한 slug를 넣으면 클릭 시 홈페이지 fallback (soft 404). 반드시 위 실제 `/p/blog-page*.html` URL로 등록한다.

확인: 사이트 홈페이지 새로고침 → 헤더 아래 메뉴 클릭 → 각 페이지로 정상 이동 여부.

### 대안: HTML/JavaScript 가젯

페이지 가젯이 잘 작동 안 하면 HTML 가젯으로 직접 메뉴를 그릴 수도 있다.

```html
<ul style="display:flex;gap:20px;list-style:none;padding:10px;margin:0;justify-content:center;">
  <li><a href="/p/blog-page.html">소개</a></li>
  <li><a href="/p/blog-page_29.html">개인정보처리방침</a></li>
  <li><a href="/p/blog-page_86.html">문의</a></li>
</ul>
```

---

## 3. GSC 색인 차단 해제 (REDIRECT_ERROR fix)

> ⚠️ `docs/retro/2026-04-28-mid-review.md` § 7.6.1는 root cause를 "Blogger 국가별 리디렉션"으로 추정했지만, **그 토글은 2018년 전후 신규 블로그에서 제거된 deprecated 기능**이라 콘솔에 존재하지 않는다. evidence(curl)는 모바일 separate URL (`?m=1`) redirect를 가리키며, 이게 진짜 root cause로 보인다. 아래 Step 3-1은 § 7.6.1과 다르게 "모바일 테마 비활성화"로 정정한다.

### Step 3-1. Blogger 콘솔: 모바일 separate URL 비활성화

**위치**: 좌측 메뉴 → **테마(Theme)** (설정 메뉴 아님)

```
1. 좌측 사이드바에서 "테마" 클릭 (페인트 롤러 아이콘)
2. 화면 중앙에 현재 사용 중인 테마 카드가 보임
3. 카드의 우하단 또는 우측 ▼ 화살표(또는 톱니바퀴) → 클릭
4. 드롭다운에서 "모바일 설정" 선택
5. 팝업: "모바일 기기에서 어떤 테마를 표시하시겠습니까?"
   → "데스크톱" (No. Show desktop theme on mobile devices) 선택
   → "모바일" (분리된 모바일 테마)는 선택하지 말 것 ← 이게 ?m=1 유발
6. 저장
```

확인: 핸드폰에서 `https://apt-signal.blogspot.com/` 접속 → URL이 `?m=1`이 안 붙는지

⚠️ 사용 중인 테마가 반응형(modern)이 아니면 모바일 가독성 깨짐 — 깨지면 테마 → "Contempo" / "Notable" 등 반응형 테마로 교체.

### Step 3-1-bis. 검색엔진 노출 + 메타 태그 (보조)

**위치**: 좌측 메뉴 → **설정(Settings)** → 페이지 내 스크롤

- "비공개" 섹션 → "검색엔진에 표시" → ON 확인
- "메타 태그" 섹션 → "검색 설명 사용 설정" → ON
   - 검색 설명 입력 (예: `한국 아파트 시장의 정책·청약·재건축·세제 동향을 데이터 기반으로 정리하는 블로그`)
- "크롤러 및 색인 생성" → "맞춤 robots.txt 사용" → **OFF 유지** (잘못 건드리면 더 망함)

### Step 3-2. (참고용 — 무시 가능) 국가별 리디렉션

> 4/28 retro § 7.6.1는 이 토글을 추정 fix로 제시했으나, 신규 Blogger 블로그(2018+)에는 해당 옵션이 콘솔에 존재하지 않는다. 4/29 사용자 콘솔 확인에서도 토글 부재 확인. 이 항목은 더 이상 유효하지 않으므로 skip.

### Step 3-3. GSC URL Inspection 색인 요청 (일일 quota 10~12개)

1. https://search.google.com/search-console 접속 → 부동산시그널 속성 선택
2. 좌측 **URL 검사**
3. 아래 URL을 차례대로 입력 → "라이브 URL 테스트" → "색인 요청"
4. 우선순위:
   - 홈페이지 `https://apt-signal.blogspot.com/`
   - About `https://apt-signal.blogspot.com/p/about.html` (게시 후)
   - Privacy `https://apt-signal.blogspot.com/p/privacy.html` (게시 후)
   - Contact `https://apt-signal.blogspot.com/p/contact.html` (게시 후)
   - 최근 게시글 7~8건 (최신순)

### Step 3-4. 24~72시간 후 재확인

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
