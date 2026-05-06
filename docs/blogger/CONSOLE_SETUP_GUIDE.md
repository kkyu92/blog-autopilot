# Blogger 콘솔 셋업 가이드 — AdSense 신청 전 점검

> 4/29 `PUBLISH_CHECKLIST.md` 후속 작업. 5/6 점검에서 발견된 누락 항목 + AdSense 사이트 통일성 강화.

대상: `apt-signal.blogspot.com` (부동산시그널)

---

## 1. 검색 설명 ON ⭐ 1순위

**왜 중요한가**: 라이브 점검 결과 `<meta name="description">` 누락. GSC 가 이 신호 없이는 사이트 quality 평가가 어렵고, AdSense 검토자도 사이트 정체성 판단 약해짐. **켜는 것만으로 GSC 회복 가속에도 영향**.

### 절차

1. https://www.blogger.com 로그인 → 부동산시그널 선택
2. 좌측 메뉴 → **설정**
3. 페이지 스크롤 → **메타 태그** 섹션
4. **"검색 설명 사용 설정"** 토글 → **ON**
5. 텍스트 입력 (아래 추천안 중 택1)
6. 저장

### 검색 설명 추천안 (3가지 길이)

**① 짧은 버전 (90자)** — 간결함 우선
```
한국 아파트 시장의 청약·재건축·세제·대출·정책 동향을 데이터 기반으로 정리하는 블로그
```

**② 중간 버전 (140자)** — 권장 ⭐
```
한국 아파트 시장의 청약·재건축·재개발·세제·대출·정책 동향을 데이터 기반으로 정리하는 블로그. 청약 일정, 분양가 분석, 시장 동향, 세무 가이드, 정책 변화를 매일 업데이트합니다.
```

**③ 긴 버전 (180자)** — SEO 폭 우선
```
한국 부동산 시장 분석 전문 블로그 — 청약, 재건축·재개발, 세금·절세, 대출, 시장 동향, 정책·법령을 데이터 기반으로 정리. 매일 업데이트, 신뢰할 수 있는 출처와 함께 실거주자·투자자에게 필요한 정보를 빠르게 전달합니다.
```

권장: **②** (검색 결과 스니펫 길이 + 키워드 6개 분포 + 업데이트 시그널)

---

## 2. Favicon 등록

**왜**: 브라우저 탭/검색 결과 아이콘. AdSense 검토자에게 "운영되는 사이트" 시그널.

### 파일 준비

본 repo 에 SVG 박제됨: `docs/blogger/favicon.svg`
- 짙은 네이비 배경 + 골드 빌딩 3개 + 신호 파동 (부동산시그널 정체성)
- 192×192 viewBox

### Blogger 가 요구하는 형식: PNG 192×192

SVG → PNG 변환:
1. https://favicon.io/favicon-converter/ 접속
2. SVG 업로드 (`docs/blogger/favicon.svg` 내용 복사 → "Edit SVG" 또는 직접 업로드)
3. 다운로드 → `favicon-192x192.png` 추출

또는 macOS 로컬 변환:
```bash
# rsvg-convert 없으면 Inkscape / Quicklook 으로
brew install librsvg  # 1회만
rsvg-convert -w 192 -h 192 docs/blogger/favicon.svg > /tmp/favicon-192.png
```

### Blogger 콘솔 업로드

1. 좌측 메뉴 → **설정** → **기본** 섹션
2. **파비콘 (Favicon)** → "변경" 또는 "이미지 선택"
3. PNG 업로드 → 저장
4. 새로고침 후 브라우저 탭에 아이콘 노출 확인 (캐시로 인해 24h 걸릴 수 있음)

---

## 3. 블로그 설명 (Subtitle)

**위치**: 설정 → 기본 → **설명**

추천 텍스트 (짧은 버전):
```
데이터 기반 한국 아파트 시장 분석 — 청약·재건축·세제·대출·정책
```

테마에서 헤더 아래 노출됨. 위 #1 의 검색 설명과 호환.

---

## 4. 라벨 통합 (21개 → 6개) ⭐ AdSense 통일성

현재 라벨이 fragmented (예: `재건축`/`재건축·재개발`/`재개발·재건축` 동일 주제 3개로 분산).

### 통합안

| 통합 라벨 | 글 수 |
|---|---|
| 청약 | 12건 |
| 시장분석 | 7건 |
| 세금·절세 | 6건 |
| 재건축·재개발 | 6건 |
| 정책·법령 | 2건 |
| 대출·전세 | 2건 |
| **합계** | **35건** |

### 자동 스크립트 (권장)

dry-run 으로 매핑 확인:
```bash
node --env-file=.env.local scripts/migration/relabel-as.mjs
```

문제 없으면 apply:
```bash
node --env-file=.env.local scripts/migration/relabel-as.mjs --apply
```

- 35건 × 1.5초 = 약 1분
- 매 호출 직전 fresh OAuth token (장기 batch RC 메모리 박제 패턴)
- DB `published_posts.category` 동시 동기화

### 수동 (스크립트 안 쓸 때)

Blogger 콘솔 → 게시물 → 좌측 라벨 트리 → 라벨 클릭 → 일괄 선택 → "라벨" 버튼 → 새 이름 입력 → 적용. 6개 통합 라벨 별로 반복.

---

## 5. 의제 박제 (지금 안 함)

### 사용자 정의 도메인 (선택)
- `apt-signal.blogspot.com` → `aptsignal.kr` 등
- AdSense 무관, 브랜드 강화. 1~2만원/년
- **AdSense 통과 후 의제**

### 테마 변경 (Soho/Notable)
- 5/8~5/9 GSC indexing 회복 신호 본 후 의제
- 별도 가이드 (B 옵션)

### 소셜 공유 가젯
- 레이아웃 → 가젯 추가 → "공유 버튼"
- 우선순위 낮음

---

## 작업 순서 권장

1. **오늘 (10분)**: 검색 설명 ON + Favicon 업로드 + 블로그 설명
2. **오늘~내일 (1분)**: 라벨 통합 스크립트 dry-run → apply
3. **5/7~5/8 (5분/일)**: GSC URL Inspection 색인 요청 (일일 quota)
4. **5/8~5/9**: GSC indexing 회복 신호 → 테마 변경 의제 진입

각 단계 완료 시 `inspect.mjs` 로 GSC 상태 재점검.

```bash
node --env-file=.env.local scripts/mid-review/inspect.mjs
```

---

## 검증 방법

작업 완료 후 라이브 검증:
```bash
curl -s -L -A "Mozilla/5.0" https://apt-signal.blogspot.com/ | grep -E 'meta name="description"|favicon|<title>'
```

기대값:
- `<meta name="description" content="한국 아파트 시장의...">`
- `<link rel="icon" href="...">`
- `<title>부동산시그널 - APT Signal</title>` (그대로)
