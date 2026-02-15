#!/bin/bash
# 블로그 파이프라인 알림 스테이지
# reviewed 상태의 초안에 대해 Telegram + Discord 알림 발송
# Claude 세션 불필요 (토큰 0 소비)
set -euo pipefail

PIPELINE_ID="${1:?Usage: $0 <pipeline_id>}"
DB="/Users/namwook/Documents/namukeu/ai-blog/data/blog.db"
TELEGRAM_ENV="/Users/namwook/Documents/namukeu/claude-telegram/.env"
DISCORD_WEBHOOK="https://discordapp.com/api/webhooks/1472256821698891787/jUdMY4pnmKCvQ4WNI4tObETBZ4Hc2BoeLGtynSEibf_j2UZpWdlDY8ilDMN-QUwAdW8l"

# Telegram 정보 로드
TELEGRAM_BOT_TOKEN=$(grep '^TELEGRAM_BOT_TOKEN=' "$TELEGRAM_ENV" | cut -d'=' -f2-)
TELEGRAM_USER_ID=$(grep '^TELEGRAM_USER_ID=' "$TELEGRAM_ENV" | cut -d'=' -f2-)

# 알림 대상 조회
DRAFTS=$(sqlite3 -separator '|' "$DB" \
  "SELECT id, title, review_score FROM drafts WHERE pipeline_id = '$PIPELINE_ID' AND status = 'reviewed' AND notified_at IS NULL;")

if [ -z "$DRAFTS" ]; then
  echo "알림 대상 draft가 없습니다."
  exit 0
fi

COUNT=0
while IFS='|' read -r id title score; do
  MSG="[Blog] 새 초안 검토 완료\n\n제목: ${title}\n품질: ${score}/10\n\n승인: https://blog.namukeu.com/admin/drafts/${id}"

  # Telegram
  if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_USER_ID" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -H "Content-Type: application/json" \
      -d "{\"chat_id\": \"${TELEGRAM_USER_ID}\", \"text\": \"${MSG}\"}" > /dev/null
  fi

  # Discord
  curl -s -X POST "$DISCORD_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"${MSG}\"}" > /dev/null

  # notified_at 업데이트
  sqlite3 "$DB" "UPDATE drafts SET notified_at = datetime('now') WHERE id = $id;"

  echo "알림 전송: [${id}] ${title} (${score}/10)"
  COUNT=$((COUNT + 1))
done <<< "$DRAFTS"

echo "총 ${COUNT}건 알림 전송 완료."
