# Graph extraction incident: Vertex rejects the response schema

Production revision `atlas-api-00007-rqg` failed extraction with a Vertex
`400 INVALID_ARGUMENT`. The traceback originally supplied stopped before the
final exception. The provider rejected the request before any graph update.

A minimal synthetic call reproduced the rejection with the original Pydantic
response schema. Removing nested `minItems` / `maxItems` from the provider schema
made the request succeed. Google's [structured output documentation](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output)
describes this failure mode for complex schemas and array length constraints.

The extractor now sends the same JSON structure with array limits expressed as
descriptions. `Extraction.model_validate_json` still enforces the original
lengths, required evidence, and field constraints before applying anything.
Exact excerpt matching and ownership checks remain enforced during persistence.
SDK automatic continuation is disabled for this extraction call so it cannot
silently add provider calls outside the usage reservation.

Validation: the original synthetic request returned 400; the fixed production
schema and prompt returned one concept, passed strict Pydantic validation, and
had exact evidence in the supplied synthetic explanation. Focused offline tests
cover request configuration, successful graph persistence, and rejection of
oversized concept lists and empty evidence.

Migration `a020_retry_failed_extraction` refreshes the retry allowance only for
completed answers whose enrichment failed. It does not schedule work or alter
saved concepts. The user can select Retry after deployment, including for a turn
that exhausted all three previous attempts. Versioned enrichment task names
avoid Cloud Tasks deduplication of the refreshed attempts.

The main branch GitHub Actions deployment runs `deploy/cloud-run.sh`, which
invokes `deploy/runtime_config.py` to bootstrap migrations before deploying the API.
CI also upgrades a fresh Postgres database twice and checks Alembic drift.
Merging this PR therefore applies the repair migration through the existing
deployment workflow; no manual production SQL is needed.
