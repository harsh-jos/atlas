"""Record provider cache usage without claiming historical cache misses."""

from alembic import op
import sqlalchemy as sa

revision = "4c8b0120a009"
down_revision = "3b7a9010a008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("agent_requests", sa.Column("cached_input_tokens", sa.BigInteger(), nullable=True))


def downgrade():
    op.drop_column("agent_requests", "cached_input_tokens")
