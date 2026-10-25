# Atlas

A place to explore a question, keep useful explanations, and see how ideas connect.

[Try Atlas](https://app.slash-atlas.live) · [Source code](https://github.com/slash-atlas/atlas)

Atlas is an AI learning platform built around curiosity. Start with something you
want to understand, ask follow-up questions, and take a detour when you need to.
Your conversations, saved explanations, and concept connections give you a place
to return to later.

## What you can do

- **Explore at your own pace.** Ask about a subject, work through an example, or
  follow a prerequisite. You choose the direction and depth.
- **Learn with more than text.** Explanations can include diagrams, worked examples,
  comparisons, interactive plots, and generated illustrations.
- **Keep explanations worth returning to.** Save them to your library, revise them,
  and export them. Saved artifacts can also include interactive HTML simulations.
- **See connections between ideas.** Explore a concept graph with links back to
  the conversations that introduced them.
- **Pick up a conversation later.** Chat history persists, and accepted replies
  continue running when you close the tab.
- **Control what Atlas remembers.** Concept memory and automatic library saving
  have separate preferences. Memory is on by default; automatic saving is off.

For example, start with “Why do neural networks need activation functions?”
Explore the explanation, ask about a prerequisite, and save the part you want to
revisit. The concept graph helps you find the connections later.

Atlas is an early personal project. AI explanations, generated visuals, and concept
connections can be wrong; source links help you check them. The hosted service has
usage limits, and permanent availability is not promised.

## Run locally

You need Docker for PostgreSQL, Node.js 20.9 or newer, Python 3.11 or newer, and
[uv](https://docs.astral.sh/uv/). Agent replies also require a Google Cloud project
with Vertex AI access, billing, and Application Default Credentials (ADC).

1. Copy `.env.example` to `.env`. Set a random `JWT_SECRET` and your `VERTEX_PROJECT`.
   Generate a secret with `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`.
2. Copy `backend/.env.example` to `backend/.env`. Use the same `JWT_SECRET`,
   `VERTEX_PROJECT`, and host database URL in both files. Configure ADC for the
   backend process. See the [development guide](docs/development.md#local-development)
   for credential setup.
3. Start the database from the repository root:

   ```sh
   docker compose up -d db
   ```

4. Start the backend in a separate terminal:

   ```sh
   cd backend
   uv sync --frozen
   uv run python -m app.db.bootstrap
   uv run uvicorn app.main:app --port 8000
   ```

5. Start the frontend from the repository root:

   ```sh
   npm ci
   npm run dev
   ```

Open [localhost:3000](http://localhost:3000) and create a local account. Backend
readiness is available at [localhost:8000/healthz](http://localhost:8000/healthz).
If port 5432 is occupied, change `POSTGRES_PORT` and both host database URLs together.

The full stack can also run with `docker compose up --build`, but Compose does
not mount host Google credentials. The host-backend setup above is the simplest
path for local agent use.

## Stack

Next.js and React for the interface; FastAPI and Google ADK with Gemini on Vertex AI
for the agent; PostgreSQL with pgvector for storage. Hosted deployments use Google
Cloud Run, Cloud Tasks, and Supabase for authentication, PostgreSQL, and private assets.

## Documentation

- [Development and operations](docs/development.md): setup, checks, account roles,
  model settings, database management, and failure handling.
- [Deployment](docs/deployment.md): Cloud Run, Supabase, and GitHub Actions setup.
- [Agent guide](docs/agent-guide.md): response components, tools, artifacts, and memory.
- [Agent runtime](docs/agent-runtime.md): durable jobs, progress events, and interruptions.
- [Product direction](docs/product.md): intended behaviour, scope, and release checklist.

## Feedback and contributions

Bug reports, questions, and contributions are welcome through
[GitHub issues](https://github.com/slash-atlas/atlas/issues) and pull requests.
For a bug, include what you tried, what happened, and how to reproduce it. Remove
credentials and private conversation content from logs and screenshots.

For code changes, see the [checks in the development guide](docs/development.md#checks).
Contributions are provided under the same license as this repository.

## License

Atlas is open source under the [MIT License](LICENSE). You can use, modify,
redistribute, and use it commercially, subject to the license's copyright and
permission notice requirements. Third-party components remain under their
respective licenses.
