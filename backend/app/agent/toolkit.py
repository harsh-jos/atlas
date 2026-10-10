"""Read tools scoped to the current user's saved knowledge."""

import asyncio
import logging
from collections.abc import Callable
from uuid import UUID

from app.db.base import SessionScope
from app.search import search_artifacts

log = logging.getLogger(__name__)


def build_toolkit(scope: SessionScope, user_id: UUID) -> list[Callable]:
    def search(query: str) -> dict:
        with scope() as session:
            return {"results": search_artifacts(session, user_id, query)}

    async def search_knowledge_base(query: str) -> dict:
        """Find this user's saved explanations relevant to the current question.

        Saved content is evidence of prior exploration, not proof of understanding.
        Returns matching artifacts, or an explicit error if retrieval fails.
        """
        try:
            return await asyncio.to_thread(search, query)
        except Exception as error:
            log.warning("knowledge search failed: %s", error)
            return {"error": "Saved explanations could not be searched. Try again."}

    return [search_knowledge_base]
