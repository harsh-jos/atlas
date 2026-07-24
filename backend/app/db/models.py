"""The Atlas knowledge base: users own concepts, artifacts, edges, and uploaded assets."""

from datetime import datetime
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship

from app.core.enums import ArtifactFormat, Origin, RelationType, Role, SourceType
from app.db.base import Base

EMBEDDING_DIMENSIONS = 1536


def _enum(python_enum: type) -> Enum:
    return Enum(python_enum, native_enum=False, validate_strings=True)


class UUIDKey:
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
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

    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(_enum(Role), default=Role.OWNER)
    storage_bytes: Mapped[int] = mapped_column(BigInteger, default=0)


class Asset(OwnedRecord):
    """Uploaded bytes on disk; this row is the metadata and the unit of storage quota."""

    __tablename__ = "assets"

    file_name: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(127))
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

    artifacts: Mapped[list["Artifact"]] = relationship(
        back_populates="concept", cascade="all, delete-orphan"
    )


class Artifact(OwnedRecord):
    """One self-contained thing to read — markdown, HTML, or PDF."""

    __tablename__ = "artifacts"
    __table_args__ = (
        UniqueConstraint("user_id", "slug"),
        Index("ix_artifacts_concept_source_key", "concept_id", text("(metadata->>'sourceKey')")),
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
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
    origin: Mapped[Origin] = mapped_column(_enum(Origin), default=Origin.HUMAN)

    concept: Mapped[Concept] = relationship(back_populates="artifacts")
    sources: Mapped[list["Source"]] = relationship(
        back_populates="artifact", cascade="all, delete-orphan"
    )


class Preview(OwnedRecord):
    """A built-but-unwritten import, parked between proposal and curation."""

    __tablename__ = "previews"

    concept_name: Mapped[str] = mapped_column(String(200))
    scope: Mapped[str] = mapped_column(String(500))
    payload: Mapped[dict] = mapped_column(JSONB)


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
