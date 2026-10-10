"""Distinguish confirmed provider capacity rejections from unknown execution."""

from alembic import op
import sqlalchemy as sa

revision = "5d9c1230a010"
down_revision = "4c8b0120a009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("agent_requests", sa.Column("rejected", sa.Boolean(), nullable=False,
                                            server_default=sa.text("false")))


def downgrade():
    op.drop_column("agent_requests", "rejected")
