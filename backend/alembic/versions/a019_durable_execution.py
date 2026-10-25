"""Execution fencing and separately leased enrichment."""
from alembic import op
import sqlalchemy as sa
revision = "a019_durable_execution"
down_revision = "a018_artifact_revisions"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("agent_turns", sa.Column("execution_token", sa.Uuid(), nullable=True))
    op.add_column("agent_turns", sa.Column("enrichment_token", sa.Uuid(), nullable=True))
    op.add_column("agent_turns", sa.Column("enrichment_lease_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("agent_turns", sa.Column("enrichment_attempts", sa.Integer(), nullable=False, server_default="0"))


def downgrade():
    for name in ("enrichment_attempts", "enrichment_lease_until", "enrichment_token", "execution_token"):
        op.drop_column("agent_turns", name)
