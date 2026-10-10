"""Persist machine-readable turn outcomes and bounded tool failure summaries."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "195e6f70a006"
down_revision = "084d5e60a005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_turns", sa.Column("error_code", sa.String(64)))
    op.add_column("agent_turns", sa.Column("tool_errors", JSONB(), server_default=sa.text("'[]'"), nullable=False))


def downgrade() -> None:
    op.drop_column("agent_turns", "tool_errors")
    op.drop_column("agent_turns", "error_code")
