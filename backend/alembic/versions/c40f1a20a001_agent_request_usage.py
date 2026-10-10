"""Record bounded agent requests and provider-reported usage."""

from alembic import op
import sqlalchemy as sa

revision = "c40f1a20a001"
down_revision = "13874be9bbcc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
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
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("invocation_id", sa.String(64), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("research", sa.Boolean(), nullable=False),
        sa.Column("reported", sa.Boolean(), nullable=False),
        *[
            sa.Column(name, sa.BigInteger(), nullable=False)
            for name in ("input_tokens", "output_tokens", "thought_tokens", "total_tokens")
        ],
        sa.Column("search_queries", sa.Integer(), nullable=False),
    )
    op.create_index("ix_agent_requests_user_id", "agent_requests", ["user_id"])
    op.create_index("ix_agent_requests_owner_session", "agent_requests", ["user_id", "session_id"])


def downgrade() -> None:
    op.drop_table("agent_requests")
