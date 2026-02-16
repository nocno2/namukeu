"""Telegram Bot API direct HTTP calls via httpx."""

import logging

import httpx

logger = logging.getLogger(__name__)

APPROVE_PATTERN_SUFFIX = "실행하려면 /approve "


class TelegramNotifier:
    def __init__(self, bot_token: str, default_chat_id: str):
        self.bot_token = bot_token
        self.default_chat_id = default_chat_id
        self.base_url = f"https://api.telegram.org/bot{bot_token}"
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30)
        return self._client

    async def send_message(
        self,
        text: str,
        chat_id: str | None = None,
        parse_mode: str = "Markdown",
        reply_markup: dict | None = None,
    ) -> bool:
        if not self.bot_token or not text:
            return False

        target = chat_id or self.default_chat_id
        if not target:
            return False

        client = await self._get_client()

        # Auto-attach approval buttons
        if APPROVE_PATTERN_SUFFIX in text:
            import re
            match = re.search(r"실행하려면 /approve ([a-f0-9]{8})$", text)
            if match:
                task_prefix = match.group(1)
                clean_text = re.sub(r"\n실행하려면 /approve [a-f0-9]{8}$", "", text)
                reply_markup = {
                    "inline_keyboard": [[
                        {"text": "\u2713 승인", "callback_data": f"app_{task_prefix}"},
                        {"text": "\u2717 거절", "callback_data": f"rej_{task_prefix}"},
                    ]]
                }
                text = clean_text

        # Chunk long messages
        chunks = self._split_message(text)
        for chunk in chunks:
            payload: dict = {
                "chat_id": int(target),
                "text": chunk,
            }
            if reply_markup:
                payload["reply_markup"] = reply_markup
                reply_markup = None  # Only attach to first chunk

            # Try with Markdown first, fallback to plain
            for mode in [parse_mode, None]:
                try:
                    if mode:
                        payload["parse_mode"] = mode
                    elif "parse_mode" in payload:
                        del payload["parse_mode"]
                    resp = await client.post(f"{self.base_url}/sendMessage", json=payload)
                    if resp.status_code == 200:
                        break
                except Exception as e:
                    logger.warning(f"Telegram send error: {e}")
                    continue

        return True

    @staticmethod
    def _split_message(text: str, max_len: int = 4000) -> list[str]:
        if len(text) <= max_len:
            return [text]

        chunks = []
        remaining = text
        while remaining:
            if len(remaining) <= max_len:
                chunks.append(remaining)
                break
            split_at = remaining.rfind("\n\n", 0, max_len)
            if split_at <= 0:
                split_at = remaining.rfind("\n", 0, max_len)
            if split_at <= 0:
                split_at = max_len
            chunks.append(remaining[:split_at])
            remaining = remaining[split_at:].lstrip()
        return chunks

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
