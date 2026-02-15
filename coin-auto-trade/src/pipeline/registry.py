"""Pipeline provider registry."""
from src.pipeline.base import EvidenceProvider

_PROVIDERS: dict[str, type] = {}


def register_provider(cls: type) -> type:
    instance = cls()
    _PROVIDERS[instance.name] = cls
    return cls


def get_provider(name: str) -> EvidenceProvider:
    cls = _PROVIDERS.get(name)
    if not cls:
        raise ValueError(f"Unknown provider: {name}. Available: {list(_PROVIDERS.keys())}")
    return cls()


def list_providers() -> list[str]:
    return list(_PROVIDERS.keys())
