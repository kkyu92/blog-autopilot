# Pending manual patches (workflow push 차단)

`.github/workflows/*.yml` 수정 커밋은 이 repo의 GitHub App 토큰에 `workflows`
scope 가 없어 `git push origin main` 이 항상 거부됨 (로컬 커밋 자체는 성공).
수동 push 필요 — **이 self-hosted runner 는 home-mbp 본인 머신**이므로, 아래
branch 를 본인 git 자격증명으로 push/merge 하면 됨.

같은 fingerprint 가 push 안 된 patch 때문에 세 번 재발한 사례
(claude-cli-token-dead: 2026-07-24/25 → lesson 150c927e → 미반영 → 2026-09-11
#429 재발 → 미반영 → 2026-10-17 #4725/#440 재발)가 있어, 이 표로 추적한다.
**patch 가 실제로 push 됐는지 다음 세션이 `git log origin/main` 으로 확인하고
반영됐으면 이 표에서 줄을 지울 것.**

| 로컬 브랜치 | 파일 | 내용 | 상태 |
|---|---|---|---|
| `pending/token-monitor-claude-fix` (95b0d10f) | `.github/workflows/token-monitor-claude.yml` | weekly/usage limit → severity `warning` 분리 (critical 오발화 방지, closes #440) | 로컬 커밋만 완료. `git push origin main` 거부됨 — 본인 자격증명으로 `git merge pending/token-monitor-claude-fix && git push origin main` 필요 |
