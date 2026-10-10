"""Service-owned job queue: a SQLite store plus a single-worker asyncio loop.

No Redis, no extra Postgres tables — the service owns its own job state so it stays
self-contained and "start and forget". Imports run one at a time (heavy parsers, single user);
failures are recorded loudly and the job row stays queryable.
"""

from __future__ import annotations

import asyncio
import json
import logging
import sqlite3
import time
import uuid
from collections.abc import Callable
from contextlib import closing
from threading import Lock
from typing import Any

log = logging.getLogger(__name__)

# Job processor: (store, job_row) -> result dict. Runs in a worker thread.
JobProcessor = Callable[["JobStore", dict[str, Any]], dict[str, Any]]


class JobStore:
    def __init__(self, path: str) -> None:
        self._path = path
        self._lock = Lock()  # serialize writes; one worker + status reads
        with closing(self._connect()) as conn, conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    id         TEXT PRIMARY KEY,
                    kind       TEXT NOT NULL,
                    params     TEXT NOT NULL,
                    status     TEXT NOT NULL,
                    progress   TEXT,
                    result     TEXT,
                    error      TEXT,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path)
        conn.row_factory = sqlite3.Row
        return conn

    def enqueue(self, kind: str, params: dict[str, Any]) -> str:
        job_id = str(uuid.uuid4())
        now = time.time()
        with self._lock, closing(self._connect()) as conn, conn:
            conn.execute(
                "INSERT INTO jobs (id, kind, params, status, progress, created_at, updated_at)"
                " VALUES (?, ?, ?, 'queued', ?, ?, ?)",
                (job_id, kind, json.dumps(params), json.dumps({"stage": "queued"}), now, now),
            )
        return job_id

    def claim_next(self) -> dict[str, Any] | None:
        with self._lock, closing(self._connect()) as conn, conn:
            row = conn.execute(
                "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1"
            ).fetchone()
            if row is None:
                return None
            conn.execute(
                "UPDATE jobs SET status='running', progress=?, updated_at=? WHERE id=?",
                (json.dumps({"stage": "running"}), time.time(), row["id"]),
            )
            return dict(row)

    def set_progress(self, job_id: str, progress: dict[str, Any]) -> None:
        with self._lock, closing(self._connect()) as conn, conn:
            conn.execute(
                "UPDATE jobs SET progress=?, updated_at=? WHERE id=?",
                (json.dumps(progress), time.time(), job_id),
            )

    def finish(self, job_id: str, result: dict[str, Any]) -> None:
        with self._lock, closing(self._connect()) as conn, conn:
            conn.execute(
                "UPDATE jobs SET status='done', result=?, progress=?, updated_at=? WHERE id=?",
                (json.dumps(result), json.dumps({"stage": "done"}), time.time(), job_id),
            )

    def fail(self, job_id: str, error: str) -> None:
        with self._lock, closing(self._connect()) as conn, conn:
            conn.execute(
                "UPDATE jobs SET status='failed', error=?, updated_at=? WHERE id=?",
                (error, time.time(), job_id),
            )

    def get(self, job_id: str) -> dict[str, Any] | None:
        with self._lock, closing(self._connect()) as conn, conn:
            row = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
            return dict(row) if row else None


async def run_worker(store: JobStore, process: JobProcessor, stop: asyncio.Event) -> None:
    """Drain the queue one job at a time until `stop` is set. Blocking work (parsers, DB)
    runs in a thread so the event loop stays responsive."""
    log.info("import worker started")
    while not stop.is_set():
        job = store.claim_next()
        if job is None:
            try:
                await asyncio.wait_for(stop.wait(), timeout=1.0)
            except asyncio.TimeoutError:
                pass
            continue

        job_id = job["id"]
        try:
            result = await asyncio.to_thread(process, store, job)
            store.finish(job_id, result)
            log.info("import %s done: %s", job_id, result)
        except Exception as error:  # fail loud: record and keep going
            log.exception("import %s failed", job_id)
            store.fail(job_id, f"{type(error).__name__}: {error}")
    log.info("import worker stopped")
