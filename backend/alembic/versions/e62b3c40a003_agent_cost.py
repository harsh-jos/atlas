"""Persist estimated request cost; historical requests remain explicitly unknown."""

from alembic import op
import sqlalchemy as sa

revision = "e62b3c40a003"
down_revision = "d51a2b30a002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_requests", sa.Column("estimated_cost_microusd", sa.BigInteger()))


def downgrade() -> None:
    op.drop_column("agent_requests", "estimated_cost_microusd")
