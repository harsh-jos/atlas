"""Durable turn dispatch: Cloud Tasks in hosting, database queue workers in development."""
import asyncio
import base64
import json
import logging
from contextlib import suppress
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from google.auth.transport.requests import AuthorizedSession, Request
from google.oauth2 import id_token
import google.auth
from sqlalchemy import select
from pydantic import BaseModel

from app.agent.turns import TurnStore, ACTIVE
from app.core.config import get_settings
from app.db.base import get_session_scope
from app.db.models import AgentTurn

log = logging.getLogger(__name__)
router = APIRouter(prefix="/internal/agent", tags=["worker"])


def enqueue(turn_id, user_id, phase="run", attempt=0):
    settings = get_settings()
    if settings.agent_execution_backend != "cloud_tasks":
        return  # Local workers consume committed database rows, including after a restart.
    project = settings.agent_tasks_project or settings.vertex_project
    url = settings.agent_tasks_api_url
    account = settings.agent_tasks_service_account
    if not project or not url or not url.startswith("https://") or not account:
        raise RuntimeError("Cloud Tasks runtime configuration is incomplete.")
    parent = f"projects/{project}/locations/{settings.agent_tasks_location}/queues/{settings.agent_tasks_queue}"
    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    body = base64.b64encode(json.dumps({"user_id": str(user_id)}).encode()).decode()
    task_phase = phase
    if phase == "enrich":
        from app.agent.enrichment import VERSION
        task_phase = f"{phase}-{VERSION}"
    task = {"name": f"{parent}/tasks/{task_phase}-{turn_id}-{attempt}", "dispatchDeadline": "1800s",
        "httpRequest": {"httpMethod": "POST", "url": f"{url.rstrip('/')}/internal/agent/turns/{turn_id}/{phase}",
            "headers": {"Content-Type": "application/json"}, "body": body,
            "oidcToken": {"serviceAccountEmail": account, "audience": url.rstrip('/')}}}
    with AuthorizedSession(credentials) as session:
        response = session.post(f"https://cloudtasks.googleapis.com/v2/{parent}/tasks", json={"task": task}, timeout=20)
        if response.status_code not in (200, 201, 409):
            raise RuntimeError("Could not schedule durable agent work. Retry the same message.")


async def authenticate(authorization):
    settings = get_settings()
    if settings.agent_execution_backend != "cloud_tasks" or not settings.agent_tasks_api_url or not settings.agent_tasks_service_account:
        raise HTTPException(404, "worker endpoint unavailable")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "worker authentication required")
    try:
        claims = await asyncio.to_thread(id_token.verify_oauth2_token, authorization[7:], Request(), settings.agent_tasks_api_url.rstrip('/'))
        if claims.get("email") != settings.agent_tasks_service_account or claims.get("email_verified") is not True:
            raise ValueError("Wrong worker identity")
    except Exception:
        raise HTTPException(403, "invalid worker identity") from None


async def execute_turn(turn_id, user_id):
    from app.agent.execution import execute
    scope = get_session_scope()
    store = TurnStore(scope)
    claim = await asyncio.to_thread(store.claim, get_settings().agent_turn_timeout_seconds, turn_id, user_id)
    if not claim:
        current = await asyncio.to_thread(store.get, user_id, turn_id)
        if current and current["status"] == "running":
            return False  # Cloud Tasks retries delivery, without a concurrent provider call.
        if current and current["status"] == "completed" and current.get("enrichment_status") == "pending":
            await asyncio.to_thread(enqueue, turn_id, user_id, "enrich")
        return True
    fenced = TurnStore(scope, claim["execution_token"])
    task = asyncio.create_task(execute(fenced, claim))
    try:
        while not task.done():
            done, _ = await asyncio.wait({task}, timeout=1)
            if done:
                break
            state = await asyncio.to_thread(store.get, user_id, turn_id)
            if not state or state["cancel_requested"] or state["status"] not in ACTIVE:
                task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    finally:
        if not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
    current = await asyncio.to_thread(store.get, user_id, turn_id)
    if current and current["status"] == "completed" and current.get("enrichment_status") == "pending":
        await asyncio.to_thread(enqueue, turn_id, user_id, "enrich")
    return True


class JobBody(BaseModel):
    user_id: UUID


@router.post("/turns/{turn_id}/run")
async def run_job(turn_id: UUID, body: JobBody, authorization: str | None = Header(None)):
    await authenticate(authorization)
    if not await execute_turn(turn_id, body.user_id):
        raise HTTPException(503, "turn already leased; retry delivery")
    return {"ok": True}


@router.post("/turns/{turn_id}/enrich")
async def enrich_job(turn_id: UUID, body: JobBody, authorization: str | None = Header(None)):
    await authenticate(authorization)
    from app.agent.enrichment import enrich
    await enrich(get_session_scope(), body.user_id, turn_id)
    return {"ok": True}


def pending_jobs(scope, limit):
    from datetime import datetime, timezone
    with scope() as session:
        TurnStore(scope)._expire(session)
        stale = session.scalars(select(AgentTurn).where(AgentTurn.enrichment_status == "running", AgentTurn.enrichment_lease_until < datetime.now(timezone.utc)).with_for_update(skip_locked=True)).all()
        for turn in stale:
            turn.enrichment_status, turn.enrichment_error = "failed", "Concept update was interrupted. Your answer is saved."
        rows = session.execute(select(AgentTurn.id, AgentTurn.user_id, AgentTurn.status).where(
            (AgentTurn.status == "queued") | ((AgentTurn.status == "completed") & (AgentTurn.enrichment_status == "pending"))
        ).order_by(AgentTurn.created_at).limit(limit)).all()
        return rows


async def local_worker():
    from app.agent.enrichment import enrich
    scope = get_session_scope()
    tasks = {}
    try:
        while True:
            for key, task in list(tasks.items()):
                if task.done():
                    try:
                        task.result()
                    except asyncio.CancelledError:
                        pass
                    except Exception:
                        log.exception("local_agent_job_failed turn_id=%s", key)
                    tasks.pop(key)
            capacity = get_settings().agent_worker_concurrency - len(tasks)
            if capacity > 0:
                jobs = await asyncio.to_thread(pending_jobs, scope, capacity + len(tasks))
                for tid, uid, state in jobs:
                    if tid not in tasks and len(tasks) < get_settings().agent_worker_concurrency:
                        tasks[tid] = asyncio.create_task(execute_turn(tid, uid) if state == "queued" else enrich(scope, uid, tid))
            await asyncio.sleep(1)
    finally:
        for task in tasks.values():
            task.cancel()
        await asyncio.gather(*tasks.values(), return_exceptions=True)
