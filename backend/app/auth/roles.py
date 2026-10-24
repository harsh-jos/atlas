"""Assign account roles with administrator database access, never through signup."""

import argparse

from sqlalchemy import select

from app.core.enums import Role
from app.db.base import SessionScope, get_session_scope
from app.db.models import User


def set_role(scope: SessionScope, email: str, role: Role) -> None:
    with scope() as session:
        user = session.scalar(select(User).where(User.email == email).with_for_update())
        if user is None:
            raise ValueError("No account has that email address. Sign in once before assigning a role.")
        user.role = role


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", required=True, choices=[role.value.lower() for role in Role])
    args = parser.parse_args()
    try:
        set_role(get_session_scope(), args.email, Role(args.role.upper()))
    except ValueError as error:
        parser.error(str(error))
    print(f"{args.email}: {args.role}")


if __name__ == "__main__":
    main()
