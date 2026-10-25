"""Restore manual retries after repairing the rejected Vertex extraction schema."""
from alembic import op
import sqlalchemy as sa

revision = "a020_retry_failed_extraction"
down_revision = "a019_durable_execution"
branch_labels = None
depends_on = None


def upgrade():
    # Do not enqueue paid work, touch completed extractions, or revoke a live lease.
    # Versioned task names prevent the renewed attempts colliding with old jobs.
    op.execute(sa.text("""
        UPDATE agent_turns
        SET enrichment_attempts = 0
        WHERE status = 'completed' AND enrichment_status = 'failed'
    """))


def downgrade():
    # Historical attempt counts cannot be reconstructed. No schema was changed.
    pass
