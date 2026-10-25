"""Generated-image provenance and modality-aware estimates."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = "a017_image_accounting"
down_revision = "a016_concept_evidence"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("agent_requests", sa.Column("output_image_tokens", sa.BigInteger(), nullable=False, server_default="0"))
    op.add_column("assets", sa.Column("metadata", sa.JSON().with_variant(postgresql.JSONB(), "postgresql")))


def downgrade():
    op.drop_column("assets", "metadata")
    op.drop_column("agent_requests", "output_image_tokens")
