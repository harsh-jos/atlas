"""Persist ordered events for resumable chat streams."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "6e0d2340a011"
down_revision = "5d9c1230a010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_turns", sa.Column("event_sequence", sa.BigInteger(), nullable=False,
                                         server_default=sa.text("0")))
    op.create_table(
        "agent_turn_events",
        sa.Column("turn_id", sa.Uuid(), sa.ForeignKey("agent_turns.id", ondelete="CASCADE"),
                  primary_key=True),
        sa.Column("sequence", sa.BigInteger(), primary_key=True),
        sa.Column("data", JSONB(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("agent_turn_events")
    op.drop_column("agent_turns", "event_sequence")
