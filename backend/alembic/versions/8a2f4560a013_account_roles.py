"""Normal accounts by default; superuser status requires explicit administration."""

from alembic import op
import sqlalchemy as sa

revision = "8a2f4560a013"
down_revision = "7f1e3450a012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # OWNER was the default for every account, not an administrator grant.
    op.alter_column("users", "role", existing_type=sa.String(6), type_=sa.String(9))
    op.execute("UPDATE users SET role = 'NORMAL' WHERE role IN ('OWNER', 'MEMBER')")
    op.alter_column("users", "role", server_default=sa.text("'NORMAL'"))
    op.create_check_constraint("role_values", "users", "role IN ('NORMAL', 'SUPERUSER')")


def downgrade() -> None:
    op.drop_constraint(op.f("ck_users_role_values"), "users", type_="check")
    op.alter_column("users", "role", server_default=None)
    op.execute("UPDATE users SET role = 'OWNER'")
    op.alter_column("users", "role", existing_type=sa.String(9), type_=sa.String(6))
