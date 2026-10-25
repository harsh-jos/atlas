"""Owned concept evidence and exact conversation destinations."""
from urllib.parse import urlencode
from sqlalchemy import select
from app.agent.knowledge import owned
from app.db.models import AgentTurn, Concept, ConceptMention


def discussions(session, user_id, slug):
    concept = owned(session, Concept, user_id, slug)
    rows = session.execute(select(ConceptMention, AgentTurn).join(AgentTurn, AgentTurn.id == ConceptMention.turn_id).where(ConceptMention.user_id == user_id, AgentTurn.user_id == user_id, ConceptMention.concept_id == concept.id).order_by(ConceptMention.created_at.desc()).limit(30)).all()
    return [{"excerpt": mention.excerpt, "question": turn.message, "createdAt": mention.created_at.isoformat(),
             "url": f"/chat/{turn.session_id}?{urlencode({'turn': str(turn.id), 'block': mention.block_id})}"}
            for mention, turn in rows]
