# syntax=docker/dockerfile:1
# The Atlas backend: API, ingestion pipeline and agent (FastAPI + uvicorn), managed with uv.
# NOTE: docling pulls in torch, so this image is large (multi-GB) and slow to build
# the first time. That is inherent to PDF parsing support.
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

# curl is used by the compose healthcheck.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first (cached across app-code changes). The app is run via
# PYTHONPATH (WORKDIR /app), so we never install the project itself as a package.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY app ./app

EXPOSE 8000

# The backend owns the schema, so it applies migrations before serving.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
