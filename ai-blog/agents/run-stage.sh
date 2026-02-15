#!/bin/bash
# 블로그 파이프라인 - 단일 스테이지 실행
#
# 사용법:
#   ./agents/run-stage.sh <stage> <pipeline_id>
#
# stage: research | write | review | notify (또는 1 | 2 | 3 | 4)
# pipeline_id: 파이프라인 실행 ID (예: 20260215-005500)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BLOG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGES_DIR="$SCRIPT_DIR/stages"

cd "$BLOG_DIR"

STAGE="${1:?Usage: $0 <research|write|review|notify> <pipeline_id>}"
PIPELINE_ID="${2:?Pipeline ID is required. Usage: $0 <stage> <pipeline_id>}"

# 스테이지명 정규화
case "$STAGE" in
  research|1)  STAGE_FILE="1-research.md"; STAGE_NAME="research" ;;
  write|2)     STAGE_FILE="2-write.md";    STAGE_NAME="write" ;;
  review|3)    STAGE_FILE="3-review.md";   STAGE_NAME="review" ;;
  notify|4)    STAGE_FILE="4-notify.sh";   STAGE_NAME="notify" ;;
  *)
    echo "Error: Unknown stage '$STAGE'"
    echo "Usage: $0 <research|write|review|notify> <pipeline_id>"
    exit 1
    ;;
esac

echo "[$(date '+%H:%M:%S')] Stage: $STAGE_NAME | Pipeline: $PIPELINE_ID"

if [[ "$STAGE_FILE" == *.sh ]]; then
  # 알림 스테이지: 쉘 스크립트 직접 실행
  bash "$STAGES_DIR/$STAGE_FILE" "$PIPELINE_ID"
else
  # Claude 프롬프트 스테이지: __PIPELINE_ID__ 치환 후 실행
  PROMPT=$(sed "s/__PIPELINE_ID__/$PIPELINE_ID/g" "$STAGES_DIR/$STAGE_FILE")
  claude --print --dangerously-skip-permissions "$PROMPT"
fi

echo "[$(date '+%H:%M:%S')] Stage $STAGE_NAME completed."
