"""Versioned assistant response documents."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a015_response_documents"
down_revision = "9b305670a014"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("agent_turns", sa.Column("response_document", sa.JSON().with_variant(postgresql.JSONB(), "postgresql")))


def downgrade():
    op.drop_column("agent_turns", "response_document")
