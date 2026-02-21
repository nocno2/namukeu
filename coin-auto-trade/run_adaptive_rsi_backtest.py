#!/usr/bin/env python3
"""Adaptive RSI 백테스트 실행 스크립트."""
import asyncio
import sys
sys.path.insert(0, "/Users/namwook/Documents/namukeu/coin-auto-trade")

from src.core.database import Database
from src.services.backtester import Backtester, BacktestConfig

async def main():
    db = Database("data/coin-auto-trade.db")
    backtester = Backtester(db)

    config = BacktestConfig(
        ticker="KRW-BTC",
        strategy_name="adaptive_rsi",
        strategy_params={"rsi_period": 14},
        interval="minute60",
        start_date="20250101",
        end_date="20260220",
        initial_capital=1_000_000,
        fee_rate=0.0005,
        leverage=1,
        enable_short=False,
        trailing_stop_pct=2.0,
        stop_loss_pct=5.0,
    )

    print(f"Adaptive RSI 백테스트 실행 중...")
    result = await backtester.run(config)

    print(f"\n=== 백테스트 결과 ===")
    print(f"총 수익률: {result.total_return_pct:.2f}%")
    print(f"최대 낙폭: {result.max_drawdown_pct:.2f}%")
    print(f"승률: {result.win_rate:.2f}%")
    print(f"총 거래 횟수: {result.total_trades}")
    print(f"Sharpe Ratio: {result.sharpe_ratio:.2f}")
    print(f"Final Capital: {result.final_capital:,.0f} KRW")

    # 저장
    result_id = backtester.save_result(result)
    print(f"\n백테스트 결과 ID: {result_id}")

if __name__ == "__main__":
    asyncio.run(main())
