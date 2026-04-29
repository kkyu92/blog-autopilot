# Cloudflare Worker Cron 도입 설계 (Phase 1 — trigger only)

**작성일**: 2026-04-29
**상태**: Design draft → 사용자 review 진입 대기
**선행 산출물**:
- `docs/retro/2026-04-28-mid-review.md` §7.5 Cloudflare 적용성 매트릭스
- 응급 fix `724ca90` (healthcheck claude-cli WARN-only)
- moneyball 시나리오 (사용자 인용): Worker → Vercel `/api/pipeline` HTTP, 7일 측정 daily-pipeline 41% skip / live-update 85% skip 회수

---

## 0. 한 줄 요약

GitHub Actions schedule cron의 high-load skip 회피용으로 **Cloudflare Worker cron** 도입. **trigger only scope** (Worker는 cron 시각에 GitHub `workflow_dispatch` API 호출, 기존 self-hosted runner + workflow + claude-cli 그대로). 진입 trigger 조건 = "A1 fix 7일 검증 후 cron success rate < 80%". 비용 $0.

---

## 1. 배경 & 진입 조건

### 1.1 문제

GitHub Actions schedule cron 회귀 패턴 (4/26 ~ 4/28 3일 연속, 14일 통계 53%):

| 날짜 | event | conclusion | root cause (확정/추정) |
|---|---|---|---|
| 4/26 17:02 UTC | schedule | cancelled | self-hosted runner sleep/wake (orphan claude.exe terminate) |
| 4/27 17:41 UTC | schedule | cancelled | 동일 |
| 4/28 17:56 UTC | schedule | failure | **`[healthcheck] claude-cli timeout after 10000ms` × 3 → exit 2** |

### 1.2 응급 fix 적용 결과 (`724ca90`)

`scripts/auto-publish.ts:806-823` — healthcheck에서 claude-cli 결과를 발행 차단 게이트에서 분리. WARN 출력 + 발행 진행 (slot-level retry가 처리).

**4/29 dispatch run `25085433470` 검증**: 36분 경과 시점 첫 slot WS 발행 확인 (10:40 KST). lesson `bb81938` 회귀 직접 해결.

### 1.3 진입 trigger 조건 (이 spec의 게이트)

> **A1 fix 후 7일간 (2026-04-29 ~ 2026-05-05)** auto-publish.yml workflow의 `success rate < 80%` 시 Phase 1 진입.
>
> 측정 정의: `success / (success + failure + cancelled)` × 100. cron + manual dispatch 합산.

도달 못하면 spec 보류. **Phase 2 (full migration)는 영원히 안 갈 수 있음 (정상)**. VISION.md $0/month 조건 우선.

---

## 2. Phase 1 Architecture

```
┌─────────────────────────────┐
│ Cloudflare Worker (Free)    │
│   cron: '17 16 * * *' UTC   │  (KST 01:17)
└──────────┬──────────────────┘
           │ POST + Authorization: Bearer ${GH_PAT}
           ▼
┌─────────────────────────────┐
│ GitHub API                  │
│   workflows/auto-publish    │
│   .yml/dispatches           │
└──────────┬──────────────────┘
           │ workflow_dispatch event
           ▼
┌─────────────────────────────┐
│ self-hosted runner home-mbp │
│   pnpm tsx auto-publish.ts  │
│   --niche=all --slot-count=3│
└──────────┬──────────────────┘
           │ 3 niches × 3 slots = 9 publishings
           ▼
   Blogger AS + WordPress WS/TS
```

### 2.1 변경 사항

| 항목 | Before | After |
|---|---|---|
| `auto-publish.yml:4` cron | `'17 16 * * *'` | (주석 처리) |
| Worker | (없음) | `cloudflare-worker/` 신설 |
| schedule trigger 메커니즘 | GitHub Actions schedule | Cloudflare Worker cron + workflow_dispatch API |
| receiver (workflow runner) | self-hosted home-mbp | (변동 없음) |
| AI 런타임 | claude-cli (Max 구독) | (변동 없음) |
| DB | `data/blog.db` | (변동 없음) |
| 발행 platform | Blogger AS / WP WS·TS | (변동 없음) |

### 2.2 Rollback

```bash
git revert <commit>  # auto-publish.yml cron 라인 복원
# wrangler delete 로 Worker 제거 (선택)
```

---

## 3. 디렉토리 구조

```
cloudflare-worker/                     # 신설
├── wrangler.toml                      # Worker config (cron + env)
├── worker.ts                          # cron handler (~50 lines)
├── package.json                       # @cloudflare/workers-types
├── tsconfig.json
└── README.md                          # deploy + secret 가이드 (사용자용)

.github/workflows/
└── auto-publish.yml                   # cron line 주석 (1줄 변경)

docs/superpowers/specs/
└── 2026-04-29-cloudflare-cron-design.md  # 이 문서
```

### 3.1 worker.ts (구현 전 spec)

```ts
interface Env {
  GH_PAT: string;
  GH_REPO_OWNER: string;     // 'kkyu92'
  GH_REPO_NAME: string;      // 'blog-autopilot'
  WORKFLOW_FILE: string;     // 'auto-publish.yml'
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const url =
      `https://api.github.com/repos/${env.GH_REPO_OWNER}/${env.GH_REPO_NAME}` +
      `/actions/workflows/${env.WORKFLOW_FILE}/dispatches`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GH_PAT}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'blog-autopilot-cron-worker',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          niche: 'all',
          slot_count: '3',
          mode: 'normal',
          runner: 'home',
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`dispatch fail ${res.status}: ${text}`);
      ctx.waitUntil(notifyTelegram(env, `Worker dispatch FAIL ${res.status}: ${text.slice(0, 200)}`));
    } else {
      console.log(`dispatch ok at ${new Date().toISOString()}`);
    }
  },
};

async function notifyTelegram(env: Env, msg: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: msg }),
  });
}
```

### 3.2 wrangler.toml

```toml
name = "blog-autopilot-cron"
main = "worker.ts"
compatibility_date = "2026-04-29"

[triggers]
crons = ["17 16 * * *"]  # UTC 16:17 = KST 01:17

[vars]
GH_REPO_OWNER = "kkyu92"
GH_REPO_NAME = "blog-autopilot"
WORKFLOW_FILE = "auto-publish.yml"
# Secret: wrangler secret put GH_PAT, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```

---

## 4. Secret 관리

| Secret | 위치 | 용도 | rotation |
|---|---|---|---|
| `GH_PAT` | Cloudflare Worker Secrets | GitHub workflow_dispatch 권한 | fine-grained, 1년 유효, 만료 시 갱신 |
| `TELEGRAM_BOT_TOKEN` | 동일 | Worker 자체 fail alert | 변경 시만 |
| `TELEGRAM_CHAT_ID` | 동일 | 동일 | 변경 시만 |

### 4.1 GH_PAT 권한 scope

fine-grained PAT, repo `kkyu92/blog-autopilot` 한정:
- **Actions: Read and write** (workflow dispatch 권한)
- **Contents: Read** (workflow 메타 조회용)

만료 alert: GitHub UI → Settings → Developer settings → Personal access tokens → 만료 7일 전 이메일 알림 (디폴트 ON 확인).

### 4.2 deploy 시 secret 등록

```bash
cd cloudflare-worker
wrangler secret put GH_PAT
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
```

---

## 5. 모니터링·알림

| 시점 | 채널 | 트리거 |
|---|---|---|
| Worker → GitHub dispatch fail | Telegram | HTTP non-2xx (PAT 만료, API down, rate limit) |
| GitHub workflow → 발행 fail | (기존) auto-publish-fail label issue | 변동 없음 |
| Worker 자체 invocation 안 됨 | Cloudflare 대시보드 (수동 확인) | logs 7일 보관 (Free tier) |

### 5.1 success rate 측정 자동화

신설: `scripts/mid-review/cron-health.mjs`

- gh run list 14일 + Worker 호출 카운트 (Cloudflare API or 로그) 합산
- 출력: `success / (success + failure + cancelled) × 100`
- Phase 2 진입 trigger 자동 판정용
- 실행: weekly (mid-review routine 자동화 시 통합)

```bash
node --env-file=.env.local scripts/mid-review/cron-health.mjs
# → { window_days: 14, success: 22, failure: 5, cancelled: 3, success_rate: 73.3, threshold_80: false }
```

---

## 6. Phase 2 진입 조건 (조건부, 박제만)

Phase 1 진입 후 7일 운영해도 **여전히 success rate < 80%**:

### 6.1 재진단 단계 (Phase 2 진입 전 mandatory)

1. **self-hosted runner sleep/wake 확인**: 사용자 PC 가동 시간 확인 (`pmset -g log | grep -E "Wake|Sleep"`), cron 시각 (UTC 16:17 = KST 01:17)에 PC 켜져있었는지
2. **Worker invocation 검증**: Cloudflare 대시보드에서 cron fired 확인 (Worker는 fire했는데 receiver fail이면 receiver 문제, Worker 안 fired면 Worker config 문제)
3. **새 root cause 확인**: A1·Worker 외 어떤 원인 (예: Pixabay/Pexels API down, claude-cli 진짜 hang)

### 6.2 fix 옵션 (재진단 결과 따라)

| 진단 결과 | fix |
|---|---|
| PC sleep/wake | **option A**: `pmset repeat wake` 또는 `caffeinate` (zero-cost, Phase 1 보강) |
| receiver 매번 fail | **option B**: Phase 2 = Vercel + Anthropic API 마이그레이션 (Max → API $, build FAIL 정상화 선결) |
| 새 코드 회귀 | **option C**: 별도 fix spec |

### 6.3 Phase 2 진입은 별도 brainstorming + CEO 리뷰 의제

- VISION.md $0/month 조건 깨짐 ($)
- Vercel build 정상화, app dir 복구, 발행 로직 재구축 = 큰 마이그레이션
- 트래픽·발행량 증가 (현재 일 9건) 시 cost-benefit 재계산

→ Phase 1만으로 안정되면 Phase 2 안 함. 정상.

---

## 7. Out of Scope (이 spec 미포함)

- self-hosted runner sleep/wake 자체 fix (caffeinate, pmset) — 별도 의제 (Phase 1 보강 또는 Phase 2 결정 후)
- Vercel build FAIL 정상화 — 별도 의제
- application-level 발행 dedup (양쪽 fire 방지) — 본 spec은 GHActions schedule **비활성화**로 우회 (양쪽 fire 자체 차단)
- Worker → Vercel migration (Phase 2 spec)
- AdSense API 연동 (mid-review §10 별도)
- GSC 색인 0 fix (Blogger 콘솔 작업, 사용자 진행 중)

---

## 8. Cost & Limits

| 항목 | 값 | 근거 |
|---|---|---|
| Cloudflare Workers Free tier | 100,000 req/day | docs |
| 본 Worker 사용량 | 1 req/day (cron 1회) | overhead 무시 가능 |
| Cloudflare 비용 | **$0/month** | Free tier 한도 0.001% 사용 |
| GitHub API rate limit (dispatch) | 5,000 req/h authenticated | 1 dispatch/day 무시 가능 |
| 추가 비용 | $0 | Max 구독 / Vercel / Anthropic API 모두 변동 없음 |

VISION.md `$0/month` 조건 **유지**.

---

## 9. 실행 단계 (Phase 1 spec → 코드 작성 진입 시)

> 실행은 별도 세션. trigger 조건 충족 (5/5 이후 cron success rate < 80%) 시 진입.

1. cloudflare-worker/ 디렉토리 생성 + wrangler init
2. worker.ts + wrangler.toml 작성 (위 §3 참조)
3. wrangler secret put × 3 (GH_PAT + TELEGRAM_*)
4. wrangler deploy
5. cron 발화 1회 수동 검증: `wrangler dev --test-scheduled` + Cloudflare 대시보드 logs 확인
6. `auto-publish.yml:4` cron line 주석 처리 + commit
7. 24시간 자연 cron 자연 검증
8. 7일 success rate 추적 → 80%+ 회복 confirm

---

## 10. 평가 기준

이 spec의 성공 = Phase 1 진입 후 **7일간 cron success rate ≥ 80%**.

도달 못하면 §6 재진단 → Phase 2 결정 또는 다른 fix.

---

## 변경 이력

- **2026-04-29 (작성)**: brainstorming 결과 박제. Q1 timing (A1 검증 후 결정 + spec 박제), Q2 scope (단계적 Phase 1 trigger only), Q3 trigger 메커니즘 (workflow_dispatch API), Q4 진입 조건 (7일 < 80% + GHActions 비활성화) 4개 결정 반영.
