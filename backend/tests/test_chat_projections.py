"""Projected chat reads retain legacy text and omit duplicated managed events."""

import asyncio
from uuid import uuid4

from google.adk.events import Event
from google.adk.sessions import DatabaseSessionService
from google.genai import types

from app.agent import session as chat
from app.core.config import get_settings


def test_database_chat_projections(engine, monkeypatch):
    async def check():
        service = DatabaseSessionService(db_url=engine.url.render_as_string(hide_password=False))
        monkeypatch.setattr(chat, 'get_session_service', lambda: service)
        user, session_id = str(uuid4()), str(uuid4())
        app = get_settings().agent_app_name
        try:
            stored = await service.create_session(app_name=app, user_id=user, session_id=session_id)
            for text, metadata in [('legacy question', {}), ('managed question', {'atlas_turn_id': 't1'})]:
                await service.append_event(stored, Event(
                    author='user', custom_metadata=metadata,
                    content=types.Content(role='user', parts=[types.Part(text=text)]),
                ))
            summaries = await chat.list_chat_sessions(user)
            assert summaries[0].first_message == 'legacy question'
            history = await chat.read_history(user, session_id, exclude_managed=True)
            assert [row.text for row in history] == ['legacy question']
            assert await chat.list_chat_sessions(str(uuid4())) == []
        finally:
            await service.delete_session(app_name=app, user_id=user, session_id=session_id)
            await service.close()
    asyncio.run(check())
