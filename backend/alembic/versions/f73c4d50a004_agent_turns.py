"""Persist accepted turns, their status, and submission idempotency."""

from alembic import op
import sqlalchemy as sa

revision = "f73c4d50a004"
down_revision = "e62b3c40a003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_turns",
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
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("reply", sa.Text()),
        sa.Column("error", sa.Text()),
        sa.Column("tool_name", sa.String(200)),
        sa.Column("lease_until", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("user_id", "session_id", "request_id"),
    )
    op.create_index("ix_agent_turns_user_id", "agent_turns", ["user_id"])
    op.create_index("ix_agent_turns_status", "agent_turns", ["status"])
    op.create_index("ix_agent_turns_owner_session", "agent_turns", ["user_id", "session_id"])
    op.create_index(
        "ix_agent_turns_active_session",
        "agent_turns",
        ["user_id", "session_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('queued', 'running')"),
        sqlite_where=sa.text("status IN ('queued', 'running')"),
    )


def downgrade() -> None:
    op.drop_table("agent_turns")
