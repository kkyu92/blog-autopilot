# Self-hosted Runner 셋업 (Mac mini)

PR6 auto-publish workflow는 self-hosted runner (Mac mini)에서 실행됩니다. 이 문서는 1회 셋업 가이드입니다.

---

## 1. GitHub runner 등록

```bash
# repo Settings → Actions → Runners → New self-hosted runner (macOS)
# 페이지에 표시된 명령 실행:

mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-osx-x64-2.x.x.tar.gz -L https://github.com/actions/runner/releases/download/...
tar xzf ./actions-runner-osx-x64-2.x.x.tar.gz
./config.sh --url https://github.com/kkyu92/content-autopilot --token <runner-token>
# label: blog-autopilot, work folder: _work, 그 외 default
```

등록 확인:
```bash
gh api repos/kkyu92/content-autopilot/actions/runners | jq '.runners[].status'
# → "online"
```

---

## 2. LaunchAgent (자동 시작 + KeepAlive)

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

`KeepAlive=true`로 runner 프로세스가 죽으면 자동 재시작됩니다. macOS 재부팅 후에도 `RunAtLoad=true`로 자동 기동.

---

## 3. pmset wake schedule (Mac mini sleep 시 깨우기)

cron 01:17 (UTC) = KST 10:17 발화 전에 Mac이 깨어 있어야 self-hosted runner가 job을 받습니다.

```bash
# 매일 01:10 KST (= cron 01:17 보다 7분 전)에 wake
sudo pmset repeat wake MTWRFSU 01:10:00

# 확인
pmset -g sched
# → wakeorpoweron at 01:10:00 every day
```

> 주의: `pmset repeat`는 **하나만** 활성화됩니다. 다른 wake schedule이 필요하면 `pmset schedule` (단발성) 병행 사용.

---

## 4. claude CLI OAuth 셋업

blog-autopilot은 **Claude Code Max 구독**을 사용합니다 (API key 아님). `claude` CLI를 runner의 사용자 셸에서 1회 로그인하면 OAuth 토큰이 저장되어 워크플로우가 그 토큰으로 호출합니다.

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

---

## 5. 환경 변수 (.env.local)

`/Users/kyusikkim/projects/content-autopilot/.env.local`에 다음 20개 키 모두 존재 확인 (`.github/workflows/auto-publish.yml`의 `secrets.*` 참조 1:1 매칭):

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
DATABASE_PATH=/Users/kyusikkim/projects/content-autopilot/data/blog.db
GH_TOKEN=...  # gh CLI auth (Issue dispatch + workflow invocation)
```

총 **20개 키** (`GITHUB_REPOSITORY`는 `${{ github.repository }}`로 Actions가 자동 주입하므로 secret 등록 불필요).

GitHub repo Secrets에도 동일한 값 등록 (workflow injection용). 등록 명령:

```bash
# 일괄 등록 예시 (.env.local에서 읽어서 secrets에 넣기)
while IFS='=' read -r key value; do
  [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
  echo "Setting secret: $key"
  gh secret set "$key" --body "$value"
done < .env.local
```

등록 확인:
```bash
gh secret list
# → 21개 secret 모두 존재해야 함
```

---

## 6. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `actions-runner.err`에 `not authorized` | runner token 만료 | runner 재등록 (`./config.sh remove` 후 재실행) |
| cron 발화 안 함 | Mac mini sleep + pmset 미설정 | `sudo pmset repeat wake MTWRFSU 01:10:00` |
| `claude: command not found` | LaunchAgent PATH 누락 | plist에 `EnvironmentVariables` 키 추가 (PATH 명시) |
| healthcheck 401 | OAuth/토큰 만료 | 해당 서비스 재로그인 (수동) — Blogger refresh token 또는 WordPress access token |
| `gh issue create`가 hang | --repo 누락 + cwd 비-git | workflow `env: GITHUB_REPOSITORY: ${{ github.repository }}` 자동 주입됨 (auto-publish.yml에 존재). cron context에서 작동 |
| `data/blog.db` 권한 거부 | LaunchAgent uid 다름 | `chown $(whoami) ./data/blog.db` |
| `published_posts` 마이그레이션 미적용 | 첫 실행 | `pnpm tsx scripts/migrate.ts` 또는 healthcheck-only 실행 시 자동 적용 (DB init은 `lib/db.ts`가 처리) |
| 20개 secret 중 일부 누락 | gh secret 등록 실패 | `gh secret list` 확인 후 누락 키 재등록 |

---

## 셋업 검증 체크리스트

- [ ] `gh api repos/kkyu92/content-autopilot/actions/runners` → `"online"`
- [ ] `launchctl list | grep actions.runner` → 살아 있음
- [ ] `pmset -g sched` → 매일 01:10 wake 등록됨
- [ ] `claude --version` + 1-shot 테스트 응답 정상
- [ ] `.env.local` 20개 키 존재 (`grep -cE '^[A-Z][A-Z_0-9]*=' .env.local` ≈ 20)
- [ ] `gh secret list` 20개 항목 존재
- [ ] `pnpm tsx scripts/auto-publish.ts --mode=healthcheck-only` 통과

이 7가지 모두 통과하면 PR6 cron이 첫 KST 10:17에 자동 발화합니다.
