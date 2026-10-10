"""One client for every OpenAI-compatible chat-completions API.

DeepSeek, Meta's Llama API, and a local Ollama all speak this dialect, so one
implementation parameterized by (base_url, key, model) covers all three — the
same reasoning as `deepseek_completion` in the enricher, generalized.

Structured output works everywhere via schema-in-prompt + validate + one
repair round-trip; `json_mode` additionally requests the provider's JSON mode
and quietly falls back if the server rejects it.
"""

from __future__ import annotations

from collections.abc import Callable

import httpx

from app.llm.base import LLMError, SchemaT, new_usage, parse_json_reply, schema_instruction

# messages + json_mode -> raw provider response dict. Injectable for tests.
SendFn = Callable[[list[dict], bool, int], dict]


class OpenAICompatClient:
    def __init__(
        self,
        *,
        provider: str,
        base_url: str,
        model: str,
        api_key: str | None = None,
        timeout: float = 240.0,
        json_mode: bool = True,
        send: SendFn | None = None,
    ):
        self.provider = provider
        self.model = model
        self.usage = new_usage()
        self._json_mode = json_mode
        self._send = send or self._http_send(base_url, api_key, timeout, model)

    @staticmethod
    def _http_send(base_url: str, api_key: str | None, timeout: float, model: str) -> SendFn:
        url = f"{base_url.rstrip('/')}/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}

        def send(messages: list[dict], json_mode: bool, max_tokens: int) -> dict:
            payload: dict = {
                "model": model,
                "messages": messages,
                "stream": False,
                "max_tokens": max_tokens,
            }
            if json_mode:
                payload["response_format"] = {"type": "json_object"}
            response = httpx.post(url, headers=headers, json=payload, timeout=timeout)
            response.raise_for_status()
            return response.json()

        return send

    def _chat(self, messages: list[dict], *, json_mode: bool, max_tokens: int) -> str:
        try:
            data = self._request(messages, json_mode, max_tokens)
        except httpx.HTTPStatusError as error:
            # some servers reject response_format — retry once without it
            if json_mode and error.response.status_code in (400, 422):
                data = self._request(messages, False, max_tokens)
            else:
                raise LLMError(f"{self.provider}: {error}") from error
        except httpx.HTTPError as error:
            raise LLMError(f"{self.provider}: {error}") from error

        self.usage["calls"] += 1
        usage = data.get("usage") or {}
        self.usage["input_tokens"] += usage.get("prompt_tokens") or 0
        self.usage["output_tokens"] += usage.get("completion_tokens") or 0
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise LLMError(f"{self.provider}: malformed response shape") from error
        if not isinstance(content, str) or not content.strip():
            raise LLMError(f"{self.provider}: empty completion")
        return content

    def _request(self, messages: list[dict], json_mode: bool, max_tokens: int) -> dict:
        return self._send(messages, json_mode, max_tokens)

    def parse(
        self, *, system: str, user: str, schema: type[SchemaT], max_tokens: int = 8192
    ) -> SchemaT:
        full_system = f"{system}\n\n{schema_instruction(schema)}"
        messages = [
            {"role": "system", "content": full_system},
            {"role": "user", "content": user},
        ]
        content = self._chat(messages, json_mode=self._json_mode, max_tokens=max_tokens)
        try:
            return parse_json_reply(content, schema)
        except LLMError as error:
            # one repair round-trip: show the model its own reply and the error
            repair = messages + [
                {"role": "assistant", "content": content},
                {"role": "user", "content": (
                    f"That reply was rejected: {error}\n"
                    "Reply again with ONLY the corrected JSON object."
                )},
            ]
            content = self._chat(repair, json_mode=self._json_mode, max_tokens=max_tokens)
            return parse_json_reply(content, schema)

    def write(self, *, system: str, user: str, max_tokens: int = 16384) -> str:
        return self._chat(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            json_mode=False,
            max_tokens=max_tokens,
        )
