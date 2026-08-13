"""Provider registry and factory — the one place a provider name means anything.

Adding a provider is one `_Provider` entry: how to tell whether it's
configured, its default model, and how to build a client. Callers pick by id
(or take the configured default) and get back the same `LLMClient` surface.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from app.core.config import Settings, get_settings
from app.llm.base import LLMClient
from app.llm.gemini import GeminiClient
from app.llm.openai_compat import OpenAICompatClient


class UnknownProvider(ValueError):
    pass


class ProviderNotConfigured(RuntimeError):
    pass


@dataclass(frozen=True)
class _Provider:
    id: str
    label: str
    configured: Callable[[Settings], bool]
    default_model: Callable[[Settings], str]
    build: Callable[[Settings, str], LLMClient]


def _gemini(settings: Settings, model: str) -> LLMClient:
    assert settings.vertex_project is not None
    return GeminiClient(
        project=settings.vertex_project, location=settings.vertex_location, model=model
    )


def _deepseek(settings: Settings, model: str) -> LLMClient:
    return OpenAICompatClient(
        provider="deepseek", base_url=settings.deepseek_base_url, model=model,
        api_key=settings.deepseek_api_key, timeout=settings.kb_llm_timeout,
    )


def _meta(settings: Settings, model: str) -> LLMClient:
    return OpenAICompatClient(
        provider="meta", base_url=settings.meta_base_url, model=model,
        api_key=settings.meta_api_key, timeout=settings.kb_llm_timeout,
    )


def _ollama(settings: Settings, model: str) -> LLMClient:
    return OpenAICompatClient(
        provider="ollama", base_url=settings.ollama_base_url, model=model,
        api_key=None, timeout=settings.kb_llm_timeout,
    )


_REGISTRY: dict[str, _Provider] = {
    p.id: p
    for p in (
        _Provider("gemini", "Gemini (Vertex AI)",
                  lambda s: s.vertex_project is not None,
                  lambda s: s.gemini_model, _gemini),
        _Provider("deepseek", "DeepSeek",
                  lambda s: s.deepseek_api_key is not None,
                  lambda s: s.deepseek_model, _deepseek),
        _Provider("meta", "Meta Llama API",
                  lambda s: s.meta_api_key is not None,
                  lambda s: s.meta_model, _meta),
        # Ollama is local: reachability is a runtime property, not a credential,
        # so it always counts as configured and fails loudly at call time.
        _Provider("ollama", "Ollama (local)",
                  lambda s: True,
                  lambda s: s.ollama_model, _ollama),
    )
}


@dataclass(frozen=True)
class ProviderInfo:
    id: str
    label: str
    configured: bool
    default_model: str


def available_providers(settings: Settings | None = None) -> list[ProviderInfo]:
    settings = settings or get_settings()
    return [
        ProviderInfo(p.id, p.label, p.configured(settings), p.default_model(settings))
        for p in _REGISTRY.values()
    ]


def create_llm(
    provider: str | None = None, model: str | None = None, settings: Settings | None = None
) -> LLMClient:
    settings = settings or get_settings()
    provider_id = provider or settings.llm_provider
    spec = _REGISTRY.get(provider_id)
    if spec is None:
        raise UnknownProvider(
            f"unknown LLM provider {provider_id!r}; known: {sorted(_REGISTRY)}"
        )
    if not spec.configured(settings):
        raise ProviderNotConfigured(
            f"{spec.label} is not configured — set its credentials in the environment"
        )
    return spec.build(settings, model or spec.default_model(settings))
