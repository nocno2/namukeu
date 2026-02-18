"""RSI + 200MA Filter Strategy.

Market regime detection:
- Bull (상승장): Price > 200MA - Buy on RSI oversold
- Bear (하락장): Price < 200MA - No trades (or short only)
"""
import pandas as pd
import pandas_ta_classic as ta

from src.strategies.base import Signal, TradeSignal
from src.strategies.registry import register


@register
class RSIMAChoiceStrategy:
    """RSI with 200MA filter for market regime detection.

    Bull market: Buy when RSI < oversold threshold
    Bear market: Hold (avoid losses)
    """

    @property
    def name(self) -> str:
        return "rsi_ma_choice"

    @property
    def required_candle_count(self) -> int:
        return 220  # 200MA + RSI period

    @property
    def default_params(self) -> dict:
        return {
            "rsi_period": 14,
            "rsi_oversold": 30,
            "rsi_overbought": 70,
            "ma_period": 200,
            "allow_short_in_bear": False,  # 하락장에서 단타 허용 여부
        }

    def analyze(self, df: pd.DataFrame, params: dict | None = None) -> TradeSignal:
        p = {**self.default_params, **(params or {})}

        # RSI 계산
        rsi = ta.rsi(df["close"], length=p["rsi_period"])
        current_rsi = rsi.iloc[-1]

        # 200MA 계산
        ma = ta.sma(df["close"], length=p["ma_period"])
        current_ma = ma.iloc[-1] if not pd.isna(ma.iloc[-1]) else 0
        current_price = df["close"].iloc[-1]

        # 시장 레짐 감지
        is_bull_market = current_price > current_ma

        # 상승장: RSI 과매도에서 매수
        if is_bull_market:
            if current_rsi < p["rsi_oversold"]:
                confidence = (p["rsi_oversold"] - current_rsi) / p["rsi_oversold"]
                return TradeSignal(
                    signal=Signal.BUY,
                    ticker="",
                    confidence=min(1.0, confidence + 0.3),
                    reason=f"상승장 + RSI 과매도: {current_rsi:.1f} < {p['rsi_oversold']} (MA:{current_ma:.0f})",
                    indicators={
                        "rsi": round(current_rsi, 2),
                        "ma200": round(current_ma, 2),
                        "price": round(current_price, 2),
                        "regime": "bull",
                    },
                )
            elif current_rsi > p["rsi_overbought"]:
                # 상승장에서도 RSI 과매수는 매도
                return TradeSignal(
                    signal=Signal.SELL,
                    ticker="",
                    confidence=0.6,
                    reason=f"상승장 + RSI 과매수: {current_rsi:.1f} > {p['rsi_overbought']}",
                    indicators={
                        "rsi": round(current_rsi, 2),
                        "ma200": round(current_ma, 2),
                        "regime": "bull",
                    },
                )
            else:
                return TradeSignal(
                    signal=Signal.HOLD,
                    ticker="",
                    confidence=0.2,
                    reason=f"상승장 + RSI 중립: {current_rsi:.1f} (MA:{current_ma:.0f})",
                    indicators={
                        "rsi": round(current_rsi, 2),
                        "ma200": round(current_ma, 2),
                        "regime": "bull",
                    },
                )
        else:
            # 하락장
            if p["allow_short_in_bear"] and current_rsi > p["rsi_overbought"]:
                return TradeSignal(
                    signal=Signal.SELL,  # 단타 매도 (实际上是卖空信号)
                    ticker="",
                    confidence=0.7,
                    reason=f"하락장 + RSI 과매수: 단타 진입 {current_rsi:.1f}",
                    indicators={
                        "rsi": round(current_rsi, 2),
                        "ma200": round(current_ma, 2),
                        "regime": "bear",
                    },
                )

            return TradeSignal(
                signal=Signal.HOLD,
                ticker="",
                confidence=0.0,
                reason=f"하락장 + RSI {current_rsi:.1f} - 매매 금지 (MA:{current_ma:.0f})",
                indicators={
                    "rsi": round(current_rsi, 2),
                    "ma200": round(current_ma, 2),
                    "price": round(current_price, 2),
                    "regime": "bear",
                },
            )
