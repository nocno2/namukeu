#!/bin/bash
# IP 변경 감지 스크립트 (launchd: com.namukeu.check-ip)

IP_FILE="/Users/namwook/Documents/namukeu/coin-auto-trade/data/.current_ip"
BOT_TOKEN="8564686870:AAEnY_WoW6ZMxX7Pn9eoO1ey-WY94dHgiWE"
CHAT_ID="2141071966"

CURRENT_IP=$(curl -s --max-time 10 https://ifconfig.me 2>/dev/null || curl -s --max-time 10 https://api.ipify.org 2>/dev/null)
if [ -z "$CURRENT_IP" ]; then
    echo "$(date): IP 조회 실패"
    exit 0
fi

# 첫 실행이면 저장만
if [ ! -f "$IP_FILE" ]; then
    echo "$CURRENT_IP" > "$IP_FILE"
    echo "$(date): 초기 IP 저장: $CURRENT_IP"
    exit 0
fi

SAVED_IP=$(cat "$IP_FILE")

if [ "$CURRENT_IP" != "$SAVED_IP" ]; then
    echo "$CURRENT_IP" > "$IP_FILE"
    MSG=$(printf "⚠️ 공인 IP 변경 감지\n이전: %s\n현재: %s\n\n거래소 API 허용 IP를 업데이트하세요." "$SAVED_IP" "$CURRENT_IP")
    RESULT=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d "chat_id=${CHAT_ID}" \
        --data-urlencode "text=${MSG}" 2>&1)
    echo "$(date): IP 변경 감지 ${SAVED_IP} -> ${CURRENT_IP} | 알림: ${RESULT}"
fi
