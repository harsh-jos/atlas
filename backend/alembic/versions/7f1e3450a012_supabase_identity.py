"""Link external identities without changing ownership or silently merging accounts."""

from alembic import op
import sqlalchemy as sa

revision = "7f1e3450a012"
down_revision = "6e0d2340a011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=True)
    op.add_column("users", sa.Column("supabase_user_id", sa.Uuid(), nullable=True))
    op.create_unique_constraint("uq_users_supabase_user_id", "users", ["supabase_user_id"])


def downgrade() -> None:
    # Refuse a destructive downgrade while passwordless accounts exist.
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT count(*) FROM users WHERE password_hash IS NULL")):
        raise RuntimeError("Migrate passwordless accounts before downgrading")
    op.drop_constraint("uq_users_supabase_user_id", "users", type_="unique")
    op.drop_column("users", "supabase_user_id")
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=False)
