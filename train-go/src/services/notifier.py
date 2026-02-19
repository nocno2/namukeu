import json
import logging

import httpx

logger = logging.getLogger(__name__)


class DiscordNotifier:
    """Discord 웹훅을 통한 알림."""

    def __init__(self, webhook_url: str):
        self._webhook_url = webhook_url

    async def send_message(self, text: str, embed: dict | None = None):
        """Discord 웹훅으로 메시지 전송."""
        timeout = httpx.Timeout(10.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                payload = {"content": text}
                if embed:
                    payload["embeds"] = [embed]
                resp = await client.post(self._webhook_url, json=payload)
                if resp.status_code not in (200, 204):
                    logger.error(f"Discord 웹훅 전송 실패: {resp.status_code} {resp.text}")
            except Exception as e:
                logger.error(f"Discord 알림 전송 실패: {e}")

    async def notify_reservation_success(self, reservation: dict, train_info: dict):
        dep_date = train_info.get("dep_date", "")
        dep_time = train_info.get("dep_time", "")
        arr_time = train_info.get("arr_time", "")
        train_name = train_info.get("train_name", "")
        provider = train_info.get("provider", "").upper()

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

        embed = {
            "title": "🚄 예약 성공!",
            "color": 0x00FF00,
            "fields": [
                {"name": "열차", "value": f"[{provider}] {train_name}", "inline": True},
                {"name": "구간", "value": f"{reservation['dep_station']} → {reservation['arr_station']}", "inline": True},
                {"name": "시간", "value": f"{date_fmt} {dep_fmt}~{arr_fmt}", "inline": True},
                {"name": "좌석", "value": f"{seat_type} | {pax_str}", "inline": True},
            ],
            "footer": {"text": "결제 기한 내 직접 결제 필요"},
        }
        await self.send_message("🚄 **예약 성공!**", embed=embed)

    async def notify_reservation_failed(self, reservation: dict, reason: str):
        embed = {
            "title": "❌ 예약 실패",
            "color": 0xFF0000,
            "fields": [
                {"name": "열차", "value": f"[{reservation['provider'].upper()}]", "inline": True},
                {"name": "구간", "value": f"{reservation['dep_station']} → {reservation['arr_station']}", "inline": True},
                {"name": "사유", "value": reason, "inline": False},
            ],
        }
        await self.send_message("❌ **예약 실패**", embed=embed)

    async def notify_search_started(self, reservation: dict):
        embed = {
            "title": "🔍 매크로 시작",
            "color": 0x0099FF,
            "fields": [
                {"name": "열차", "value": f"[{reservation['provider'].upper()}]", "inline": True},
                {"name": "구간", "value": f"{reservation['dep_station']} → {reservation['arr_station']}", "inline": True},
                {"name": "시간", "value": f"{reservation['date']} {reservation['time_range_start']}~{reservation['time_range_end']}", "inline": True},
            ],
        }
        await self.send_message("🔍 **매크로 시작**", embed=embed)

    async def notify_progress(self, reservation: dict, search_count: int, elapsed_min: int):
        embed = {
            "title": "🔄 매크로 진행 중",
            "color": 0xFFAA00,
            "fields": [
                {"name": "열차", "value": f"[{reservation['provider'].upper()}]", "inline": True},
                {"name": "구간", "value": f"{reservation['dep_station']} → {reservation['arr_station']}", "inline": True},
                {"name": "진행", "value": f"{search_count}회 검색 | {elapsed_min}분 경과", "inline": True},
            ],
            "footer": {"text": "아직 좌석 없음"},
        }
        await self.send_message("🔄 **매크로 진행 중**", embed=embed)

    async def notify_error(self, reservation: dict, error_type: str, error_msg: str):
        """에러 발생 알림."""
        embed = {
            "title": "⚠️ 매크로 에러",
            "color": 0xFF6600,
            "fields": [
                {"name": "열차", "value": f"[{reservation['provider'].upper()}]", "inline": True},
                {"name": "구간", "value": f"{reservation['dep_station']} → {reservation['arr_station']}", "inline": True},
                {"name": "에러 유형", "value": error_type, "inline": True},
                {"name": "메시지", "value": error_msg[:100], "inline": False},
            ],
        }
        await self.send_message("⚠️ **매크로 에러 발생**", embed=embed)


class TelegramNotifier:
    def __init__(self, bot_token: str, chat_id: str):
        self._bot_token = bot_token
        self._chat_id = chat_id
        self._base_url = f"https://api.telegram.org/bot{bot_token}"

    async def send_message(self, text: str):
        timeout = httpx.Timeout(10.0, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
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

    async def notify_error(self, reservation: dict, error_type: str, error_msg: str):
        """에러 발생 알림 (텔레그램용)."""
        text = (
            f"⚠️ *매크로 에러*\n"
            f"[{reservation['provider'].upper()}] "
            f"{reservation['dep_station']} → {reservation['arr_station']}\n"
            f"유형: {error_type}\n"
            f"메시지: {error_msg[:100]}"
        )
        await self.send_message(text)


class CompositeNotifier:
    """여러 알림 채널을 동시에 지원하는 컴포지트 노티파이어."""

    def __init__(self, notifiers: list):
        self._notifiers = notifiers

    async def notify_reservation_success(self, reservation: dict, train_info: dict):
        for notifier in self._notifiers:
            await notifier.notify_reservation_success(reservation, train_info)

    async def notify_reservation_failed(self, reservation: dict, reason: str):
        for notifier in self._notifiers:
            await notifier.notify_reservation_failed(reservation, reason)

    async def notify_search_started(self, reservation: dict):
        for notifier in self._notifiers:
            await notifier.notify_search_started(reservation)

    async def notify_progress(self, reservation: dict, search_count: int, elapsed_min: int):
        for notifier in self._notifiers:
            await notifier.notify_progress(reservation, search_count, elapsed_min)

    async def notify_error(self, reservation: dict, error_type: str, error_msg: str):
        """에러 발생 알림."""
        for notifier in self._notifiers:
            if hasattr(notifier, "notify_error"):
                await notifier.notify_error(reservation, error_type, error_msg)
            else:
                # 텔레그램은 notify_error가 없으면 일반 실패 알림
                await notifier.notify_reservation_failed(reservation, f"{error_type}: {error_msg[:50]}")

