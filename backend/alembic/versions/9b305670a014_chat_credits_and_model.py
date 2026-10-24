"""Persist the conversation model and per-turn credit usage."""
from alembic import op
import sqlalchemy as sa

revision = "9b305670a014"
down_revision = "8a2f4560a013"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("agent_turns", sa.Column("model", sa.String(200), nullable=True))
    op.add_column("agent_turns", sa.Column("credits_used", sa.Float(), nullable=True))
    op.add_column("agent_turns", sa.Column("credits_pending", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade():
    op.drop_column("agent_turns", "credits_pending")
    op.drop_column("agent_turns", "credits_used")
    op.drop_column("agent_turns", "model")
