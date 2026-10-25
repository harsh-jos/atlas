"""Reusable learning documents, explicit save agreements, and immutable revisions."""
import hashlib
import json
from urllib.parse import urlsplit
from uuid import UUID

from sqlalchemy import select

from app.agent.knowledge import bounded, lock_owner, owned, require_saving
from app.agent.response import document
from app.core.enums import ArtifactFormat, Origin, SourceType
from app.core.slugify import slugify
from app.db.models import Artifact, ArtifactRevision, Asset, Concept, Source
from app.storage.quota import QuotaService, text_bytes


def snapshot(artifact):
    return {"title": artifact.title, "summary": artifact.summary, "body": artifact.body, "body_html": artifact.body_html, "format": str(artifact.format), "metadata": artifact.meta, "updated_at": artifact.updated_at.isoformat()}


def record_revision(session, artifact):
    session.add(ArtifactRevision(user_id=artifact.user_id, artifact_id=artifact.id, snapshot=snapshot(artifact)))


def validate_assets(session, user_id, doc):
    ids = {UUID(b["component"]["assetId"]) for b in doc["blocks"] if b["type"] == "component" and b["component"]["type"] == "image"}
    found = set(session.scalars(select(Asset.id).where(Asset.user_id == user_id, Asset.id.in_(ids)))) if ids else set()
    if found != ids:
        raise ValueError("Only owned image assets may be embedded.")


def content_data(session, user_id, content, kind):
    content = bounded(content, "Artifact content", 60000)
    if kind not in {"markdown", "components", "simulation"}:
        raise ValueError("Supported artifact kinds: markdown, components, simulation.")
    if kind == "simulation":
        return content, content, ArtifactFormat.HTML, {"kind": "simulation", "runtime": "sandbox-v1", "fallback": "Interactive simulation. Open the artifact and select Run to explore it."}
    doc = document(content)
    validate_assets(session, user_id, doc)
    return content, None, ArtifactFormat.MD, {"kind": kind, "document": doc}


def create(session, user_id, concept_name, title, summary, content, kind, source_urls, user_requested, session_id, turn_id):
    owner = lock_owner(session, user_id)
    require_saving(owner, user_requested)
    title, summary = bounded(title, "Title", 500), bounded(summary, "Summary", 2000)
    concept_name = bounded(concept_name, "Concept", 200)
    if len(source_urls) > 10 or any(len(u) > 4000 or urlsplit(u).scheme not in {"https", "http"} or not urlsplit(u).hostname for u in source_urls):
        raise ValueError("Supply at most ten actual HTTP source URLs.")
    slug = slugify(concept_name) or hashlib.sha256(concept_name.casefold().encode()).hexdigest()[:20]
    concept = session.scalar(select(Concept).where(Concept.user_id == user_id, Concept.slug == slug))
    if concept is None:
        concept = Concept(user_id=user_id, name=concept_name, slug=slug)
        session.add(concept)
        session.flush()
    key = hashlib.sha256(f"{concept.id}:{title.casefold()}".encode()).hexdigest()[:12]
    artifact_slug = f"{slugify(title)[:460] or 'artifact'}-{key}"
    artifact = session.scalar(select(Artifact).where(Artifact.user_id == user_id, Artifact.slug == artifact_slug))
    if artifact:
        return {"slug": artifact.slug, "url": f"/entries/{artifact.slug}", "created": False, "message": "Already saved. Read before revising."}
    body, html, format, meta = content_data(session, user_id, content, kind)
    QuotaService(session, owner).reserve(text_bytes(body, summary))
    artifact = Artifact(user_id=user_id, concept_id=concept.id, title=title, slug=artifact_slug, summary=summary, body=body, body_html=html, format=format, origin=Origin.AI, tags=[], meta={**meta, "session_id": session_id, "turn_id": turn_id, "revision": 1})
    artifact.sources = [Source(source_type=SourceType.WEBSITE, title=urlsplit(url).hostname, url=url) for url in dict.fromkeys(source_urls)]
    session.add(artifact)
    session.flush()
    return {"slug": artifact.slug, "url": f"/entries/{artifact.slug}", "created": True, "updated_at": artifact.updated_at.isoformat(), "kind": kind}


def revise(session, user_id, slug, expected_updated_at, content, summary, kind, user_requested):
    owner = lock_owner(session, user_id)
    require_saving(owner, user_requested)
    artifact = owned(session, Artifact, user_id, slug)
    if artifact.updated_at.isoformat() != expected_updated_at:
        raise ValueError("The artifact changed. Read it again before revising.")
    summary = bounded(summary, "Summary", 2000)
    body, html, format, meta = content_data(session, user_id, content, kind)
    delta = text_bytes(body, summary) - text_bytes(artifact.body, artifact.summary)
    quota = QuotaService(session, owner)
    if delta > 0:
        quota.reserve(delta)
    elif delta < 0:
        quota.release(-delta)
    record_revision(session, artifact)
    artifact.body, artifact.body_html, artifact.format, artifact.summary = body, html, format, summary
    artifact.meta = {**(artifact.meta or {}), **meta, "revision": (artifact.meta or {}).get("revision", 1) + 1}
    session.flush()
    return {"url": f"/entries/{artifact.slug}", "updated_at": artifact.updated_at.isoformat(), "revision": artifact.meta["revision"]}


def export_content(artifact):
    kind = (artifact.meta or {}).get("kind")
    if kind == "simulation":
        return {"content": artifact.body_html or artifact.body or "", "mime": "text/html", "extension": "html"}
    if kind == "components":
        return {"content": json.dumps((artifact.meta or {}).get("document") or document(artifact.body or ""), ensure_ascii=False, indent=2), "mime": "application/json", "extension": "json"}
    return {"content": artifact.body or "", "mime": "text/markdown", "extension": "md"}
