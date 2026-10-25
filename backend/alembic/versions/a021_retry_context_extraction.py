"""Restore manual graph retries after bounding optional extraction context."""
from alembic import op
import sqlalchemy as sa

revision = "a021_retry_context_extraction"
down_revision = "a020_retry_failed_extraction"
branch_labels = None
depends_on = None


def upgrade():
    # Restore manual retries without scheduling calls or changing saved graph data.
    # concepts-v3 task names avoid deduplication with previous failed attempts.
    op.execute(sa.text("""
        UPDATE agent_turns
        SET enrichment_attempts = 0
        WHERE status = 'completed' AND enrichment_status = 'failed'
    """))


def downgrade():
    # Historical attempt counts cannot be reconstructed; no schema was changed.
    pass
