"""Periodic housekeeping: abandoned previews would otherwise keep a whole crawl forever."""

import asyncio
import logging

from app.core.config import get_settings
from app.db.base import SessionScope
from app.pipeline.preview import sweep_expired_previews

log = logging.getLogger(__name__)


async def run_sweeper(scope: SessionScope, stop: asyncio.Event) -> None:
    """Sweep on an interval until asked to stop; a failed sweep must never kill the loop."""
    interval = get_settings().preview_sweep_seconds
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
            return
        except TimeoutError:
            pass
        try:
            removed = await asyncio.to_thread(_sweep, scope)
        except Exception:
            log.exception("preview sweep failed")
            continue
        if removed:
            log.info("swept %d expired previews", removed)


def _sweep(scope: SessionScope) -> int:
    with scope() as session:
        return sweep_expired_previews(session)
