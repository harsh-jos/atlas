"""Run one named live scenario through the deployed API. Results need human review."""

import argparse
import asyncio
import json
import os
from pathlib import Path
from uuid import uuid4

import httpx
from pydantic import BaseModel, Field

from app.agent.router import AgentUsage, ChatTurn


class Scenario(BaseModel):
    id: str
    turns: list[str] = Field(min_length=1)
    review: list[str] = Field(min_length=1)


async def run_scenario(client: httpx.AsyncClient, scenario: Scenario) -> dict:
    session_id = f"eval-{uuid4()}"
    turns = []
    for message in scenario.turns:
        response = await client.post(
            "/agent/chat", json={"session_id": session_id, "message": message, "request_id": str(uuid4())}
        )
        response.raise_for_status()
        turn = ChatTurn.model_validate(response.json())
        async with asyncio.timeout(360):
            while turn.status in {"queued", "running"}:
                await asyncio.sleep(0.5)
                response = await client.get(f"/agent/turns/{turn.id}")
                response.raise_for_status()
                turn = ChatTurn.model_validate(response.json())
        if turn.status != "completed" or not turn.reply:
            raise RuntimeError(turn.error or "The evaluation turn did not complete.")
        turns.append({"message": message, "reply": turn.reply})
    response = await client.get(f"/agent/chat/{session_id}/usage")
    response.raise_for_status()
    usage = AgentUsage.model_validate(response.json())
    return {
        "scenario": scenario.id,
        "session_id": session_id,
        "turns": turns,
        "usage": usage.model_dump(),
        "review": scenario.review,
        "review_status": "pending",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--case", required=True, help="One scenario ID; never runs all cases by default."
    )
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument(
        "--cases",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "tests/agent_scenarios.json",
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    token = os.environ.get("ATLAS_EVAL_TOKEN")
    if not token:
        parser.error("Set ATLAS_EVAL_TOKEN to a token for a dedicated test account.")
    cases = [Scenario.model_validate(case) for case in json.loads(args.cases.read_text())]
    selected = next((case for case in cases if case.id == args.case), None)
    if selected is None:
        parser.error("Unknown case. Available: " + ", ".join(case.id for case in cases))

    async def run():
        async with httpx.AsyncClient(
            base_url=args.base_url, headers={"Authorization": f"Bearer {token}"}, timeout=360.0
        ) as client:
            return await run_scenario(client, selected)

    try:
        result = asyncio.run(run())
    except httpx.HTTPError:
        raise SystemExit(
            "The live evaluation request failed. Check the backend logs and test account."
        ) from None
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(f"Saved {selected.id} for human review: {args.output}")


if __name__ == "__main__":
    main()
