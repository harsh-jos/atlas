# syntax=docker/dockerfile:1
# The Atlas learning agent and API.
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
COPY alembic.ini ./
COPY alembic ./alembic

RUN useradd --create-home --uid 10001 atlas && mkdir -p /data/assets && chown -R atlas:atlas /app /data
USER atlas
ENV PORT=8000
EXPOSE 8000

# Run python -m app.db.bootstrap once before starting replicas.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
