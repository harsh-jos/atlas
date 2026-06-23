"""The one gateway to the external model — an OpenAI-compatible chat-completions client.

The same wire shape serves DeepSeek (`https://api.deepseek.com/v1`) and local servers (Ollama,
vLLM, LM Studio, llama.cpp at e.g. `http://localhost:11434/v1`), so a single client switches
target by `base_url` alone (config, not code). It owns the URL, auth, timeout, retries, and
response parsing; callers depend on this class, never on httpx. Any failure raises `LLMError` —
it never returns a fabricated result.
"""

from __future__ import annotations

import json
import logging

import httpx

log = logging.getLogger(__name__)

_ENDPOINT = "/chat/completions"
_RETRYABLE_NETWORK = (httpx.TimeoutException, httpx.TransportError)
_SERVER_ERROR_FLOOR = 500


class LLMError(RuntimeError):
    """The model call failed or returned something unusable — surfaced, never silently swallowed."""


class LLMClient:
    def __init__(
        self,
        *,
        base_url: str,
        model: str,
        api_key: str | None = None,
        timeout: float = 60.0,
        max_tokens: int = 512,
        temperature: float = 0.2,
        max_retries: int = 2,
        http: httpx.Client | None = None,
    ) -> None:
        self._url = base_url.rstrip("/") + _ENDPOINT
        self._model = model
        self._max_tokens = max_tokens
        self._temperature = temperature
        self._max_retries = max_retries
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        # http is injectable so tests can supply a MockTransport; production reuses one client.
        self._http = http or httpx.Client(timeout=timeout, headers=headers)

    def complete_json(self, *, system: str, user: str) -> dict:
        """Send a system+user prompt, requesting a JSON object, and return the parsed object."""
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
            "temperature": self._temperature,
            "max_tokens": self._max_tokens,
        }
        return self._extract_object(self._post(payload))

    def _post(self, payload: dict) -> dict:
        last_error: object = None
        for _ in range(self._max_retries + 1):
            try:
                response = self._http.post(self._url, json=payload)
            except _RETRYABLE_NETWORK as error:
                last_error = error
                continue
            if response.status_code >= _SERVER_ERROR_FLOOR:
                last_error = f"{response.status_code} {response.text[:200]}"
                continue
            if response.status_code != httpx.codes.OK:
                raise LLMError(f"model returned {response.status_code}: {response.text[:200]}")
            try:
                return response.json()
            except ValueError as error:
                raise LLMError(f"model response body was not JSON: {error}") from error
        raise LLMError(f"model unreachable after {self._max_retries + 1} attempts: {last_error}")

    @staticmethod
    def _extract_object(envelope: dict) -> dict:
        try:
            content = envelope["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise LLMError(f"unexpected response envelope: {error}") from error
        try:
            parsed = json.loads(content)
        except (ValueError, TypeError) as error:
            raise LLMError(f"model message content was not JSON: {error}") from error
        if not isinstance(parsed, dict):
            raise LLMError("model returned JSON that is not an object")
        return parsed
