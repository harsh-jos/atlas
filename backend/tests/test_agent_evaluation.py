"""Evaluation output separates transport success from teaching quality."""

import asyncio
import json

import httpx

from app.agent.evaluate import Scenario, run_scenario


def test_live_harness_keeps_one_session_and_requires_review():
    messages = []

    def respond(request):
        if request.method == "POST":
            messages.append(json.loads(request.content))
            return httpx.Response(200, json={"reply": "An explanation to review."})
        return httpx.Response(
            200,
            json={
                "modelRequests": 2,
                "researchRequests": 1,
                "inputTokens": 20,
                "outputTokens": 10,
                "thoughtTokens": 5,
                "totalTokens": 35,
                "unreportedRequests": 0,
                "searchQueries": 2,
                "estimatedCostMicrousd": 28_000,
                "unpricedRequests": 0,
                "sessionBudgetMicrousd": 5_000_000,
            },
        )

    async def run():
        async with httpx.AsyncClient(
            base_url="http://test", transport=httpx.MockTransport(respond)
        ) as client:
            return await run_scenario(
                client,
                Scenario(
                    id="detour", turns=["PyTorch", "Gradients?"], review=["Follows the detour."]
                ),
            )

    result = asyncio.run(run())
    assert len(messages) == 2
    assert messages[0]["session_id"] == messages[1]["session_id"]
    assert result["review_status"] == "pending"
    assert result["usage"]["total_tokens"] == 35
    assert result["review"] == ["Follows the detour."]
