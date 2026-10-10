"""Provider registry gating and the OpenAI-compatible structured-output path."""

import pytest
from pydantic import BaseModel

from app.core.config import Settings
from app.llm import ProviderNotConfigured, UnknownProvider, available_providers, create_llm
from app.llm.base import LLMError, parse_json_reply
from app.llm.openai_compat import OpenAICompatClient


def make_settings(**overrides) -> Settings:
    """Hermetic settings: no .env, no ambient credentials from the dev machine."""
    fields = {
        "database_url": "postgresql://localhost/x", "jwt_secret": "test",
        "vertex_project": None, "deepseek_api_key": None, "meta_api_key": None,
    }
    fields.update(overrides)
    return Settings(_env_file=None, **fields)


# --- factory gating ---------------------------------------------------------

def test_providers_report_configuration():
    settings = make_settings(deepseek_api_key="sk-x", openrouter_api_key="sk-or")
    info = {p.id: p for p in available_providers(settings)}
    assert set(info) == {"gemini", "deepseek", "meta", "ollama", "openrouter", "litellm"}
    assert info["deepseek"].configured is True
    assert info["gemini"].configured is False       # no vertex_project
    assert info["meta"].configured is False          # no key
    assert info["ollama"].configured is True         # local: always offered
    assert info["openrouter"].configured is True
    assert info["litellm"].configured is False       # no base_url named


def test_openrouter_defaults_to_auto_routing():
    settings = make_settings(openrouter_api_key="sk-or")
    client = create_llm("openrouter", settings=settings)
    assert client.provider == "openrouter"
    assert client.model == "openrouter/auto"


def test_litellm_requires_base_url_and_model():
    with pytest.raises(ProviderNotConfigured):
        create_llm("litellm", settings=make_settings())  # no deployment named
    with_url = make_settings(litellm_base_url="http://localhost:4000")
    with pytest.raises(ProviderNotConfigured):
        create_llm("litellm", settings=with_url)  # deployment but no model alias
    client = create_llm("litellm", model="team-gpt", settings=with_url)
    assert client.model == "team-gpt"
    assert create_llm("litellm", settings=make_settings(
        litellm_base_url="http://localhost:4000", litellm_model="default-alias",
    )).model == "default-alias"


def test_create_llm_refuses_unconfigured_provider():
    with pytest.raises(ProviderNotConfigured):
        create_llm("meta", settings=make_settings())


def test_create_llm_rejects_unknown_provider():
    with pytest.raises(UnknownProvider):
        create_llm("openai", settings=make_settings())


def test_create_llm_uses_default_models():
    settings = make_settings(deepseek_api_key="sk-x", deepseek_model="deepseek-reasoner")
    client = create_llm("deepseek", settings=settings)
    assert client.model == "deepseek-reasoner"
    assert create_llm("deepseek", model="other", settings=settings).model == "other"


# --- JSON reply handling ----------------------------------------------------

class Verdict(BaseModel):
    keep: bool
    reason: str


def test_parse_json_reply_tolerates_fences_and_chatter():
    reply = 'Sure! Here you go:\n```json\n{"keep": true, "reason": "core"}\n```'
    parsed = parse_json_reply(reply, Verdict)
    assert parsed.keep is True


def test_parse_json_reply_raises_on_junk():
    with pytest.raises(LLMError):
        parse_json_reply("I cannot answer that.", Verdict)


# --- OpenAI-compat client ---------------------------------------------------

def completion(content: str, tokens: int = 7) -> dict:
    return {
        "choices": [{"message": {"content": content}}],
        "usage": {"prompt_tokens": tokens, "completion_tokens": tokens},
    }


def test_compat_parse_repairs_bad_json_with_one_retry():
    replies = [completion("not json at all"),
               completion('{"keep": false, "reason": "index page"}')]
    calls: list[list[dict]] = []

    def send(messages, json_mode, max_tokens):
        calls.append(messages)
        return replies[len(calls) - 1]

    client = OpenAICompatClient(provider="test", base_url="http://x", model="m", send=send)
    parsed = client.parse(system="judge", user="page", schema=Verdict)
    assert parsed.reason == "index page"
    assert len(calls) == 2
    assert "rejected" in calls[1][-1]["content"]        # repair turn shows the error
    assert calls[1][-2]["content"] == "not json at all"  # and the model's own reply


def test_compat_write_and_usage_accounting():
    client = OpenAICompatClient(
        provider="test", base_url="http://x", model="m",
        send=lambda m, j, t: completion("# Article\n\nbody", tokens=11),
    )
    text = client.write(system="rules", user="write it")
    assert text.startswith("# Article")
    assert client.usage == {"input_tokens": 11, "output_tokens": 11, "calls": 1}


def test_compat_empty_completion_is_an_error():
    client = OpenAICompatClient(provider="test", base_url="http://x", model="m",
                                send=lambda m, j, t: completion("  "))
    with pytest.raises(LLMError):
        client.write(system="s", user="u")
