"""The quota is the only thing standing between one user and the whole disk — attack the edges."""

import pytest

from app.db.models import User
from app.storage.quota import QuotaExceeded, QuotaService


@pytest.fixture
def quota(session):
    user = User(email="owner@example.com", password_hash="x")
    session.add(user)
    session.flush()
    return QuotaService(session, user)


def test_reserve_under_the_limit_moves_the_counter(quota):
    quota.reserve(1024)
    assert quota.user.storage_bytes == 1024


def test_reserve_over_the_limit_raises_and_leaves_the_counter(quota):
    quota.reserve(1024)
    with pytest.raises(QuotaExceeded) as error:
        quota.reserve(quota.limit)
    assert error.value.requested == quota.limit
    assert error.value.available == quota.limit - 1024
    assert quota.user.storage_bytes == 1024


def test_reserve_up_to_the_exact_limit_succeeds(quota):
    quota.reserve(quota.limit)
    assert quota.user.storage_bytes == quota.limit
    with pytest.raises(QuotaExceeded):
        quota.reserve(1)


def test_release_decrements(quota):
    quota.reserve(4096)
    quota.release(1024)
    assert quota.user.storage_bytes == 3072


def test_release_never_goes_below_zero(quota):
    quota.reserve(512)
    quota.release(2048)
    assert quota.user.storage_bytes == 0


def test_remaining_reflects_reservations(quota):
    assert quota.remaining() == quota.limit
    quota.reserve(2048)
    assert quota.remaining() == quota.limit - 2048
    quota.release(2048)
    assert quota.remaining() == quota.limit
