"""Concept enrichment, revisions, and conversation provenance."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a016_concept_evidence"
down_revision = "a015_response_documents"
branch_labels = None
depends_on = None


def upgrade():
    json = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")
    op.add_column("concepts", sa.Column("aliases", json, nullable=True))
    op.add_column("concepts", sa.Column("enrichment_locked", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("concepts", sa.Column("overview_generated", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    for name, column in [
        ("enrichment_status", sa.Column("enrichment_status", sa.String(20), nullable=True)),
        ("enrichment_error", sa.Column("enrichment_error", sa.Text(), nullable=True)),
        ("learning_context", sa.Column("learning_context", json, nullable=True)),
    ]:
        op.add_column("agent_turns", column)
    op.create_table("concept_mentions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("concept_id", sa.Uuid(), sa.ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("turn_id", sa.Uuid(), sa.ForeignKey("agent_turns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("block_id", sa.String(40), nullable=False),
        sa.Column("excerpt", sa.Text(), nullable=False),
        sa.Column("extractor_version", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.clock_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.clock_timestamp(), nullable=False),
        sa.UniqueConstraint("concept_id", "turn_id", "block_id"))
    op.create_index("ix_concept_mentions_user_id", "concept_mentions", ["user_id"])
    op.create_table("concept_revisions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("concept_id", sa.Uuid(), sa.ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("turn_id", sa.Uuid(), sa.ForeignKey("agent_turns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("overview", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.clock_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.clock_timestamp(), nullable=False),
        sa.UniqueConstraint("concept_id", "turn_id"))
    op.create_index("ix_concept_revisions_user_id", "concept_revisions", ["user_id"])


def downgrade():
    op.drop_table("concept_revisions")
    op.drop_table("concept_mentions")
    for name in ("enrichment_status", "enrichment_error", "learning_context"):
        op.drop_column("agent_turns", name)
    op.drop_column("concepts", "enrichment_locked")
    op.drop_column("concepts", "overview_generated")
    op.drop_column("concepts", "aliases")
