"""The learning guide and one bounded web-research tool."""

from collections.abc import Callable

from google.adk.agents import Agent
from google.adk.tools import google_search
from google.adk.tools.agent_tool import AgentTool
from google.genai import types

from app.agent.limits import RequestLimits
from app.agent.context import learning_instruction
from app.agent.prompts import LEARNING_INSTRUCTION, RESEARCH_INSTRUCTION
from app.core.config import get_settings


def build_agent(tools: list[Callable], limits: RequestLimits) -> Agent:
    settings = get_settings()
    config = types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.HIGH),
        http_options=types.HttpOptions(
            timeout=settings.agent_turn_timeout_seconds * 1000,
            retry_options=types.HttpRetryOptions(attempts=1),
        ),
    )
    callbacks = {
        "before_model_callback": limits.before_model,
        "after_model_callback": limits.after_model,
    }
    researcher = Agent(
        name="researcher",
        model=settings.agent_search_model,
        description="Finds reliable web evidence for one specific learning question.",
        static_instruction=RESEARCH_INSTRUCTION,
        generate_content_config=config.model_copy(deep=True),
        tools=[google_search],
        **callbacks,
    )
    return Agent(
        name="atlas",
        model=settings.agent_model,
        description="Guides one question at a time and connects prior explorations.",
        static_instruction=LEARNING_INSTRUCTION,
        instruction=learning_instruction,
        generate_content_config=config,
        tools=[AgentTool(researcher, propagate_grounding_metadata=True), *tools],
        **callbacks,
    )
