from src.services.exchange_base import Exchange


def create_exchange(provider: str, access_key: str, secret_key: str,
                    dry_run: bool = True, **kwargs) -> Exchange:
    if provider == "upbit":
        from src.services.exchange import UpbitExchange
        return UpbitExchange(access_key, secret_key, dry_run=dry_run)
    elif provider == "binance":
        from src.services.exchange_binance import BinanceExchange
        return BinanceExchange(access_key, secret_key, dry_run=dry_run)
    elif provider == "binance_futures":
        from src.services.exchange_binance_futures import BinanceFuturesExchange
        return BinanceFuturesExchange(
            access_key, secret_key, dry_run=dry_run,
            default_leverage=kwargs.get("default_leverage", 20),
            margin_type=kwargs.get("margin_type", "ISOLATED"),
        )
    else:
        raise ValueError(f"Unknown exchange provider: {provider}")
