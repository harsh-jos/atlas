"""Real row locks and role migrations preserve the per-account policy."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import delete, text
from sqlalchemy.orm import sessionmaker

from app.agent.turns import TurnStore
from app.core.errors import AppError
from app.db.models import User


def test_postgres_serializes_starts_at_the_account_limit(engine):
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory.begin() as session:
        user = User(email=f"limit-{uuid4()}@example.com", password_hash="test-only")
        session.add(user)
        session.flush()
        user_id = user.id
    store = TurnStore(factory.begin)
    try:
        for index in range(2):
            turn = store.submit(user_id, f"s{index}", uuid4(), "Hello")
            store.cancel(user_id, turn["id"])

        def attempt(index):
            try:
                store.submit(user_id, f"new{index}", uuid4(), "Hello")
                return True
            except AppError as error:
                assert error.code == "conversation_limit"
                return False

        with ThreadPoolExecutor(max_workers=4) as pool:
            assert sorted(pool.map(attempt, range(4))) == [False, False, False, True]
        assert store.conversation_allowance(user_id) == {
            "used": 3, "limit": 3, "can_start": False,
        }
    finally:
        with factory.begin() as session:
            session.execute(delete(User).where(User.id == user_id))


def test_migration_makes_legacy_accounts_normal_without_losing_data(engine):
    with engine.begin() as connection:
        config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
        config.attributes["connection"] = connection
        command.downgrade(config, "7f1e3450a012")
        emails = [f"migration-{uuid4()}@example.com" for _ in range(2)]
        for email, role in zip(emails, ("OWNER", "MEMBER")):
            connection.execute(text(
                "INSERT INTO users (id, email, password_hash, role, storage_bytes) "
                "VALUES (:id, :email, 'preserved-hash', :role, 42)"
            ), {"id": uuid4(), "email": email, "role": role})
        command.upgrade(config, "head")
        for email in emails:
            row = connection.execute(text(
                "SELECT role, password_hash, storage_bytes FROM users WHERE email = :email"
            ), {"email": email}).one()
            assert tuple(row) == ("NORMAL", "preserved-hash", 42)
        command.check(config)
        # Leave the shared test database exactly as it was before this check.
        connection.rollback()
