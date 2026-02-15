import pandas as pd

from src.strategies.base import Signal, TradeSignal
from src.strategies.registry import register, get_strategy


@register
class CombinedStrategy:
    @property
    def name(self) -> str:
        return "combined"

    @property
    def required_candle_count(self) -> int:
        return 60  # max of sub-strategies

    @property
    def default_params(self) -> dict:
        return {
            "strategies": {
                "rsi": {"weight": 0.4, "params": {}},
                "macd": {"weight": 0.35, "params": {}},
                "bollinger": {"weight": 0.25, "params": {}},
            },
            "buy_threshold": 0.5,
            "sell_threshold": 0.5,
        }

    def analyze(self, df: pd.DataFrame, params: dict | None = None) -> TradeSignal:
        p = {**self.default_params, **(params or {})}
        strategies_config = p["strategies"]

        buy_score = 0.0
        sell_score = 0.0
        all_indicators = {}
        reasons = []

        for strategy_name, config in strategies_config.items():
            weight = config.get("weight", 1.0 / len(strategies_config))
            sub_params = config.get("params", {})

            try:
                strategy = get_strategy(strategy_name)
                signal = strategy.analyze(df, sub_params)

                all_indicators[strategy_name] = signal.indicators

                if signal.signal == Signal.BUY:
                    buy_score += weight * signal.confidence
                    reasons.append(f"{strategy_name}: BUY ({signal.confidence:.2f})")
                elif signal.signal == Signal.SELL:
                    sell_score += weight * signal.confidence
                    reasons.append(f"{strategy_name}: SELL ({signal.confidence:.2f})")
                else:
                    reasons.append(f"{strategy_name}: HOLD")
            except Exception:
                reasons.append(f"{strategy_name}: ERROR")

        reason_str = " | ".join(reasons)
        all_indicators["buy_score"] = round(buy_score, 3)
        all_indicators["sell_score"] = round(sell_score, 3)

        if buy_score >= p["buy_threshold"] and buy_score > sell_score:
            return TradeSignal(
                signal=Signal.BUY,
                ticker="",
                confidence=buy_score,
                reason=f"복합 매수 ({buy_score:.2f}): {reason_str}",
                indicators=all_indicators,
            )
        elif sell_score >= p["sell_threshold"] and sell_score > buy_score:
            return TradeSignal(
                signal=Signal.SELL,
                ticker="",
                confidence=sell_score,
                reason=f"복합 매도 ({sell_score:.2f}): {reason_str}",
                indicators=all_indicators,
            )
        else:
            return TradeSignal(
                signal=Signal.HOLD,
                ticker="",
                confidence=0.0,
                reason=f"복합 관망: {reason_str}",
                indicators=all_indicators,
            )
