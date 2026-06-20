"""HTTP boundary: enqueue imports and report job status.

Two ways in: JSON for url/article/markdown-text, multipart for file uploads (PDF / .md).
Both enqueue a job and return immediately with a jobId; the worker does the work.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field, model_validator

from app.config import get_settings
from app.queue import JobStore

router = APIRouter()


def get_store(request: Request) -> JobStore:
    return request.app.state.store


class ImportRequest(BaseModel):
    kind: Literal["url", "article", "markdown"]
    url: str | None = None
    text: str | None = None
    title: str | None = None
    collection_name: str | None = Field(default=None, alias="collectionName")
    source_type: str | None = Field(default=None, alias="sourceType")
    color: str | None = None

    @model_validator(mode="after")
    def _check_payload(self) -> ImportRequest:
        if self.kind in ("url", "article") and not self.url:
            raise ValueError(f"'url' is required for kind={self.kind}")
        if self.kind == "markdown" and not self.text:
            raise ValueError("'text' is required for kind=markdown")
        return self

    def to_params(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "text": self.text,
            "title": self.title,
            "collectionName": self.collection_name,
            "sourceType": self.source_type,
            "color": self.color,
        }


class JobCreated(BaseModel):
    jobId: str


class JobStatus(BaseModel):
    id: str
    kind: str
    status: str
    progress: dict[str, Any] | None = None
    result: dict[str, Any] | None = None
    error: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> JobStatus:
        return cls(
            id=row["id"],
            kind=row["kind"],
            status=row["status"],
            progress=json.loads(row["progress"]) if row.get("progress") else None,
            result=json.loads(row["result"]) if row.get("result") else None,
            error=row.get("error"),
        )


@router.post("/imports", response_model=JobCreated)
def create_import(req: ImportRequest, store: JobStore = Depends(get_store)) -> JobCreated:
    return JobCreated(jobId=store.enqueue(req.kind, req.to_params()))


@router.post("/imports/file", response_model=JobCreated)
async def create_file_import(
    file: UploadFile = File(...),
    collectionName: str | None = Form(default=None),
    sourceType: str | None = Form(default=None),
    store: JobStore = Depends(get_store),
) -> JobCreated:
    filename = file.filename or "upload"
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        kind = "pdf"
    elif suffix in (".md", ".markdown"):
        kind = "markdown_file"
    else:
        raise HTTPException(status_code=400, detail=f"unsupported file type: {suffix or 'none'}")

    uploads = Path(get_settings().uploads_dir)
    uploads.mkdir(parents=True, exist_ok=True)
    saved = uploads / f"{uuid.uuid4().hex}_{Path(filename).name}"
    saved.write_bytes(await file.read())

    params = {
        "path": str(saved),
        "filename": filename,
        "collectionName": collectionName,
        "sourceType": sourceType,
    }
    return JobCreated(jobId=store.enqueue(kind, params))


@router.get("/imports/{job_id}", response_model=JobStatus)
def get_import(job_id: str, store: JobStore = Depends(get_store)) -> JobStatus:
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return JobStatus.from_row(job)
