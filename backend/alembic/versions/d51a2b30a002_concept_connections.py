"""Add concept connections without changing existing artifact relations."""

from alembic import op
import sqlalchemy as sa

revision = "d51a2b30a002"
down_revision = "c40f1a20a001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "concept_connections",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "from_id", sa.Uuid(), sa.ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "to_id", sa.Uuid(), sa.ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("origin", sa.String(5), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.clock_timestamp(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.clock_timestamp(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "from_id", "to_id", "kind"),
    )
    for column in ("user_id", "from_id", "to_id"):
        op.create_index(f"ix_concept_connections_{column}", "concept_connections", [column])


def downgrade() -> None:
    op.drop_table("concept_connections")
