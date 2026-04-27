# Self-hosted Runner 셋업 (집 + 회사 MacBook 2대)

PR6 auto-publish workflow는 self-hosted runner에서 실행됩니다. 두 대 (집/회사 MacBook)를 등록하고 label로 구분합니다.

- **cron 10:17 KST 발동**: `home` runner 고정 (paperclip 22일 환경 재사용)
- **수동 실행 (`workflow_dispatch`)**: `home` 또는 `office` 선택 가능 (input에 `runner` choice 노출)

---

## 0. 두 대 모두 공통 사전 준비

각 컴퓨터 (집 MacBook, 회사 MacBook)에 다음을 1회씩 적용:

1. `~/projects/blog-autopilot` 클론 (또는 paperclip 컴퓨터의 경우 이미 존재)
2. `pnpm install`
3. `.env.local`에 20개 키 (§5 명단) — paperclip 시절 `.env.local`이 이미 있다면 그대로 사용
4. `claude login` (§4)

집 MacBook에는 paperclip 시절 환경이 이미 있으므로 새로 만들 건 거의 없을 가능성. 회사 MacBook은 처음부터 셋업.

---

## 1. GitHub runner 등록 (각 컴퓨터마다)

### 집 MacBook (label = `home`)

```bash
# repo Settings → Actions → Runners → New self-hosted runner (macOS)
# 페이지에 표시된 설치 명령 + 아래 config 옵션 추가:

mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-osx-x64-2.x.x.tar.gz -L https://github.com/actions/runner/releases/download/...
tar xzf ./actions-runner-osx-x64-2.x.x.tar.gz

./config.sh \
  --url https://github.com/kkyu92/blog-autopilot \
  --token <runner-token-from-github-settings> \
  --name home-mbp \
  --labels home \
  --work _work \
  --unattended
```

### 회사 MacBook (label = `office`)

같은 절차, 다른 라벨/이름:

```bash
./config.sh \
  --url https://github.com/kkyu92/blog-autopilot \
  --token <fresh-token-from-github-settings> \
  --name office-mbp \
  --labels office \
  --work _work \
  --unattended
```

> **주의**: runner token은 GitHub Settings → Actions → Runners 페이지에서 New 버튼 누를 때마다 발급되는 일회용. 두 번째 등록 시 새 token 발급.

### 두 대 등록 확인

GitHub 또는 어느 컴퓨터에서나:

```bash
gh api repos/kkyu92/blog-autopilot/actions/runners | jq '.runners[] | {name, labels: [.labels[].name], status}'
# → home-mbp: ["self-hosted","home","macOS","X64"]  online
# → office-mbp: ["self-hosted","office","macOS","X64"]  online
```

---

## 2. LaunchAgent (자동 시작 + KeepAlive) — 각 컴퓨터마다

각 MacBook에서 동일 plist 생성. 라벨/경로만 컴퓨터별 차이 없음 (사용자 디렉토리 동일하다고 가정).

```bash
mkdir -p ~/Library/LaunchAgents ~/logs
cat > ~/Library/LaunchAgents/com.github.actions.runner.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.github.actions.runner</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/kyusikkim/actions-runner/run.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/kyusikkim/actions-runner</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/kyusikkim/logs/actions-runner.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/kyusikkim/logs/actions-runner.err</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.github.actions.runner.plist
launchctl list | grep actions.runner
```

`KeepAlive=true`로 runner 프로세스가 죽으면 자동 재시작. 재부팅 후에도 `RunAtLoad=true`로 자동 기동.

---

## 3. pmset wake schedule — **집 MacBook만**

cron 10:17 KST 발동 시 `home` runner가 받습니다 (workflow `runs-on: [self-hosted, home]`). 집 MacBook이 그 시각에 깨어 있어야 합니다.

```bash
# 집 MacBook에서만 실행
sudo pmset repeat wake MTWRFSU 01:10:00   # KST 10:10 (cron 7분 전)

# 확인
pmset -g sched
# → wakeorpoweron at 01:10:00 every day
```

> 회사 MacBook은 cron 받지 않으므로 pmset wake 불필요. `workflow_dispatch`에서 `runner=office` 선택 시에만 사용.

> **MacBook lid closed wake 주의**: AC 전원 연결 + Apple 메뉴 → 시스템 설정 → 배터리 → "전원 어댑터 연결 시 디스플레이 끔 대기 시간" 길게. 또는 `caffeinate` 백그라운드 실행 (paperclip 시절 검증 패턴).

---

## 4. claude CLI OAuth 셋업 — 각 컴퓨터마다

blog-autopilot은 **Claude Code Max 구독**을 사용합니다 (API key 아님). 두 컴퓨터 각각 1회 로그인.

```bash
# Runner를 실행하는 macOS 사용자 셸에서 (LaunchAgent가 사용하는 그 사용자)
claude login
# 브라우저에서 Anthropic 계정 (Claude Code Max 구독자) 로그인 → 토큰 저장
# 토큰은 ~/.config/claude/ 또는 ~/.local/share/claude/에 저장됨

# 검증
claude --version
echo "test" | claude -p "1 word reply" --model sonnet
# 정상 응답 ("OK", "test", "yes" 등)이면 성공
```

OAuth 토큰 만료 시 `lib/healthcheck.ts`의 `pingClaudeCli`가 fail. 다시 `claude login` 실행 필요.

> **API key 사용 금지** (메모리 룰 — `ANTHROPIC_API_KEY`는 다른 용도 전용). blog-autopilot은 Max 구독의 OAuth 토큰만 사용합니다.

> 두 컴퓨터에서 각각 로그인하면 Anthropic은 디바이스별 토큰을 발급. 같은 계정이라 양쪽 모두 정상 작동.

---

## 5. 환경 변수 (.env.local) + GitHub Secrets

각 MacBook의 `.env.local`에 다음 20개 키 (`.github/workflows/auto-publish.yml`의 `secrets.*` 참조 1:1 매칭):

```bash
# 외부 이미지 API
PIXABAY_API_KEY=...
PEXELS_API_KEY=...

# WordPress WS (worldsignal)
WORDPRESS_WS_ACCESS_TOKEN=...
WORDPRESS_WS_BLOG_ID=...
WORDPRESS_WS_CLIENT_ID=...
WORDPRESS_WS_CLIENT_SECRET=...
WORDPRESS_WS_SITE=...
WORDPRESS_WS_CATEGORY_ID=...

# WordPress TS (travelsignal)
WORDPRESS_TS_ACCESS_TOKEN=...
WORDPRESS_TS_BLOG_ID=...
WORDPRESS_TS_CLIENT_ID=...
WORDPRESS_TS_CLIENT_SECRET=...
WORDPRESS_TS_SITE=...
WORDPRESS_TS_CATEGORY_ID=...

# Blogger AS (aptsignal)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_BLOG_ID=...

# DB / GitHub
DATABASE_PATH=/Users/kyusikkim/projects/blog-autopilot/data/blog.db
GH_TOKEN=...  # gh CLI auth (Issue dispatch + workflow invocation)
```

총 **20개 키** (`GITHUB_REPOSITORY`는 `${{ github.repository }}`로 Actions가 자동 주입, secret 등록 불필요).

### GitHub Secrets 일괄 등록 (어느 컴퓨터에서나 1회)

GitHub Secrets는 repo 단위 — 한쪽 컴퓨터에서 등록하면 두 runner 모두 사용:

```bash
# .env.local에서 읽어서 secrets에 넣기
while IFS='=' read -r key value; do
  [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
  echo "Setting secret: $key"
  gh secret set "$key" --body "$value"
done < .env.local

# 확인
gh secret list
# → 20개 secret 모두 존재해야 함
```

---

## 6. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `actions-runner.err`에 `not authorized` | runner token 만료 또는 등록 실패 | runner 재등록 (`./config.sh remove` 후 재실행) |
| cron 발화 안 함 | 집 MacBook sleep + pmset 미설정 | `sudo pmset repeat wake MTWRFSU 01:10:00` (집 MacBook) |
| `home` runner offline 상태로 cron 발동 | 집 MacBook 닫힘/꺼짐 | GitHub은 home runner 깨어날 때까지 queue 보관 (기본 24시간). 빨리 돌리려면 `gh workflow run auto-publish.yml -f runner=office`로 회사에서 수동 실행 |
| 양쪽 runner 모두 offline | 둘 다 sleep | 한쪽 wake 후 자동 처리. 또는 GitHub-hosted으로 임시 fallback (workflow `runs-on:` 임시 변경) |
| `claude: command not found` | LaunchAgent PATH 누락 | plist에 `EnvironmentVariables` 키 추가 (PATH 명시) |
| healthcheck 401 | OAuth/토큰 만료 | 해당 서비스 재로그인 (수동) — Blogger refresh token 또는 WordPress access token |
| `gh issue create`가 hang | --repo 누락 + cwd 비-git | workflow `env: GITHUB_REPOSITORY: ${{ github.repository }}` 자동 주입됨. cron context에서 작동 |
| `data/blog.db` 권한 거부 | LaunchAgent uid 다름 | `chown $(whoami) ./data/blog.db` |
| `published_posts` 마이그레이션 미적용 | 첫 실행 | `pnpm tsx scripts/migrate.ts` 또는 healthcheck-only 실행 시 자동 적용 (DB init은 `lib/db.ts`가 처리) |
| 20개 secret 중 일부 누락 | gh secret 등록 실패 | `gh secret list` 확인 후 누락 키 재등록 |
| DB가 두 컴퓨터 간 sync 안 됨 | self-hosted runner는 로컬 DB 사용 (set-runner마다 별도 DB) | cron은 `home`만 사용하므로 home의 DB가 실제 운영 DB. office에서 dispatch 시 office의 DB에 row 추가됨 (조심) — 일관성 필요하면 cron 변경 또는 DB 단일화 (Phase 2) |

---

## 셋업 검증 체크리스트

각 컴퓨터에서 적용:

- [ ] `gh api repos/kkyu92/blog-autopilot/actions/runners` → home-mbp + office-mbp 둘 다 `"online"`
- [ ] `launchctl list | grep actions.runner` → 살아 있음 (각 컴퓨터)
- [ ] (집만) `pmset -g sched` → 매일 01:10 wake 등록됨
- [ ] `claude --version` + 1-shot 테스트 응답 정상 (각 컴퓨터)
- [ ] 집의 `.env.local` 20개 키 존재 + 회사도 동일 (`grep -cE '^[A-Z][A-Z_0-9]*=' .env.local` ≈ 20)
- [ ] `gh secret list` 20개 항목 존재 (repo 공통)
- [ ] 집에서 `pnpm tsx scripts/auto-publish.ts --mode=healthcheck-only` 통과 (외부 API 호출됨)

이 항목들 모두 통과하면 PR6 cron이 첫 KST 10:17 (집 MacBook)에 자동 발화합니다.

---

## 운영 패턴 요약

| 시나리오 | 동작 |
|---|---|
| 매일 10:17 KST 자동 cron | `home` runner (집 MacBook)에서 9건 발행 |
| 회사 시간 임시 발행 (예: 오전 11시 추가 1건) | `gh workflow run auto-publish.yml -f runner=office -f niche=WS -f slot_count=1` |
| 집 컴퓨터 임시 부재 (여행/이사) | cron 임시 비활성화 (`auto-publish.yml`의 `schedule:` 라인 주석) 또는 GitHub Actions UI에서 workflow disable |
| 양쪽 모두 활용 | 집 = cron + 야간 작업 / 회사 = 낮 시간 수동 보충 |
