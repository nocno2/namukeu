import json
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
                    # Markdown 실패 시 plain text 재시도
                    await client.post(
                        f"{self._base_url}/sendMessage",
                        json={"chat_id": self._chat_id, "text": text},
                    )
            except Exception as e:
                logger.error(f"텔레그램 알림 전송 실패: {e}")

    async def notify_reservation_success(self, reservation: dict, train_info: dict):
        dep_date = train_info.get("dep_date", "")
        dep_time = train_info.get("dep_time", "")
        arr_time = train_info.get("arr_time", "")
        train_name = train_info.get("train_name", "")
        provider = train_info.get("provider", "").upper()

        # 시간 포맷팅
        dep_fmt = f"{dep_time[:2]}:{dep_time[2:4]}" if len(dep_time) >= 4 else dep_time
        arr_fmt = f"{arr_time[:2]}:{arr_time[2:4]}" if len(arr_time) >= 4 else arr_time
        date_fmt = f"{dep_date[4:6]}/{dep_date[6:8]}" if len(dep_date) >= 8 else dep_date

        passengers = json.loads(reservation.get("passengers", "{}"))
        pax_parts = []
        if passengers.get("adult", 0) > 0:
            pax_parts.append(f"성인 {passengers['adult']}")
        if passengers.get("child", 0) > 0:
            pax_parts.append(f"어린이 {passengers['child']}")
        if passengers.get("senior", 0) > 0:
            pax_parts.append(f"경로 {passengers['senior']}")
        pax_str = ", ".join(pax_parts) or "성인 1"

        seat_type = "특실" if reservation.get("seat_type") == "special" else "일반실"

        text = (
            f"🚄 *예약 성공!*\n"
            f"[{provider}] {train_name}\n"
            f"{reservation['dep_station']} → {reservation['arr_station']}\n"
            f"{date_fmt} {dep_fmt}~{arr_fmt}\n"
            f"{seat_type} | {pax_str}\n"
            f"⚠️ 결제 기한 내 직접 결제 필요"
        )
        await self.send_message(text)

    async def notify_reservation_failed(self, reservation: dict, reason: str):
        text = (
            f"❌ *예약 실패*\n"
            f"[{reservation['provider'].upper()}] "
            f"{reservation['dep_station']} → {reservation['arr_station']}\n"
            f"사유: {reason}"
        )
        await self.send_message(text)

    async def notify_search_started(self, reservation: dict):
        text = (
            f"🔍 *매크로 시작*\n"
            f"[{reservation['provider'].upper()}] "
            f"{reservation['dep_station']} → {reservation['arr_station']}\n"
            f"{reservation['date']} {reservation['time_range_start']}~{reservation['time_range_end']}"
        )
        await self.send_message(text)

    async def notify_progress(self, reservation: dict, search_count: int, elapsed_min: int):
        text = (
            f"🔄 *매크로 진행 중*\n"
            f"[{reservation['provider'].upper()}] "
            f"{reservation['dep_station']} → {reservation['arr_station']}\n"
            f"{search_count}회 검색 | {elapsed_min}분 경과\n"
            f"아직 좌석 없음"
        )
        await self.send_message(text)
