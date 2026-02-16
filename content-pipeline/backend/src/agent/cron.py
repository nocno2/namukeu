"""Cron expression utilities using croniter."""

from datetime import datetime

from croniter import croniter


def get_next_cron_time(expression: str, after: datetime | None = None) -> datetime:
    base = after or datetime.now()
    cron = croniter(expression, base)
    return cron.get_next(datetime)


def cron_matches_now(expression: str, now: datetime | None = None) -> bool:
    dt = now or datetime.now()
    return croniter.match(expression, dt)


def is_valid_cron(expression: str) -> bool:
    return croniter.is_valid(expression)
