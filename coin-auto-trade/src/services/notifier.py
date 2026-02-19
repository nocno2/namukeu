import logging

import httpx

logger = logging.getLogger(__name__)


class TelegramNotifier:
    def __init__(self, bot_token: str, chat_id: str):
        self._bot_token = bot_token
        self._chat_id = chat_id
        self._base_url = f"https://api.telegram.org/bot{bot_token}"

    async def send_message(self, text: str):
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.post(
                    f"{self._base_url}/sendMessage",
                    json={
                        "chat_id": self._chat_id,
                        "text": text,
                        "parse_mode": "Markdown",
                    },
                )
                if resp.status_code != 200:
                    await client.post(
                        f"{self._base_url}/sendMessage",
                        json={"chat_id": self._chat_id, "text": text},
                    )
            except Exception as e:
                logger.error(f"텔레그램 알림 전송 실패: {e}")

    async def notify_trade(self, side: str, ticker: str, amount: float, price: float, reason: str,
                           quote_currency: str = "KRW"):
        label_map = {
            "buy": ("🟢", "BUY"),
            "sell": ("🔴", "SELL"),
            "open_long": ("🟢", "LONG OPEN"),
            "close_long": ("🔴", "LONG CLOSE"),
            "open_short": ("🔴", "SHORT OPEN"),
            "close_short": ("🟢", "SHORT CLOSE"),
        }
        emoji, label = label_map.get(side, ("⚪", side.upper()))
        text = (
            f"{emoji} *{label}* `{ticker}`\n"
            f"가격: {price:,.2f} {quote_currency}\n"
            f"금액: {amount:,.2f} {quote_currency}\n"
            f"사유: {reason}"
        )
        await self.send_message(text)

    async def notify_risk_halt(self, reason: str):
        text = f"🚨 *거래 중단*\n사유: {reason}"
        await self.send_message(text)

    async def notify_error(self, context: str, error: str):
        text = f"❌ *에러 발생*\n위치: {context}\n내용: {error}"
        await self.send_message(text)

    async def notify_transition_check(self, result: dict):
        """전환 가능성 체크 결과를 텔레그램으로 전송."""
        ready = result.get("ready_for_live", False)
        paper = result.get("paper_trading", {})
        drawdown = result.get("drawdown", {})
        backtest = result.get("backtest", {})

        emoji = "✅" if ready else "⏳"
        status = "전환 준비 완료!" if ready else "전환 조건 미충족"

        text = (
            f"{emoji} *전환 체크*\n"
            f"상태: {status}\n\n"
            f"📊 백테스트\n"
            f"  - 총 실행: {backtest.get('total', 0)}회\n"
            f"  - 수익 전략: {backtest.get('profitable', 0)}회 ({backtest.get('profitable_rate', 0):.1f}%)\n\n"
            f"📈 페이퍼 트레이딩\n"
            f"  - 거래 횟수: {paper.get('completed_trades', 0)}회\n"
            f"  - 승률: {paper.get('win_rate', 0):.1f}%\n"
            f"  - 총 수익: {paper.get('total_pnl', 0):,.0f} KRW\n\n"
            f"📉 최대 낙폭\n"
            f"  - 현재: {drawdown.get('current_max', 0):.2f}%\n"
            f"  - 기준: {drawdown.get('threshold', 0):.1f}% 이하"
        )
        await self.send_message(text)
