#!/bin/bash
# Fly.io 초기 설정 스크립트 (최초 1회 실행)
#
# 사전 준비:
#   1. brew install flyctl
#   2. fly auth login
#
# 사용법:
#   chmod +x scripts/fly-setup.sh
#   ./scripts/fly-setup.sh

set -e

echo "=== Blog Autopilot — Fly.io 초기 설정 ==="
echo ""

# 1. Fly 앱 생성
echo "[1/5] 앱 생성..."
fly apps create blog-autopilot --org personal 2>/dev/null || echo "  → 앱이 이미 존재합니다"

# 2. Volume 생성 (SQLite 영속 스토리지)
echo "[2/5] Volume 생성 (1GB, nrt 리전)..."
fly volumes create content_data \
  --region nrt \
  --size 1 \
  --count 1 \
  --app blog-autopilot 2>/dev/null || echo "  → Volume이 이미 존재합니다"

# 3. Secrets 설정
echo "[3/5] Secrets 설정..."
echo "  다음 명령어로 환경변수를 설정하세요:"
echo ""
echo "  fly secrets set \\"
echo "    ANTHROPIC_API_KEY=sk-ant-... \\"
echo "    GOOGLE_CLIENT_ID=... \\"
echo "    GOOGLE_CLIENT_SECRET=... \\"
echo "    GOOGLE_REDIRECT_URI=https://blog-autopilot.fly.dev/api/auth/blogger/callback \\"
echo "    NAVER_CLIENT_ID=... \\"
echo "    NAVER_CLIENT_SECRET=... \\"
echo "    NAVER_REDIRECT_URI=https://blog-autopilot.fly.dev/api/auth/naver/callback \\"
echo "    AUTH_TOKEN=<원하는-비밀번호> \\"
echo "    --app blog-autopilot"
echo ""

# 4. GitHub Actions용 토큰
echo "[4/5] GitHub Actions 연동..."
echo "  Fly API 토큰을 생성하고 GitHub Secrets에 추가하세요:"
echo ""
echo "  fly tokens create deploy --app blog-autopilot"
echo "  → 출력된 토큰을 GitHub repo Settings > Secrets > FLY_API_TOKEN 에 추가"
echo ""

# 5. 첫 배포
echo "[5/5] 첫 배포..."
echo "  fly deploy --app blog-autopilot"
echo ""
echo "  또는 main에 push하면 GitHub Actions가 자동 배포합니다."
echo ""
echo "=== 설정 완료! ==="
echo ""
echo "배포 후 확인:"
echo "  fly open --app blog-autopilot"
echo "  fly logs --app blog-autopilot"
echo "  fly status --app blog-autopilot"
