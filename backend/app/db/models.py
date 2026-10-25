"""The Atlas knowledge base: users own concepts, artifacts, edges, and uploaded assets."""

from datetime import datetime
from uuid import UUID, uuid4
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Computed,
    Enum,
    Float,
    ForeignKey,
    Index,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from app.core.config import EMBEDDING_DIMENSIONS
from app.core.enums import ArtifactFormat, Origin, RelationType, Role, SourceType
from app.db.base import Base


def _enum(python_enum: type) -> Enum:
    return Enum(python_enum, native_enum=False, validate_strings=True)


class UUIDKey:
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)


class Timestamped:
    # clock_timestamp(), not now(): now() is pinned to the transaction's start, so a bulk
    # ingestion that writes many rows in one transaction gives every row the same instant —
    # sorting by created_at within that batch becomes a no-op. clock_timestamp() is the
    # actual wall clock at each row, so insertion order survives.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.clock_timestamp(),
        onupdate=func.clock_timestamp(),
    )


class UserOwned:
    """Every owned row carries its owner, so access can be scoped in exactly one place."""

    @declared_attr
    def user_id(cls) -> Mapped[UUID]:
        return mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class Record(UUIDKey, Timestamped, Base):
    __abstract__ = True


class OwnedRecord(Record, UserOwned):
    """Base for anything a user owns — the type the scoped repository is written against."""

    __abstract__ = True


class User(Record):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('NORMAL', 'SUPERUSER')", name="role_values"),)

    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    supabase_user_id: Mapped[UUID | None] = mapped_column(unique=True)
    role: Mapped[Role] = mapped_column(
        _enum(Role), default=Role.NORMAL, server_default=text("'NORMAL'")
    )
    storage_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    agent_memory_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    agent_auto_save: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))


class Asset(OwnedRecord):
    """Uploaded bytes on disk; this row is the metadata and the unit of storage quota."""

    __tablename__ = "assets"

    file_name: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(127))
    meta: Mapped[dict | None] = mapped_column("metadata", JSON().with_variant(JSONB(), "postgresql"))
    size: Mapped[int]


class Concept(OwnedRecord):
    """A group of artifacts plus its own readable overview page."""

    __tablename__ = "concepts"
    __table_args__ = (UniqueConstraint("user_id", "slug"),)

    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str | None] = mapped_column(String(32))
    overview: Mapped[str | None] = mapped_column(Text)
    aliases: Mapped[list | None] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))
    enrichment_locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    overview_generated: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))

    artifacts: Mapped[list["Artifact"]] = relationship(
        back_populates="concept", cascade="all, delete-orphan", passive_deletes=True
    )


class Artifact(OwnedRecord):
    """One self-contained thing to read — markdown, HTML, or PDF."""

    __tablename__ = "artifacts"
    __table_args__ = (
        UniqueConstraint("user_id", "slug"),
        Index("ix_artifacts_concept_source_key", "concept_id", text("(metadata->>'sourceKey')")),
        Index("ix_artifacts_search_vector", "search_vector", postgresql_using="gin"),
        Index("ix_artifacts_title_trgm", "title", postgresql_using="gin",
              postgresql_ops={"title": "gin_trgm_ops"}),
        Index("ix_artifacts_tags", "tags", postgresql_using="gin"),
        Index("ix_artifacts_owner_concept_updated", "user_id", "concept_id",
              text("updated_at DESC"), text("id DESC")),
    )

    concept_id: Mapped[UUID] = mapped_column(
        ForeignKey("concepts.id", ondelete="CASCADE"), index=True
    )
    asset_id: Mapped[UUID | None] = mapped_column(ForeignKey("assets.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(500))
    slug: Mapped[str] = mapped_column(String(500))
    summary: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str | None] = mapped_column(Text)
    body_html: Mapped[str | None] = mapped_column(Text)
    format: Mapped[ArtifactFormat] = mapped_column(_enum(ArtifactFormat), default=ArtifactFormat.MD)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    meta: Mapped[dict | None] = mapped_column("metadata", JSONB)
    search_vector: Mapped[Any] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || "
                 "coalesce(summary, '') || ' ' || coalesce(body, ''))", persisted=True),
        deferred=True,
    )
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
    origin: Mapped[Origin] = mapped_column(_enum(Origin), default=Origin.HUMAN)

    concept: Mapped[Concept] = relationship(back_populates="artifacts")
    sources: Mapped[list["Source"]] = relationship(
        back_populates="artifact", cascade="all, delete-orphan", passive_deletes=True
    )


# Retained schema definitions for existing installs. Import and linker routes are archived.
# Remove these only with a separate migration and an explicit data-retention decision.
class Preview(OwnedRecord):
    """A built-but-unwritten import, parked between proposal and curation."""

    __tablename__ = "previews"

    concept_name: Mapped[str] = mapped_column(String(200))
    scope: Mapped[str] = mapped_column(String(500))
    payload: Mapped[dict] = mapped_column(JSONB)


class JudgedPair(OwnedRecord):
    """A pair the judge has already ruled on.

    Without this the linker ratchets: every rerun re-judges the pairs it previously declined and
    rolls again, so the graph saturates towards everything-related-to-everything. Recording the
    verdict makes a rerun on an unchanged base a no-op, and stops re-spending tokens on it.
    """

    __tablename__ = "judged_pairs"
    __table_args__ = (UniqueConstraint("user_id", "low_id", "high_id"),)

    low_id: Mapped[UUID] = mapped_column(ForeignKey("artifacts.id", ondelete="CASCADE"), index=True)
    high_id: Mapped[UUID] = mapped_column(
        ForeignKey("artifacts.id", ondelete="CASCADE"), index=True
    )


class Source(Record):
    """Where an artifact came from — the provenance spine."""

    __tablename__ = "sources"

    artifact_id: Mapped[UUID] = mapped_column(
        ForeignKey("artifacts.id", ondelete="CASCADE"), index=True
    )
    source_type: Mapped[SourceType] = mapped_column(_enum(SourceType))
    title: Mapped[str] = mapped_column(String(500))
    author: Mapped[str | None] = mapped_column(String(255))
    url: Mapped[str | None] = mapped_column(Text)
    ref: Mapped[str | None] = mapped_column(String(255))

    artifact: Mapped[Artifact] = relationship(back_populates="sources")


class Relation(OwnedRecord):
    """A typed edge between two artifacts; machine-made ones carry origin and confidence."""

    __tablename__ = "relations"
    __table_args__ = (UniqueConstraint("from_id", "to_id", "relation_type"),)

    from_id: Mapped[UUID] = mapped_column(
        ForeignKey("artifacts.id", ondelete="CASCADE"), index=True
    )
    to_id: Mapped[UUID] = mapped_column(ForeignKey("artifacts.id", ondelete="CASCADE"), index=True)
    relation_type: Mapped[RelationType] = mapped_column(_enum(RelationType))
    note: Mapped[str | None] = mapped_column(Text)
    origin: Mapped[Origin] = mapped_column(_enum(Origin), default=Origin.HUMAN)
    confidence: Mapped[float | None] = mapped_column(Float)


class AgentRequest(OwnedRecord):
    """One reserved model request, counted even if a provider fails before reporting usage."""

    __tablename__ = "agent_requests"
    __table_args__ = (Index("ix_agent_requests_owner_session", "user_id", "session_id"),)

    session_id: Mapped[str] = mapped_column(String(64))
    invocation_id: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(200))
    research: Mapped[bool] = mapped_column(default=False)
    reported: Mapped[bool] = mapped_column(default=False)
    rejected: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    input_tokens: Mapped[int] = mapped_column(BigInteger, default=0)
    # A subset of input_tokens. NULL means the provider did not report cache usage.
    cached_input_tokens: Mapped[int | None] = mapped_column(BigInteger)
    output_tokens: Mapped[int] = mapped_column(BigInteger, default=0)
    output_image_tokens: Mapped[int] = mapped_column(BigInteger, default=0, server_default=text("0"))
    thought_tokens: Mapped[int] = mapped_column(BigInteger, default=0)
    total_tokens: Mapped[int] = mapped_column(BigInteger, default=0)
    search_queries: Mapped[int] = mapped_column(default=0)
    # NULL means pending or unknown, including requests made before cost accounting.
    estimated_cost_microusd: Mapped[int | None] = mapped_column(BigInteger)


class AgentTurn(OwnedRecord):
    """An accepted user message, independent of the HTTP request that submitted it."""

    __tablename__ = "agent_turns"
    __table_args__ = (
        UniqueConstraint("user_id", "session_id", "request_id"),
        Index("ix_agent_turns_owner_session", "user_id", "session_id"),
        Index("ix_agent_turns_queue", "status", "created_at", "id"),
        Index("ix_agent_turns_lease", "status", "lease_until"),
        Index("ix_agent_turns_history", "user_id", "session_id", "created_at", "id"),
        Index(
            "ix_agent_turns_active_session", "user_id", "session_id", unique=True,
            postgresql_where=text("status IN ('queued', 'running')"),
            sqlite_where=text("status IN ('queued', 'running')"),
        ),
    )

    session_id: Mapped[str] = mapped_column(String(64))
    request_id: Mapped[UUID]
    message: Mapped[str] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(String(200))
    credits_used: Mapped[float | None] = mapped_column(Float)
    credits_pending: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    reply: Mapped[str | None] = mapped_column(Text)
    execution_token: Mapped[UUID | None] = mapped_column()
    enrichment_token: Mapped[UUID | None] = mapped_column()
    enrichment_lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    enrichment_attempts: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    enrichment_status: Mapped[str | None] = mapped_column(String(20))
    enrichment_error: Mapped[str | None] = mapped_column(Text)
    learning_context: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))
    response_document: Mapped[dict | None] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))
    error: Mapped[str | None] = mapped_column(Text)
    tool_name: Mapped[str | None] = mapped_column(String(200))
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    error_code: Mapped[str | None] = mapped_column(String(64))
    tool_errors: Mapped[list] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"), default=list, server_default=text("'[]'")
    )
    event_sequence: Mapped[int] = mapped_column(BigInteger, default=0, server_default=text("0"))


class AgentTurnEvent(Base):
    """Ordered, committed stream frames; notifications only wake readers of this log."""

    __tablename__ = "agent_turn_events"
    turn_id: Mapped[UUID] = mapped_column(
        ForeignKey("agent_turns.id", ondelete="CASCADE"), primary_key=True
    )
    sequence: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    data: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))


class ConceptConnection(OwnedRecord):
    """A small orientation graph; 'requires' points from an idea to its prerequisite."""

    __tablename__ = "concept_connections"
    __table_args__ = (UniqueConstraint("user_id", "from_id", "to_id", "kind"),)

    from_id: Mapped[UUID] = mapped_column(
        ForeignKey("concepts.id", ondelete="CASCADE"), index=True
    )
    to_id: Mapped[UUID] = mapped_column(
        ForeignKey("concepts.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(20))
    note: Mapped[str] = mapped_column(Text)
    origin: Mapped[Origin] = mapped_column(_enum(Origin), default=Origin.AI)


class ConceptMention(OwnedRecord):
    __tablename__ = "concept_mentions"
    __table_args__ = (UniqueConstraint("concept_id", "turn_id", "block_id"),)
    concept_id: Mapped[UUID] = mapped_column(ForeignKey("concepts.id", ondelete="CASCADE"))
    turn_id: Mapped[UUID] = mapped_column(ForeignKey("agent_turns.id", ondelete="CASCADE"))
    block_id: Mapped[str] = mapped_column(String(40))
    excerpt: Mapped[str] = mapped_column(Text)
    extractor_version: Mapped[str] = mapped_column(String(40))


class ConceptRevision(OwnedRecord):
    __tablename__ = "concept_revisions"
    __table_args__ = (UniqueConstraint("concept_id", "turn_id"),)
    concept_id: Mapped[UUID] = mapped_column(ForeignKey("concepts.id", ondelete="CASCADE"))
    turn_id: Mapped[UUID] = mapped_column(ForeignKey("agent_turns.id", ondelete="CASCADE"))
    overview: Mapped[str] = mapped_column(Text)


class ArtifactRevision(OwnedRecord):
    __tablename__ = "artifact_revisions"
    artifact_id: Mapped[UUID] = mapped_column(ForeignKey("artifacts.id", ondelete="CASCADE"))
    snapshot: Mapped[dict] = mapped_column(JSON().with_variant(JSONB(), "postgresql"))
