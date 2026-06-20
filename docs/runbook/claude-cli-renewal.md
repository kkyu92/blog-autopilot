# Runbook: Claude CLI 재인증

## 이 알림은 언제 받는가

`token-monitor-claude` 워크플로에서 `claude --print "ok"` 가 실패할 때.

영향: auto-publish 워크플로 시작 시 healthcheck가 Claude CLI 응답을 기다리는 경우,
인증 만료 시 cron이 healthcheck fail → 전체 publish skip 위험.

## 즉시 조치 (2분)

1. **home-mbp 터미널에서 재로그인**
   ```bash
   claude logout
   claude login
   ```
   브라우저가 열리면 Anthropic 계정으로 인증.

2. **인증 확인**
   ```bash
   claude --print "ok"
   ```
   응답이 정상적으로 오면 완료.

## 검증

```bash
# 워크플로 수동 실행으로 검증
gh workflow run token-monitor-claude.yml
```

또는 GitHub Actions UI → Token Monitor — Claude CLI → Run workflow.

## 참고

- Claude CLI 인증 토큰 위치: `~/.config/anthropic/` (macOS)
- 토큰은 self-hosted runner 환경에만 있으며 공유 불가 — 수동 재로그인만 가능
- runner가 오프라인이면 이 워크플로도 실행 안 됨 — runner 상태 먼저 확인
