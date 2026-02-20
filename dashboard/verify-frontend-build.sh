#!/usr/bin/env bash
set -e

# DASH 프론트엔드 빌드 검증 스크립트
# 백엔드 변경 시 프론트엔드 빌드까지 검증하여 번거로움 해결

FRONTEND_DIR="$(cd "$(dirname "$0")/frontend" && pwd)"

echo "📦 Building frontend..."
cd "$FRONTEND_DIR"

# tsc로 타입 체크 + vite로 빌드
bun run build

echo "✅ Frontend build completed successfully"
