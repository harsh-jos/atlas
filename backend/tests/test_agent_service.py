"""Provider setup failures produce actionable messages without exposing provider details."""

import asyncio
import os
from uuid import uuid4

import pytest
from google.genai.errors import ClientError, ServerError

from app.agent import service
from app.agent import session as sessions_module


def test_vertex_settings_replace_previous_account(monkeypatch, agent_settings):
    agent_settings.vertex_project = "new-project"
    agent_settings.vertex_location = "global"
    agent_settings.google_application_credentials = "/tmp/test-service-account.json"
    monkeypatch.setattr(sessions_module, "get_settings", lambda: agent_settings)
    for name in (
        "GOOGLE_APPLICATION_CREDENTIALS",
        "GOOGLE_GENAI_USE_VERTEXAI",
        "GOOGLE_CLOUD_PROJECT",
        "GOOGLE_CLOUD_LOCATION",
    ):
        monkeypatch.setenv(name, "previous-account-value")

    sessions_module.configure_vertex()

    assert os.environ["GOOGLE_CLOUD_PROJECT"] == "new-project"
    assert os.environ["GOOGLE_CLOUD_LOCATION"] == "global"
    assert os.environ["GOOGLE_GENAI_USE_VERTEXAI"] == "True"
    assert os.environ["GOOGLE_APPLICATION_CREDENTIALS"] == "/tmp/test-service-account.json"


@pytest.mark.parametrize(
    "code, phrase", [(401, "credentials"), (403, "permissions"), (404, "model"), (429, "quota"),
                     (503, "temporarily unavailable"), (400, "accept this request")]
)
def test_provider_setup_errors_are_clear(monkeypatch, agent_settings, code, phrase):
    monkeypatch.setattr(service, "get_settings", lambda: agent_settings)
    monkeypatch.setattr(service, "get_session_scope", lambda: None)
    monkeypatch.setattr(service, "build_toolkit", lambda *args, **kwargs: [])
    monkeypatch.setattr(service, "build_agent", lambda *args: object())

    async def denied(*args, **kwargs):
        error_type = ServerError if code >= 500 else ClientError
        raise error_type(code, {"error": {"code": code, "message": "private provider details"}})

    monkeypatch.setattr(service, "ask", denied)
    with pytest.raises(service.AgentUnavailable) as result:
        asyncio.run(service.run_turn(uuid4(), "s1", "PyTorch"))
    assert phrase in str(result.value)
    assert "private provider details" not in str(result.value)
