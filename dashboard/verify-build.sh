#!/bin/bash
# DASH 프론트엔드 빌드 검증 스크립트
# 백엔드 변경 후 프론트엔드 빌드 확인용

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/frontend"

echo "=== DASH 프론트엔드 빌드 검증 ==="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    bun install
fi

echo "1. TypeScript 타입 체크..."
bun run tsc --noEmit

echo ""
echo "2. 빌드 실행..."
bun run build

echo ""
echo "=== 검증 완료 ==="
echo "dist/ 디렉토리가 생성되었습니다."
