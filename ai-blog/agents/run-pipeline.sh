#!/bin/bash
# 블로그 콘텐츠 파이프라인 - 전체 실행
# 4단계를 순차적으로 실행하며, 실패 시 중단합니다.
# 중단된 경우 같은 pipeline_id로 실패한 단계만 재실행 가능:
#   ./agents/run-stage.sh <stage> <pipeline_id>
#
# 사용법:
#   ./agents/run-pipeline.sh
#
# cron 등록 예시:
#   0 9 * * * cd /Users/namwook/Documents/namukeu/ai-blog && ./agents/run-pipeline.sh >> /tmp/blog-pipeline.log 2>&1
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.." || exit 1

PIPELINE_ID=$(date +%Y%m%d-%H%M%S)

echo "========================================"
echo "Blog Pipeline: $PIPELINE_ID"
echo "Started: $(date)"
echo "========================================"

STAGES=(research write review notify)

for stage in "${STAGES[@]}"; do
  echo ""
  echo "--- Stage: $stage ---"
  "$SCRIPT_DIR/run-stage.sh" "$stage" "$PIPELINE_ID"
done

echo ""
echo "========================================"
echo "Pipeline $PIPELINE_ID completed."
echo "Finished: $(date)"
echo "========================================"
