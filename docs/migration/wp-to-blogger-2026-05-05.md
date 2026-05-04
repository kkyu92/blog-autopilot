# WP → Blogger 마이그레이션 plan (5/5 압축 cut-over)

> 결정 박제: 2026-05-04. WP.com Free 2개 (TS, WS) → Blogger 신규 2개로 즉시 통째 마이그레이션. 5/4 prep 미리 + 5/5 cut-over.

## 결정 박제

| 의제 | 결정 |
|---|---|
| 마이그레이션 GO/STOP | **GO** |
| 실행 옵션 | **A — 즉시 통째** (단계적 X, 통합 X) |
| TS 신규 도메인 | `trip-signal.blogspot.com` |
| WS 신규 도메인 | `health-signal.blogspot.com` (worldsignal → health-signal, niche 명시 강화로 AdSense 광고 매칭 우위) |
| 기존 콘텐츠 55건 | **(a) Blogger 신규 도메인에 재발행** (TS 28 + WS 27, URL 신규) |
| 시점 | **5/4 prep 미리 + 5/5 cut-over (1일 압축)** |

## 결정 근거

1. **AdSense unblock**: WP.com Free 불가 → Premium $96/y(WordAds) / Business $300/y(외부 AdSense). Blogger 무료 직통.
2. **chain pool 자동화 unblock**: design-review/SEO/structured data 모두 Blogger에서 작동, WP Free는 무력.
3. **유료 plan 결제 회피**: $192/y+ 절약.
4. **publish 코드 단순화**: `src/lib/wordpress.ts` deprecate, 1 SDK 운영.
5. **현재 traffic 손실 ≈ 0**: TS/WS 28d view 30 미만 + indexed=0 + 검색 0.

## 압축 핵심 안전 원칙

1. **5/5 02:00 cron은 마지막 WP 분기로 발행** — fix L1+L2 1차 검증을 platform 변경 잡음 없이 깨끗하게.
2. **publish 분기 변경 PR은 5/5 cron 발행 완료 + spot-check 통과 후**에만 머지. 회귀 시 마이그레이션 stop, fix 회수 우선.
3. **55건 batch는 dry-run 검증 후 `--apply`** — 실패 회수 비용 차단.
4. **5/6 02:00 cron이 첫 Blogger 분기 자연 발행** — cron으로 cut-over 검증.

## Timeline

### 5/4 (오늘) — prep 미리

| 단계 | 작업자 | 작업 |
|---|---|---|
| **A. Blogger 신규 2개 생성** | 사용자 (UI) | Blogger Console → 신규 blog 2개: `trip-signal.blogspot.com`, `health-signal.blogspot.com` |
| **B. 각 blog 템플릿 적용** | 사용자 (UI) | AS와 동일 — head/body 광고 슬롯, structured data, mobile redirect 동작. AS 테마 export → 신규 blog import |
| **C. GSC site 등록** | 사용자 (UI) | 각 신규 도메인 URL 등록 + 소유권 인증 (HTML 파일 또는 메타 태그) |
| **D. sitemap.xml 자동 노출 확인** | 사용자 + Claude | `https://trip-signal.blogspot.com/sitemap.xml` curl로 확인. GSC에 sitemap 제출 |
| **E. `.env.local` 신규 BLOG_ID 추가** | 사용자 | `GOOGLE_BLOG_ID_TRIP=...`, `GOOGLE_BLOG_ID_HEALTH=...` |
| **F. 마이그레이션 스크립트 작성** | Claude | `scripts/migration/wp-to-blogger.mjs` (dry-run + apply mode) |
| **G. publish 분기 변경 PR 작성 (머지 X)** | Claude | branch `migration/wp-to-blogger-cutover` — schema/auto-publish/yml 변경. 5/5 morning 머지 대기 |
| **H. WP 코드 deprecate PR 작성 (머지 X)** | Claude | branch `migration/wp-deprecate` — wordpress.ts 삭제 등. G 머지 후 5/5 afternoon 머지 |

### 5/5 — cut-over

| 시간 (KST) | 작업 |
|---|---|
| **02:00** | 자연 cron — 마지막 WP 분기 9건 발행 |
| **07:00~09:00** | cron 결과 확인 + 9건 spot-check (ADMIN view) — F2 회귀 신호면 stop |
| **09:00~10:00** | 마이그레이션 dry-run 실행 + 결과 검증 |
| **10:00~12:00** | publish 분기 변경 PR (G) 머지 + auto-publish.yml 분기 변경 |
| **12:00~13:00** | 55건 batch 이전 (`wp-to-blogger.mjs --apply`) — DB published_posts 갱신 + log 박제 |
| **13:00~16:00** | WP 코드 deprecate PR (H) 머지 + 회귀 검증 (`pnpm test`, `pnpm build`) |
| **16:00~** | 모니터링 시작 — 신규 Blogger health, F2 trend |

### 5/6 — 첫 Blogger cron 검증

| 시점 | 작업 |
|---|---|
| **02:00 KST** | 자연 cron — **첫 Blogger 분기** 9건 발행 (3 Blogger × 3) |
| **morning** | 결과 확인 + 9건 spot-check + F2 trend 5/6 갱신 |

### 5/7~5/9 — 모니터링

| dimension | 측정 |
|---|---|
| 신규 indexing | GSC sitemap submitted/indexed (5/8~5/9 첫 indexing signal 가능, AS 4/26 발행 4/28 첫 크롤 = 2일 latency 기준) |
| 발행 trend | F2 9/9 유지 여부 (3 Blogger 분기로 변경 후 회귀 없음 확인) |
| AdSense 임계 | TS+travel 누적, WS+health 누적, AS 30+ |
| disclaimer 누락 | L1+L2 fallback 발동 여부 |

## 5/4 prep 체크리스트 — 사용자 작업 (UI)

- [ ] **A. Blogger 신규 blog 2개 생성**
  - [ ] `trip-signal.blogspot.com`
  - [ ] `health-signal.blogspot.com`
- [ ] **B. 각 blog 템플릿 적용** (AS와 동일)
  - [ ] AS 테마 export (`Theme → Backup → Download`)
  - [ ] 신규 2개 blog에 동일 테마 import
  - [ ] head/body 커스텀 코드 동일하게 (광고 슬롯, 메타, structured data)
- [ ] **C. GSC site 등록**
  - [ ] trip-signal 도메인 등록 + HTML 파일 또는 메타 태그 인증
  - [ ] health-signal 도메인 등록 + 인증
- [ ] **D. sitemap 제출**
  - [ ] trip-signal sitemap.xml 자동 노출 확인 (curl로 가능)
  - [ ] GSC sitemap 제출 (각 도메인)
  - [ ] health-signal 동일
- [ ] **E. `.env.local` 신규 BLOG_ID 추가**
  - [ ] `GOOGLE_BLOG_ID_TRIP=<신규>`
  - [ ] `GOOGLE_BLOG_ID_HEALTH=<신규>`
  - [ ] (기존 `GOOGLE_BLOG_ID`는 `GOOGLE_BLOG_ID_APT`로 명명 통일 권장)

## 5/4 prep 체크리스트 — Claude 작업 (코드)

- [ ] **F. 마이그레이션 스크립트** `scripts/migration/wp-to-blogger.mjs`
  - WP API에서 TS 28건 + WS 27건 fetch (`?context=edit`)
  - 각 글 → Blogger PUT API로 신규 도메인 발행
  - rate limit (1 QPS) 준수, 10건씩 batch + sleep
  - dry-run mode (실제 발행 X, fetch + transform 결과만 log)
  - apply mode (`--apply` flag)
  - DB published_posts 갱신 (platform 변경 + 신규 post_id/url + 옛 행 archived 마커)
  - 결과 log → `docs/migration/2026-05-05-batch.json`
- [ ] **G. publish 분기 변경 PR** (branch `migration/wp-to-blogger-cutover`)
  - `src/lib/schema.ts` platform enum 갱신: `wordpress_ts`/`wordpress_ws` 제거 → `blogger_trip`/`blogger_health` 추가
  - `scripts/auto-publish.ts` niche → BLOG_ID 매핑 갱신
  - `auto-publish.yml` WP 단계 제거, Blogger 3 분기 단일화
  - test 회귀 X 확인
  - **PR 생성 + 머지 대기** (5/5 morning 머지)
- [ ] **H. WP 코드 deprecate PR** (branch `migration/wp-deprecate`)
  - `src/lib/wordpress.ts` 삭제
  - `src/lib/__tests__/wordpress.test.ts` 삭제
  - `src/lib/healthcheck.ts` WP 분기 제거
  - `src/lib/tokens.ts` WP refresh token 분기 제거
  - `src/lib/dedup.ts` / `semantic-dedup.ts` WP 분기 제거
  - `scripts/wordpress/update-posts.mjs` archive 또는 삭제
  - test 회귀 X 확인
  - **PR 생성 + 머지 대기** (5/5 afternoon 머지, G 머지 후)

## 회수 옵션

### Soft rollback (5/5 cut-over 후 24h 안)

- publish 분기 변경 PR revert + auto-publish.yml WP 단계 복원
- WP refresh token 환경 변수 복원
- DB published_posts WP 행 복원 (마이그레이션 batch log에서)
- 신규 Blogger 2개는 그대로 두되 발행 X
- 비용: 30분 + 1 cron 손실

### Hard rollback (WP 코드 deprecate PR 머지 후)

- 모든 deprecate PR git 복원
- 비용: 2~3시간

회수 신호:
- 신규 Blogger 4주 후에도 indexing 진입 X (그러나 WP 측도 동일이라 회수 가치 낮음)
- AdSense 신청 거부 (Blogger 자체는 일반적 거부 사유 X)

## 다음 세션 진입 시

1. 5/5 압축 plan timeline 확인
2. 5/4 prep 작업 진행 상태 점검
3. 5/5 02:00 cron 결과 + spot-check + dry-run + cut-over 진행
