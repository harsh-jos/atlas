"""Immutable artifact revisions."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = "a018_artifact_revisions"
down_revision = "a017_image_accounting"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("artifact_revisions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("artifact_id", sa.Uuid(), sa.ForeignKey("artifacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot", sa.JSON().with_variant(postgresql.JSONB(), "postgresql"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.clock_timestamp(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.clock_timestamp(), nullable=False))
    op.create_index("ix_artifact_revisions_user_id", "artifact_revisions", ["user_id"])


def downgrade():
    op.drop_table("artifact_revisions")
