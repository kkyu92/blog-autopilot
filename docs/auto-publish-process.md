# 블로그 자동 발행 프로세스

> blog-autopilot 프로젝트의 게시물 자동 생성·예약 발행 전체 흐름

---

## 1. 전체 구조 한눈에 보기

```
[GitHub Actions cron]
매일 KST 01:17
        │
        ▼
[macOS self-hosted runner (집 맥북)]
  scripts/auto-publish.ts 실행
        │
        ├── 키워드 선정 (Trends API)
        ├── 중복 체크 (SQLite DB)
        ├── 글 생성 (Claude CLI)
        ├── 품질 검토 (Editor AI)
        ├── 이미지 첨부 (Pixabay/Pexels)
        └── 예약 발행 (Blogger API v3)
                │
                ├── apt-signal.blogspot.com  (AS — 부동산)
                ├── trip-signal.blogspot.com (TS — 여행)
                └── health-signal.blogspot.com (HS — 건강)
```

---

## 2. 트리거

### 자동 실행 (cron)
- **스케줄**: 매일 UTC 16:17 = **KST 01:17**
- **플랫폼**: GitHub Actions (`auto-publish.yml`)
- **실행 환경**: 집 맥북 self-hosted runner (`home` 태그)

### 수동 실행 (workflow_dispatch)
GitHub Actions 화면 또는 `gh` CLI로 즉시 실행 가능:

```bash
gh workflow run auto-publish.yml \
  --field niche=all \
  --field slot_count=4 \
  --field mode=normal \
  --field runner=home
```

| 파라미터 | 옵션 | 기본값 |
|---|---|---|
| `niche` | `all` / `HS` / `TS` / `AS` | `all` |
| `slot_count` | 숫자 | `4` |
| `mode` | `normal` / `healthcheck-only` | `normal` |
| `runner` | `home` / `office` | `home` |

---

## 3. 발행 규모

| 항목 | 값 |
|---|---|
| 대상 niche 수 | 3개 (HS, TS, AS) |
| niche당 슬롯 수 | 4개 |
| **일일 목표 발행 수** | **12건** |
| 예약 발행 시간대 (KST) | 09:00 / 11:00 / 13:00 / 15:00 / 17:00 / 19:00 중 4개 배정 |

슬롯 시간은 niche 내에서 중복 없이 배정. cron이 새벽 01:17에 실행돼도 발행 예약 시각은 당일 낮~저녁.

---

## 4. 슬롯 1건 처리 흐름

```
1. 키워드 선정
   └── Trends API (Google Trends RSS + Zum 이슈 + Suggest)
   └── 최근 30일 발행 키워드 제외

2. 중복 체크
   ├── exact dedup: DB 조회 (동일 키워드 90일 금지)
   └── semantic dedup: 최근 발행 글과 의미 유사도 비교

3. 글 생성 (Claude CLI)
   ├── 프롬프트: prompts/agents/content-writer.md
   ├── 최대 2회 시도 (attempt 1 → schema 실패 시 revision_feedback 포함 재시도)
   └── 출력: JSON { title, slug, meta_description, content_html, word_count, ... }

4. 품질 검토 (Editor AI)
   ├── 채점: 0~100점
   └── revision_needed 판정 시 fallback (attempt 1 결과 구제)

5. 부가 데이터 주입
   ├── 이미지: Pixabay / Pexels API → content_html 삽입
   └── AS 전용: 국토교통부 실거래가 API (MOLIT) 데이터 주입

6. 예약 발행
   ├── Blogger API v3 — `posts.insert` with `status=SCHEDULED`
   ├── 발행 시각: KST 슬롯 시간 → UTC 변환
   └── DB 기록: published_posts 테이블 INSERT

7. 결과 집계
   └── success / failed / skipped 카운트 출력
```

---

## 5. Niche별 블로그

| Niche | 블로그 | 주제 |
|---|---|---|
| `AS` | apt-signal.blogspot.com | 부동산 · 청약 |
| `TS` | trip-signal.blogspot.com | 여행 · 관광 |
| `HS` | health-signal.blogspot.com | 건강 · 건강검진 |

---

## 6. 실패 처리

### 부분 실패 (슬롯 일부만 실패)
- 실패 슬롯은 `failed` 로 기록, 나머지는 계속 진행
- 워크플로우 종료 후 자동으로 GitHub Issue 생성 (슬롯별 실패 사유 포함)

### 타임아웃 / Cancel (전체 중단)
- `timeout-minutes: 240` 초과 시 Cancel
- Cancel 감지 → `Notify on cancellation` step 실행 → GitHub Issue 생성
- Issue 내용: 예상 슬롯 수 vs 실제 발행 수, 회수 방법 안내

### 회수 방법
Cancel·실패로 미달 발생 시 해당 niche만 수동 dispatch:

```bash
gh workflow run auto-publish.yml \
  --field niche=AS \
  --field slot_count=2 \
  --field mode=normal \
  --field runner=home
```

---

## 7. 주요 실패 원인 패턴

| 원인 | 증상 | 빈도 |
|---|---|---|
| macOS runner sleep | `shutdown signal received` / `operation canceled` | 가끔 |
| Claude CLI 세션 한도 | `exit 1 empty stderr` / `healthcheck timeout` | 가끔 (리셋 07:10 KST) |
| RSS 소스 404/403 | `source failed: RSS fetch ... failed: 404` | 항상 (발행 자체엔 무영향) |
| writer schema drift | `attempt 1 schema fail: missing fields` | 가끔 |

RSS 소스 오류는 키워드 트렌드 수집 실패일 뿐 발행 중단 아님. Claude CLI 한도는 당일 리셋 후 재dispatch로 회수 가능.

---

## 8. 모니터링

- **GitHub Actions**: `Actions` 탭 → `Auto-publish` 워크플로우
- **Daily Check**: 매일 08:17 KST 자동 실행 — 당일 발행 건수 검증 + 미달 시 Issue 생성
- **Token Monitor**: 매주 Blogger OAuth 토큰 만료 여부 확인

---

## 9. 관련 파일

| 파일 | 역할 |
|---|---|
| `.github/workflows/auto-publish.yml` | GitHub Actions 워크플로우 정의 |
| `scripts/auto-publish.ts` | 발행 메인 스크립트 |
| `scripts/lib/slot-utils.ts` | 슬롯 시간 배정 로직 |
| `src/lib/llm.ts` | Claude CLI 호출 래퍼 |
| `src/lib/blogger.ts` | Blogger API v3 발행 |
| `src/lib/trends.ts` | 키워드 트렌드 수집 |
| `src/lib/dedup.ts` | 중복 키워드 체크 |
| `src/lib/semantic-dedup.ts` | 의미 기반 중복 체크 |
| `src/lib/editor.ts` | 품질 검토 AI |
| `prompts/agents/content-writer.md` | 글 작성 프롬프트 |

## 2026-10-10 GSC 0% 색인 대응

**증상:** AS/HS/TS 3개 사이트 합계 1199페이지 sitemap 제출, 색인 0건 (5개월째).
URL Inspection: 홈페이지조차 `"Crawled - currently not indexed"`, 신규 글은
`"Discovered - currently not indexed"`. robots.txt/canonical/redirect 전부 정상
확인됨 — 기술적 에러가 아니라 Google의 콘텐츠 가치 판정 문제로 결론.

**의심 원인:** 하루 12건 × 3개 블로그스팟 서브도메인 동시 대량 자동발행 +
니치당 byte-identical author box 반복 — Google scaled-content-abuse 분류 패턴과 일치.
AdSense 반려 사유("가치 있는 인벤토리 부족")와도 일치.

**조치 (이 플랜):**
1. `auto-publish.yml` slot_count 기본값 4→2 (하루 12건→6건)
2. `editor.ts` author box 니치당 3종 로테이션 (data-author-box 마커 idempotency)

**확인 안 된 것 (사람이 직접 GSC 콘솔에서 봐야 함):**
- Manual Actions 리포트 — https://search.google.com/search-console/manual-actions
  (API로 조회 불가)

**모니터링:** 변경 후 2~4주 뒤 `node --env-file=.env.local scripts/gsc-fetch.mjs --days=14`로
재확인. sitemap 색인 건수(`webmasters/v3/sites/{site}/sitemaps`)가 0에서 움직이는지가
1차 신호.

**보류 중인 결정 (이 플랜 범위 밖):** 기존 1199건 중 색인 안 되는 글의 noindex 처리 여부.
