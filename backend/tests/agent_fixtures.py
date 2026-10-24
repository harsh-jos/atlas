"""Local usage ledger and scripted models. These tests never call Vertex."""

from datetime import datetime, timezone

import pytest
from google.adk.models import LlmResponse
from google.adk.models.base_llm import BaseLlm
from google.adk.sessions.schemas.v1 import StorageSession
from google.genai import types
from pydantic import Field
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.agent.usage import UsageStore
from app.core.config import Settings
from app.db.models import AgentRequest, AgentTurn, AgentTurnEvent, User


@pytest.fixture
def agent_settings():
    return Settings(
        _env_file=None,
        database_url="sqlite://",
        jwt_secret="test-only",
        vertex_project="test-project",
        agent_max_calls_per_turn=6,
        agent_max_calls_per_session=12,
        agent_max_research_per_turn=2,
        agent_max_research_per_session=4,
        agent_session_budget_microusd=0,
    )


@pytest.fixture
def usage_factory(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'usage.db'}")

    @event.listens_for(engine, "connect")
    def functions(connection, record):
        connection.create_function(
            "clock_timestamp", 0, lambda: datetime.now(timezone.utc).isoformat()
        )
        connection.execute("PRAGMA foreign_keys=ON")

    User.__table__.create(engine)
    StorageSession.__table__.create(engine)
    AgentRequest.__table__.create(engine)
    AgentTurn.__table__.create(engine)
    AgentTurnEvent.__table__.create(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory.begin() as session:
        users = [User(email=f"test{i}@example.com", password_hash="x") for i in range(2)]
        session.add_all(users)
        session.flush()
        ids = [user.id for user in users]
    yield lambda owner=0, session_id="s1": UsageStore(factory.begin, ids[owner], session_id)
    engine.dispose()


def answer(text, **kwargs):
    return LlmResponse(
        content=types.Content(role="model", parts=[types.Part(text=text)]),
        usage_metadata=types.GenerateContentResponseUsageMetadata(
            prompt_token_count=100,
            candidates_token_count=20,
            thoughts_token_count=10,
            total_token_count=130,
        ),
        **kwargs,
    )


class ScriptedModel(BaseLlm):
    model: str = "gemini-scripted"
    responses: list[LlmResponse] = Field(default_factory=list)
    requests: list = Field(default_factory=list)

    async def generate_content_async(self, llm_request, stream=False):
        self.requests.append(llm_request)
        if not self.responses:
            raise RuntimeError("Scripted provider failure")
        yield self.responses.pop(0)
