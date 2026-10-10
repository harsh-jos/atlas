"""Index full-text search, substring matching, and ordered queue/library reads."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import TSVECTOR

revision = '2a6f8090a007'
down_revision = '195e6f70a006'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    op.add_column('artifacts', sa.Column(
        'search_vector', TSVECTOR(), sa.Computed(
            "to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || "
            "coalesce(summary, '') || ' ' || coalesce(body, ''))", persisted=True,
        ), nullable=False,
    ))
    op.create_index('ix_artifacts_search_vector', 'artifacts', ['search_vector'], postgresql_using='gin')
    op.create_index('ix_artifacts_title_trgm', 'artifacts', ['title'], postgresql_using='gin',
                    postgresql_ops={'title': 'gin_trgm_ops'})
    op.create_index('ix_artifacts_tags', 'artifacts', ['tags'], postgresql_using='gin')
    op.create_index('ix_artifacts_owner_concept_updated', 'artifacts',
                    ['user_id', 'concept_id', sa.text('updated_at DESC'), sa.text('id DESC')])
    op.create_index('ix_agent_turns_queue', 'agent_turns', ['status', 'created_at', 'id'])
    op.create_index('ix_agent_turns_lease', 'agent_turns', ['status', 'lease_until'])
    op.create_index('ix_agent_turns_history', 'agent_turns', ['user_id', 'session_id', 'created_at', 'id'])


def downgrade():
    for name in ('ix_agent_turns_history', 'ix_agent_turns_lease', 'ix_agent_turns_queue'):
        op.drop_index(name, table_name='agent_turns')
    for name in ('ix_artifacts_owner_concept_updated', 'ix_artifacts_tags',
                 'ix_artifacts_title_trgm', 'ix_artifacts_search_vector'):
        op.drop_index(name, table_name='artifacts')
    op.drop_column('artifacts', 'search_vector')
