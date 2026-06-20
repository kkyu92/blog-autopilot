# Runbook: Blogger refresh_token 재발급

## 이 알림은 언제 받는가

`token-monitor-blogger` 워크플로에서 `GOOGLE_REFRESH_TOKEN`이 `invalid_grant` 응답을 받을 때.

Google OAuth refresh_token 무효화 원인:
- 6개월 이상 미사용
- Google 계정 비밀번호 변경
- Google Cloud Console에서 앱 권한 회수
- 동일 계정 동일 앱에서 재인증 (이전 refresh_token 즉시 무효)

## 즉시 조치 (5분)

1. **home-mbp에서 로컬 서버 실행**
   ```bash
   cd ~/actions-runner/_work/blog-autopilot/blog-autopilot
   node --env-file=.env.local scripts/mid-review/reauth.mjs
   ```

2. **출력된 URL을 브라우저에서 열어 Google 계정 인증**
   - Google 계정 선택 → 권한 허용

3. **터미널에 출력된 새 refresh_token 확인**
   ```
   GOOGLE_REFRESH_TOKEN=1//0g...
   ```

4. **`.env.local` 갱신**
   ```bash
   # .env.local의 GOOGLE_REFRESH_TOKEN 값 교체
   ```

5. **GitHub Secrets 갱신**
   - `https://github.com/kkyu92/blog-autopilot/settings/secrets/actions`
   - `GOOGLE_REFRESH_TOKEN` → 새 값으로 업데이트

## 검증

```bash
# 워크플로 수동 실행으로 검증
gh workflow run token-monitor-blogger.yml
```

또는 GitHub Actions UI → Token Monitor — Blogger → Run workflow.

## 재발 방지

- refresh_token은 Google이 가끔 rotation하므로 `invalid_grant` 알림 즉시 갱신
- 재발급 후 이전 토큰은 즉시 무효 — 여러 곳에 저장된 경우 모두 동기화
