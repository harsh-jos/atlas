"""Persist the owner's agent memory and saving choices across conversations."""

from alembic import op
import sqlalchemy as sa

revision = "3b7a9010a008"
down_revision = "2a6f8090a007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("agent_memory_enabled", sa.Boolean(), nullable=False,
                                    server_default=sa.text("true")))
    op.add_column("users", sa.Column("agent_auto_save", sa.Boolean(), nullable=False,
                                    server_default=sa.text("false")))


def downgrade():
    op.drop_column("users", "agent_auto_save")
    op.drop_column("users", "agent_memory_enabled")
