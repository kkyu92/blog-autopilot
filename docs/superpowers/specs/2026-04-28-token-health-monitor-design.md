# Token Health Monitor — Design Spec

**작성일**: 2026-04-28
**Status**: **DEFERRED** — 1주 관찰 (5/4) 데이터 보고 silent fail 위험 실재 시 진행 결정. brainstorming 검증 결과 자동화 가능 범위가 처음 추정보다 좁음 (Blogger 이미 자동, WP App Password 기술적 불가, claude CLI 갱신 메커니즘 없음) → 가치는 monitoring 1개 영역. 1주 관찰 데이터 없이 만들면 cover 시나리오 불확실 → 데이터 후 결정.
**Scope**: 외부 토큰 4종 (WP-WS, WP-TS, Blogger, claude CLI Max) 헬스 모니터링 + 죽음 감지 + 알림 dispatch
**대체**: ROADMAP.md Phase 1.5 "WP OAuth 자동 갱신" 항목 — 전제 자체가 잘못된 항목을 정정 후 재정의
**Brainstorming 결과**: superpowers:brainstorming 통한 전제 재검토 + 스코프 확장 (1 토큰 → 4 토큰 통합 패턴)

---

## 1. Background

### 1.1 이전 세션이 만든 환상

`HANDOFF_SNAPSHOT.md`, `docs/ROADMAP.md` 양쪽에 다음 항목이 P0로 마킹되어 있었음:

> WP OAuth 자동 갱신 — 5/10~5/26 만료 임박. 수동 갱신은 cron miss 위험.
> 작업 데드라인 5/2~5/3.

**검증 결과 이 전제는 틀림**:

- 사용자에게 직접 확인 — "내가 먼저 이야기한 게 아님" (4/28 brainstorming)
- `src/lib/wordpress.ts:46` 코드 주석: `// WP.com doesn't use refresh tokens, token doesn't expire`
- WP.com OAuth global scope token은 공식적으로 non-expiring
- 5/10~5/26 만료 날짜의 출처 없음 (어느 commit/issue/문서에도 근거 없음)

이전 세션 Claude가 "추정"을 사실처럼 굳혀버린 결과. P0 마킹과 데드라인까지 붙여서 다음 세션에 부담 전가됨.

### 1.2 그러나 진짜 가치 있는 인접 문제

전제는 틀렸어도 인접 위험은 실재함:

1. **WP.com 토큰**: 공식적으론 non-expiring이나 revoke / app 권한 회수 등으로 죽을 수 있음. 죽으면 **silent fail** (publishScheduled 4xx → workflow fail → dispatch 알림은 가지만 원인 진단까지 시간 걸림)
2. **Blogger refresh_token**: Google OAuth refresh token은 6개월 미사용 / 비밀번호 변경 / app revoke 시 invalidate됨. invalid_grant 시 발행 0
3. **claude CLI Max 인증**: 만료 주기 미상. 만료 시 healthcheck FAIL → cron 전체 skip (영향 범위 가장 큼)
4. **위 셋 모두 silent fail 가능 영역** — 발행 fail 알림이 가긴 하지만 "왜 fail했는지" 진단 1단계 줄여줄 수 있음

### 1.3 OAuth 표준 갱신 불가 영역

WP.com OAuth는 **refresh_token이 아예 발급되지 않음** (authorization_code grant만 지원, 그것도 long-lived global token으로 끝). 즉:
- "자동 갱신"은 표준 OAuth 의미로는 불가능
- 우리가 만들 수 있는 건 **갱신이 아니라 감지 + 조기 알림 + 재인증 가이드**
- 동일하게 claude CLI Max 인증도 사용자가 브라우저에서 재인증해야 함

→ 프로젝트 이름을 정정: **"Token Health Monitor"** (감지 + 알림 + runbook), not "auto-renewal"

---

## 2. 결정 요약 (brainstorming 산출)

| # | 결정 | 사유 |
|---|---|---|
| D1 | **스코프 4 토큰**: WP-WS, WP-TS, Blogger, claude CLI. PLAYBOOK_PAT은 기존 `pat-expiry-check.yml` 그대로 보존 | 멀쩡한 PAT 모니터링 손대지 않기 (YAGNI). PAT는 expiry 헤더 기반 정밀 감지 ↔ 새 cron은 alive/dead 이진 감지 → 다른 패턴 |
| D2 | **WP-WS / WP-TS 분리 probe** (token+blogId pair 각각 `GET /sites/{blogId}`) | 같은 계정이라도 token revoke / blogId mismatch 등 독립 실패 가능. 알림도 niche-specific해야 runbook 명확 |
| D3 | **2 workflow 분리**: cloud (WP+Blogger) + self-hosted (claude CLI) | runner SPOF가 monitoring을 무력화하는 시나리오 차단. 책임 분리 명확 |
| D4 | **매일 KST 18:17 (UTC 09:17, cron `17 9 * * *`)** | 정시 회피 + auto-publish의 17분 미러링 (일관성). 사용자 활동 시각이라 즉시 조치 가능 |
| D5 | **5xx/네트워크는 30초 후 1회 재시도**, 그래도 fail 시 warning. 4xx는 즉시 critical | transient 필터링. healthcheck.ts 3-retry exponential backoff와 비슷한 정신 (단순화) |
| D6 | **dispatch는 pat-expiry-check.yml 패턴 그대로 재사용** | 검증된 패턴. fingerprint convention만 새로 정의 |
| D7 | **Unit 테스트 없음** — 외부 API mock하면 paperclip lesson 반복 | workflow_dispatch 수동 트리거로 검증. PR 머지 후 자연 cron 결과 확인 |
| D8 | **runbook 3개 별도 파일** (`docs/runbook/wp-token-renewal.md`, `blogger-token-renewal.md`, `claude-cli-renewal.md`) — dispatch body에서 링크 참조 | 알림 body 짧게 유지 + 재인증 단계는 별도 자료로 분리 |
| D9 | **ROADMAP.md / HANDOFF_SNAPSHOT.md 정정 같은 PR에 포함** | 환상 빨리 제거 (다른 세션에 부담 전가 방지) |

---

## 3. 아키텍처

### 3.1 파일 구조

```
.github/workflows/
  token-monitor-external.yml   ← cloud (ubuntu-latest), WP-WS / WP-TS / Blogger
  token-monitor-claude.yml     ← self-hosted (home-mbp), claude CLI Max
  pat-expiry-check.yml         ← 기존 보존, 손대지 않음

docs/runbook/
  wp-token-renewal.md          ← WP OAuth 재인증 단계
  blogger-token-renewal.md     ← Blogger refresh_token 재발급 단계
  claude-cli-renewal.md        ← Claude Code Max 재로그인 단계
```

**기존 코드 변경 없음** — 모니터링은 순전히 워크플로 + curl + bash. `src/lib/`에 새 파일 추가 안 함.

### 3.2 데이터 흐름

```
                                 ┌──────────────────────────────┐
                                 │ token-monitor-external.yml   │
                                 │ (cloud, KST 18:17 매일)      │
                                 │                              │
                                 │ 1. probe_wp(WS)  → 200/error │
                                 │ 2. probe_wp(TS)  → 200/error │
                                 │ 3. probe_blogger → 200/error │
                                 │                              │
                                 │ error → dispatch()           │
                                 └──────────────┬───────────────┘
                                                │
                                                ▼
                                ┌────────────────────────────────┐
                                │ kkyu92/playbook                │
                                │ event_type=worker-incident     │
                                │ severity=critical/warning      │
                                │ fingerprint=<token-specific>   │
                                └────────────────────────────────┘
                                                ▲
                                                │
                                 ┌──────────────┴───────────────┐
                                 │ token-monitor-claude.yml     │
                                 │ (self-hosted, KST 18:17 매일)│
                                 │                              │
                                 │ 1. probe_claude → 0/non-zero │
                                 │                              │
                                 │ non-zero → dispatch()        │
                                 └──────────────────────────────┘
```

각 워크플로는 독립 — 한쪽 실패가 다른쪽에 영향 없음.

---

## 4. Probe 로직

### 4.1 WP-WS / WP-TS

```bash
probe_wp() {
  local niche=$1   # "WS" | "TS"
  local token_var="WORDPRESS_${niche}_ACCESS_TOKEN"
  local blog_var="WORDPRESS_${niche}_BLOG_ID"
  local token="${!token_var}"
  local blog_id="${!blog_var}"

  if [ -z "$token" ] || [ -z "$blog_id" ]; then
    echo "config_missing"
    return 1
  fi

  local url="https://public-api.wordpress.com/rest/v1.1/sites/${blog_id}"
  local code

  # 1차 시도
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${token}" \
    --max-time 10 "$url")

  # 200 → ok
  if [ "$code" = "200" ]; then return 0; fi

  # 5xx 또는 network failure (000) → 30초 후 1회 재시도
  if [ "$code" -ge 500 ] 2>/dev/null || [ "$code" = "000" ]; then
    sleep 30
    code=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer ${token}" \
      --max-time 10 "$url")
    if [ "$code" = "200" ]; then return 0; fi
  fi

  echo "$code"
  return 1
}
```

분류:
- `200` → ok
- `401` → 토큰 만료/무효 → **critical**, fingerprint `wp-token-dead-${niche}-${YYYY-MM-DD}`
- `403` → 권한 사라짐 → **critical**, fingerprint `wp-token-forbidden-${niche}-${YYYY-MM-DD}`
- `404` → blog_id mismatch (config 문제) → **critical**, fingerprint `wp-blog-id-mismatch-${niche}-${YYYY-MM-DD}`
- `5xx` (재시도 후에도) → **warning**, fingerprint `wp-server-error-${niche}-${YYYY-MM-DD}`
- `000` (network) → **warning**, fingerprint `wp-network-${niche}-${YYYY-MM-DD}`
- `config_missing` → **error**, fingerprint `wp-env-missing-${niche}-${YYYY-MM-DD}`

### 4.2 Blogger

```bash
probe_blogger() {
  local resp
  resp=$(curl -s -X POST https://oauth2.googleapis.com/token \
    --max-time 10 \
    -d "client_id=${GOOGLE_CLIENT_ID}" \
    -d "client_secret=${GOOGLE_CLIENT_SECRET}" \
    -d "refresh_token=${GOOGLE_REFRESH_TOKEN}" \
    -d "grant_type=refresh_token")

  # access_token 필드 있으면 ok
  if echo "$resp" | grep -q '"access_token"'; then return 0; fi

  # invalid_grant → 토큰 죽음
  if echo "$resp" | grep -q "invalid_grant"; then
    echo "invalid_grant"
    return 1
  fi

  # 그 외 (network 등) → 30초 후 1회 재시도
  sleep 30
  resp=$(curl -s -X POST ... )
  if echo "$resp" | grep -q '"access_token"'; then return 0; fi

  echo "unknown"
  return 1
}
```

분류:
- access_token 응답 → ok
- `invalid_grant` → **critical**, fingerprint `blogger-token-dead-${YYYY-MM-DD}`
- 그 외 (재시도 후) → **warning**, fingerprint `blogger-probe-unknown-${YYYY-MM-DD}`

### 4.3 claude CLI

```bash
probe_claude() {
  # 5초 안에 끝나야 함. 죽은 토큰이면 prompt 보내자마자 401-ish error
  if timeout 5 claude --print "ok" > /tmp/claude.out 2> /tmp/claude.err; then
    return 0
  fi
  # 실패 — 출력 캡처해서 dispatch body에 포함
  return 1
}
```

분류:
- exit 0 → ok
- non-zero → **critical**, fingerprint `claude-cli-token-dead-${YYYY-MM-DD}`. body에 stderr 첫 200자 포함

(주의: `claude --version`은 인증 필요 없으므로 사용 불가. 실제 prompt 호출이 필요)

---

## 5. Dispatch 패턴

`pat-expiry-check.yml`의 `dispatch()` shell 함수 그대로 복사. 차이는 fingerprint / title / body / severity 매핑만.

```bash
dispatch() {
  local title="$1"
  local body="$2"
  local severity="$3"
  local fingerprint="$4"
  gh api repos/kkyu92/playbook/dispatches \
    -f event_type=worker-incident \
    -f "client_payload[source_repo]=${GITHUB_REPOSITORY}" \
    -f "client_payload[title]=${title}" \
    -f "client_payload[body]=${body}" \
    -f "client_payload[type]=incident" \
    -f "client_payload[severity]=${severity}" \
    -f "client_payload[fingerprint]=${fingerprint}" \
    -f "client_payload[environment]=production" \
    -f "client_payload[run_url]=${RUN_URL}"
}
```

### 5.1 알림 body 템플릿 예시 (WP-WS 401)

```
WP-WS 토큰이 무효 상태 (HTTP 401).

영향: 다음 KST 01:17 publish cron에서 WS niche 발행 fail.

조치:
1. https://github.com/kkyu92/blog-autopilot/blob/main/docs/runbook/wp-token-renewal.md 참조
2. WP.com OAuth 재인증 후 WORDPRESS_WS_ACCESS_TOKEN secret 갱신

Run: ${RUN_URL}
```

---

## 6. 워크플로 자체 fail 에스컬레이션

`pat-expiry-check.yml` lines 104-126의 `if: failure()` step 그대로 재사용. 차이는 fingerprint:
- `cron-token-monitor-external-failure`
- `cron-token-monitor-claude-failure`

PAT 자체가 죽었으면 dispatch도 못 가지만 — 그건 별도 `pat-expiry-check.yml`이 잡음. 이중 안전망.

---

## 7. Runbook 문서 (3개)

각각 ~30줄 markdown. 구성:

1. **상황** (이 알림은 언제 받는가)
2. **즉시 조치** (3~5단계, 복붙 가능한 명령어 포함)
3. **검증** (수동 테스트 + workflow_dispatch 재실행)
4. **재발 방지** (해당사항 있으면)

### 7.1 `docs/runbook/wp-token-renewal.md`

- WP.com `https://wordpress.com/me/security/connected-applications` 에서 앱 권한 확인
- 새 OAuth 인증: 로컬 `npm run dev` → `/api/auth/wordpress` → callback → DB tokens 테이블 갱신 → access_token 추출 → GitHub Secrets `WORDPRESS_WS_ACCESS_TOKEN` 또는 `_TS_ACCESS_TOKEN` 갱신

### 7.2 `docs/runbook/blogger-token-renewal.md`

- Google Cloud Console OAuth playground 또는 로컬 `/api/auth/google` flow로 새 refresh_token 발급
- GitHub Secrets `GOOGLE_REFRESH_TOKEN` 갱신

### 7.3 `docs/runbook/claude-cli-renewal.md`

- home-mbp에서 `claude logout && claude login` 또는 `claude` 명령어 실행 시 자동 reauth
- 토큰은 `~/.config/anthropic/auth.json` (또는 OS별 경로) — 공유 안 함, 수동 재로그인만

---

## 8. ROADMAP.md / HANDOFF_SNAPSHOT.md 정정

같은 PR에 포함:

### `docs/ROADMAP.md`

- **Line 25**: `| WP OAuth 자동 갱신 | P0 | 5/10~5/26 만료 임박. 수동 갱신은 cron miss 위험 |`
  → `| Token health monitor (4 토큰 통합) | P0 | silent fail 위험 영역 사전 감지. WP/Blogger/claude CLI 죽으면 cron 전체 또는 niche 발행 0 |`
- **Line 124**: `WP OAuth 자동 갱신 PR — 만료 임박 (5/10~), 1~2일 작업`
  → `Token health monitor PR — silent fail 영역 사전 감지, 0.5~1일 작업`
- **Line 138**: `토큰 만료 (5/10~5/26)` 라인 제거 (전제 자체가 환상)
- **Line 154**: `5/4 ─── 5/11   1주 회고 + 우선순위 재조정 + 토큰 자동 갱신` → `토큰 health monitor 머지 후 운영 검증` 등 정정

### `HANDOFF_SNAPSHOT.md`

- "🔥 WP OAuth 자연 만료 5/10~5/26" 항목 제거 또는 "Token health monitor 머지"로 대체
- "🔥 5/2~5/3 (긴급) — WP OAuth 자동 갱신 PR" 섹션 정정

(SNAPSHOT 파일은 gitignored이지만 정정 필요)

---

## 9. 테스트 전략

### 9.1 머지 전

- `workflow_dispatch`로 수동 트리거 → 모든 토큰 ok 상태에서 dispatch 발생 안 함 확인 (no false positive)
- 결과 로그에 `WP-WS: ok`, `WP-TS: ok`, `Blogger: ok`, `Claude CLI: ok` 4줄 출력

### 9.2 머지 후

- 머지 직후 첫 cron 자연 실행 결과 확인 (KST 18:17)
- 1주 관찰 윈도우 (5/4까지) — 자연 실행에서 false positive 0건 확인

### 9.3 (선택) 의도적 fail

운영 토큰 깨뜨리기 부담스러우면 skip. 가능하면:
- secret을 잠깐 망가뜨려서 cron 1회 돌리고 dispatch 가는지 확인 → 즉시 secret 복구

---

## 10. 비-스코프 (이 PR이 안 하는 것)

- ❌ 자동 갱신 (OAuth refresh_token 없음, 표준 OAuth로 불가능)
- ❌ 토큰 만료일 예측 (WP.com / Blogger / claude CLI 모두 expiry 헤더 없음)
- ❌ Token rotation (1년 주기로 강제 재발급 등)
- ❌ Multi-account (같은 계정만 다룸)
- ❌ PAT (PLAYBOOK_PAT은 기존 `pat-expiry-check.yml`이 처리)
- ❌ Hub side handler (이 PR은 dispatch sender만, hub 쪽 worker-incident handler는 별도 PR이고 이미 존재)

---

## 11. 추정 작업 시간

- 워크플로 2개 작성 + 검증: 3시간
- runbook 3개 작성: 1.5시간
- ROADMAP / SNAPSHOT 정정: 0.5시간
- 머지 + 첫 cron 확인: 0.5시간

**총 ~5시간 (0.5~1일)**

---

## 12. Out-of-band 위험 / 미해결

- claude CLI probe가 production 토큰 사용량 0.001% 정도 추가 → 무의미
- WP.com `GET /sites/{blogId}` rate limit → 매일 1회면 무관 (limit 100/min 수준)
- Blogger refresh_token rotation: Google이 가끔 refresh_token을 회전시킬 수 있음. 우리 probe는 receive 안 하고 버리므로 영향 없음
- self-hosted runner offline 시 claude monitor도 같이 못 도는데 — 그땐 cron 자체가 안 돌므로 별도 처리 불필요 (workflow `actions/checkout`도 fail → GitHub Actions의 자체 알림 메커니즘에 의존)

---

**Approval needed before invoking writing-plans skill.**
