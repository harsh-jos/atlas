"""The one gateway to the external model — an OpenAI-compatible chat-completions client.

The same wire shape serves DeepSeek (`https://api.deepseek.com/v1`) and local servers (Ollama,
vLLM, LM Studio, llama.cpp at e.g. `http://localhost:11434/v1`), so a single client switches
target by `base_url` alone (config, not code). It owns the URL, auth, timeout, retries, and
response parsing; callers depend on this class, never on httpx. Any failure raises `LLMError` —
it never returns a fabricated result.

Built to tolerate a *bad* model: small local models routinely wrap JSON in code fences, add
prose around it, or ignore the `response_format` hint entirely. Parsing here is lenient enough
to recover a JSON object from that mess, and gives up loudly (so the enricher falls back) when
it genuinely can't — the model is an optional booster, never a dependency.
"""

from __future__ import annotations

import json
import logging
import re

import httpx

log = logging.getLogger(__name__)

_ENDPOINT = "/chat/completions"
_RETRYABLE_NETWORK = (httpx.TimeoutException, httpx.TransportError)
_SERVER_ERROR_FLOOR = 500
_CODE_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)


class LLMError(RuntimeError):
    """The model call failed or returned something unusable — surfaced, never silently swallowed."""


def _first_json_object(text: str) -> str | None:
    """Extract the first balanced ``{...}`` block, ignoring braces inside strings — so a JSON
    object embedded in surrounding prose (a common small-model habit) is still recoverable."""
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
        elif char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return None


def _loads_lenient(content: str) -> dict:
    """Parse a JSON object from model output that may be fenced or wrapped in prose."""
    candidates = [content.strip()]
    fenced = _CODE_FENCE.search(content)
    if fenced:
        candidates.append(fenced.group(1).strip())
    embedded = _first_json_object(content)
    if embedded:
        candidates.append(embedded)

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except (ValueError, TypeError):
            continue
        if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
            return parsed[0]  # some models wrap the object in a one-element array
        if isinstance(parsed, dict):
            return parsed
    raise LLMError(f"could not parse a JSON object from model output: {content[:200]!r}")


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
        json_mode: bool = True,
        http: httpx.Client | None = None,
    ) -> None:
        self._url = base_url.rstrip("/") + _ENDPOINT
        self._model = model
        self._max_tokens = max_tokens
        self._temperature = temperature
        self._max_retries = max_retries
        # Most servers honor response_format; a few small/local ones reject the field outright.
        # Turn it off for those — lenient parsing recovers the JSON from plain-text output anyway.
        self._json_mode = json_mode
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        # http is injectable so tests can supply a MockTransport; production reuses one client.
        self._http = http or httpx.Client(timeout=timeout, headers=headers)

    def complete_json(self, *, system: str, user: str) -> dict:
        """Send a system+user prompt, requesting a JSON object, and return the parsed object."""
        payload: dict = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": self._temperature,
            "max_tokens": self._max_tokens,
        }
        if self._json_mode:
            payload["response_format"] = {"type": "json_object"}
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
        if not isinstance(content, str) or not content.strip():
            raise LLMError("model returned empty message content")
        return _loads_lenient(content)
