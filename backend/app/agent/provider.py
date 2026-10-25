"""Direct specialist calls use the same spending ledger as ADK calls."""
import asyncio
from google import genai
from google.genai.errors import APIError

from app.agent.session import configure_vertex
from app.agent.usage import UsageStore
from app.core.config import get_settings


async def generate(store: UsageStore, invocation_id: str, model: str, contents, config):
    settings = get_settings()
    request = await asyncio.to_thread(store.reserve, invocation_id, model, False, settings)
    configure_vertex()
    try:
        async with genai.Client(vertexai=True, project=settings.vertex_project, location=settings.vertex_location).aio as client:
            response = await client.models.generate_content(model=model, contents=contents, config=config)
    except APIError as error:
        if error.code in (400, 401, 403, 404, 429):
            await asyncio.to_thread(store.reject, request)
        raise
    usage = response.usage_metadata
    image_model = model in ("gemini-3.1-flash-image", "gemini-nano-banana-2.1")
    image_tokens = sum(d.token_count or 0 for d in (usage.candidates_tokens_details or []) if str(d.modality) in ("IMAGE", "MediaModality.IMAGE")) if usage else 0
    # When a provider omits modality details, use the higher image rate for all output.
    if image_model and usage and not usage.candidates_tokens_details:
        image_tokens = usage.candidates_token_count or 0
    await asyncio.to_thread(store.record, request, settings,
        reported=bool(usage and usage.total_token_count is not None),
        output_image_tokens=image_tokens,
        input_tokens=usage.prompt_token_count or 0 if usage else 0,
        cached_input_tokens=usage.cached_content_token_count if usage else None,
        output_tokens=usage.candidates_token_count or 0 if usage else 0,
        thought_tokens=usage.thoughts_token_count or 0 if usage else 0,
        total_tokens=usage.total_token_count or 0 if usage else 0)
    return response
