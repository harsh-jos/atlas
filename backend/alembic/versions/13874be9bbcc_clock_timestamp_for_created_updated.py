"""use clock_timestamp() for created_at/updated_at defaults

now() is pinned to the transaction's start, so a bulk ingestion that writes many
rows in one transaction stamps every row with the same instant — sorting by
created_at within that batch becomes a no-op (this is why "oldest first" and
"newest first" returned the same order). clock_timestamp() reads the actual
wall clock per row, so insertion order survives. Existing rows already written
under the old default keep whatever timestamp they have — this only changes
what gets stamped on future inserts/updates.

Revision ID: 13874be9bbcc
Revises: b75332c4d793
Create Date: 2026-08-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '13874be9bbcc'
down_revision: Union[str, Sequence[str], None] = 'b75332c4d793'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Every table built on the Timestamped mixin (app/db/models.py).
_TABLES = [
    'users',
    'assets',
    'concepts',
    'artifacts',
    'previews',
    'judged_pairs',
    'sources',
    'relations',
]


def upgrade() -> None:
    for table in _TABLES:
        op.alter_column(table, 'created_at', server_default=sa.text('clock_timestamp()'))
        op.alter_column(table, 'updated_at', server_default=sa.text('clock_timestamp()'))


def downgrade() -> None:
    for table in _TABLES:
        op.alter_column(table, 'created_at', server_default=sa.text('now()'))
        op.alter_column(table, 'updated_at', server_default=sa.text('now()'))
