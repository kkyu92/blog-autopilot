# Smoke Test 절차 (PR6 land 직전)

⚠️ **사용자 컨펌 후 실행**. 외부 API 호출 + 실제 발행 발생.

## 사전 조건

- [ ] `docs/runner-setup.md` 모든 단계 완료 (runner 등록, LaunchAgent, pmset wake, claude OAuth, .env.local)
- [ ] runner online: `gh api repos/kkyu92/blog-autopilot/actions/runners | jq '.runners[].status'` → `"online"`
- [ ] 20개 secrets 모두 등록: repo Settings → Secrets → Actions
  - `PIXABAY_API_KEY`, `PEXELS_API_KEY`
  - `WORDPRESS_WS_ACCESS_TOKEN`, `WORDPRESS_WS_SITE_ID`
  - `WORDPRESS_TS_ACCESS_TOKEN`, `WORDPRESS_TS_SITE_ID`
  - `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`
  - `BLOGGER_AS_BLOG_ID`
  - 기타 niche/category 관련 키 (총 20개)
- [ ] PR6 PR이 main에 merge되어 workflow 활성화 또는 `pr6-auto-publish` 브랜치에서 `gh workflow run` 가능 (workflow_dispatch enabled on branch)

---

## Step 1: healthcheck-only 단독 실행

목적: 외부 API 자격증명 + 네트워크 연결 검증 (발행 0건).

```bash
gh workflow run auto-publish.yml -f mode=healthcheck-only
```

확인:
```bash
gh run list --workflow=auto-publish.yml --limit 1
gh run view <run-id> --log
```

기대 결과:
- status: `success` ✅
- log에 `healthcheck: PASS`
- 외부 발행 0건 (DB `published_posts`에 새 row 없음)
- GitHub Issue 생성 0건

❌ FAIL 시 대처:
- log에서 fail한 서비스 식별 (Pixabay / Pexels / WordPress WS|TS / Blogger AS / Claude CLI)
- 해당 토큰/엔드포인트 점검:
  - WordPress 401 → ACCESS_TOKEN 만료 → 재발급 후 secret 갱신
  - Blogger 401 → REFRESH_TOKEN 만료 → OAuth 재인증
  - Claude CLI fail → runner에서 `claude login` 다시
- `docs/runner-setup.md` 트러블슈팅 표 참조
- fix 후 같은 명령 재실행

---

## Step 2: 1건 smoke 발행

⚠️ **사용자 명시 컨펌 필요**. 실제 WordPress WS 사이트에 글 1개 게재됨. 무단 실행 금지.

```bash
gh workflow run auto-publish.yml -f niche=WS -f slot_count=1 -f mode=normal
```

확인:
```bash
gh run list --workflow=auto-publish.yml --limit 1
gh run view <run-id> --log | tail -20
```

기대 결과:
- status: `success` ✅
- log에 `success: 1, failed: 0, skipped: 0`
- WordPress WS 사이트 (worldsignal.kr 등) → 다음 발행 시각 (예: 09:00 KST)에 글 1개 예약 발행됨
- DB row 1개 추가:
  ```bash
  sqlite3 ~/projects/blog-autopilot/data/blog.db "SELECT * FROM published_posts ORDER BY id DESC LIMIT 1"
  # → status='published', niche='WS'
  ```
- GitHub Issue 생성 0건 (정상 케이스)

❌ FAIL 시 대처:
- log에서 fail 단계 확인 (writer / editor / images / publisher 중 어디서)
- DB의 `failure_reason` + `draft_json` 확인:
  ```bash
  sqlite3 ~/projects/blog-autopilot/data/blog.db "SELECT id, status, failure_reason FROM published_posts ORDER BY id DESC LIMIT 1"
  ```
- 폐기 Issue 자동 생성됐는지 확인 (`gh issue list --label auto-publish-fail`) → 권장 조치 따름

---

## Step 3: cron 자연 발화 대기 (다음날 01:17 KST = UTC 16:17)

cron schedule: `17 16 * * *` (UTC) → KST 기준 매일 **01:17** (`auto-publish.yml:4` 기준).

⚠️ Mac mini sleep 상태일 경우 `pmset repeat wake` 가 01:10 KST에 미리 깨워야 함 (runner-setup.md §3 참조).

다음 날 아침 확인:

```bash
gh run list --workflow=auto-publish.yml --limit 1
# → 10:17 KST 발화 status 확인
gh run view <run-id> --log | tail -40
```

기대 결과:
- 10:17 KST에 자동 발화 (workflow_dispatch 아님, schedule trigger)
- success ratio ≥ 70% (3 niche × 3 slot = 총 9건 중 7건 이상 published)
- log 마지막에 batch summary: `success: N, failed: M, skipped: K`
- Issue 알림은 폐기 시에만 (예: 1-2건 이내)
- DB `published_posts` row 9개 (또는 success 수만큼) 추가
- `~/backups/blog-autopilot-YYYYMMDD-HHMMSS.db` 자동 생성

---

## Step 4: 1주 운영 관찰

매일 morning routine (출근 전 5분):

- [ ] **Workflow 상태**:
  ```bash
  gh run list --workflow=auto-publish.yml --limit 7
  # → 최근 7일 status 확인 (각 일자별 1 run)
  ```
- [ ] **사이트 게재 확인**: WordPress WS / WordPress TS / Blogger AS 각 3건씩 (총 9건/일)
- [ ] **DB row 확인**:
  ```bash
  sqlite3 ~/projects/blog-autopilot/data/blog.db \
    "SELECT DATE(published_at) as day, COUNT(*) FROM published_posts \
     WHERE published_at > datetime('now', '-7 days') \
     GROUP BY day ORDER BY day DESC"
  # → 매일 9 row 근접
  ```
- [ ] **Issue 알림 점검**: `gh issue list --label auto-publish-fail` → 패턴 분석
- [ ] **DB 백업 retention**:
  ```bash
  ls -lt ~/backups/blog-autopilot-*.db | head -5
  # → 매일 +1 파일, 30일 초과분 자동 삭제 확인
  ```

### ✅ 합격 조건 (1주 종료 시점)

1. **Fail 비율 < 30%**: 매일 9건 중 fail이 3건 미만 (= 7건 이상 published)
2. **Silent fail 0건**: 모든 fail은 GitHub Issue 자동 생성됨 (DB `failure_reason` 있는 row와 issue count 일치)
3. **DB 백업 30일 retention 자동 작동**:
   - `ls ~/backups/blog-autopilot-*.db` 매일 +1 파일
   - 31일 차에 가장 오래된 백업 자동 삭제 시작
   - 방금 쓴 백업은 retention 가드로 보호됨 (H9 fix-up)

---

## 합격 시: PR6 land 완료 → Phase 1 종료

세 조건 모두 충족 시 PR6 운영 검증 완료. 이후 Phase 2 (관측성/스케일) 진행.

❌ 실패 항목 발생 시:
- fail 비율 ≥ 30% → root cause 분석, 재현 조건 issue 등록
- silent fail 발견 → escalation TODO (H9) 우선순위 상향
- 백업 retention 미작동 → `scripts/backup-db.mjs` 회귀 테스트
