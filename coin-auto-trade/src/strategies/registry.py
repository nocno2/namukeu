from src.strategies.base import Strategy

_STRATEGIES: dict[str, type] = {}


def register(cls: type) -> type:
    instance = cls()
    _STRATEGIES[instance.name] = cls
    return cls


def get_strategy(name: str) -> Strategy:
    cls = _STRATEGIES.get(name)
    if not cls:
        raise ValueError(f"Unknown strategy: {name}. Available: {list(_STRATEGIES.keys())}")
    return cls()


def list_strategies() -> list[str]:
    return list(_STRATEGIES.keys())
