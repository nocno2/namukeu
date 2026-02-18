"""
TRADE - Stock Trading Platform Backend
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.config import HOST, PORT
from src.db import init_db
from src.api import (
    auth_router,
    stocks_router,
    trading_router,
    strategies_router,
    news_router,
    alerts_router,
    watchlist_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup
    await init_db()
    print("Database initialized")
    yield
    # Shutdown
    print("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title="TRADE API",
    description="Stock Trading Platform API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(stocks_router)
app.include_router(trading_router)
app.include_router(strategies_router)
app.include_router(news_router)
app.include_router(alerts_router)
app.include_router(watchlist_router)


@app.get("/")
async def root():
    """Health check."""
    return {"status": "ok", "service": "TRADE API"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=HOST,
        port=PORT,
        reload=True,
    )
