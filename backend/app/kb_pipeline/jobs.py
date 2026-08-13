"""In-process registry of KB builds, so a minutes-long run is pollable.

Deliberately not the SQLite job queue: a KB build belongs to one interactive
session, its progress log is its product, and losing it on restart costs a
rebuild, not data — the artifacts land in Postgres.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID, uuid4

_MAX_LOG_LINES = 500
_MAX_FINISHED_PER_USER = 20


@dataclass
class KbJob:
    id: UUID
    user_id: UUID
    url: str
    status: str = "running"  # running | done | error
    log: list[str] = field(default_factory=list)
    concept_slug: str | None = None
    error: str | None = None
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")
    )


class KbJobStore:
    def __init__(self) -> None:
        self._jobs: dict[UUID, KbJob] = {}
        self._lock = threading.Lock()

    def create(self, user_id: UUID, url: str) -> KbJob:
        job = KbJob(id=uuid4(), user_id=user_id, url=url)
        with self._lock:
            self._jobs[job.id] = job
            self._evict(user_id)
        return job

    def get(self, job_id: UUID, user_id: UUID) -> KbJob | None:
        """Another user's job is indistinguishable from a missing one."""
        with self._lock:
            job = self._jobs.get(job_id)
        return job if job is not None and job.user_id == user_id else None

    def append(self, job_id: UUID, line: str) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is not None and len(job.log) < _MAX_LOG_LINES:
                job.log.append(line)

    def finish(self, job_id: UUID, *, concept_slug: str | None = None,
               error: str | None = None) -> None:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            job.status = "error" if error else "done"
            job.error = error
            job.concept_slug = concept_slug

    def _evict(self, user_id: UUID) -> None:
        finished = [j for j in self._jobs.values()
                    if j.user_id == user_id and j.status != "running"]
        for job in sorted(finished, key=lambda j: j.created_at)[:-_MAX_FINISHED_PER_USER]:
            del self._jobs[job.id]


_STORE = KbJobStore()


def kb_job_store() -> KbJobStore:
    return _STORE
