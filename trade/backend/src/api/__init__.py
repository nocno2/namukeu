from src.api.auth import router as auth_router
from src.api.stocks import router as stocks_router
from src.api.trading import router as trading_router
from src.api.strategies import router as strategies_router
from src.api.news import router as news_router
from src.api.alerts import router as alerts_router
from src.api.watchlist import router as watchlist_router

__all__ = [
    "auth_router",
    "stocks_router",
    "trading_router",
    "strategies_router",
    "news_router",
    "alerts_router",
    "watchlist_router",
]
