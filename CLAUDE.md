# Atlas: agent instructions

Read `docs/product.md` before product work. It is the only product plan.
Do not treat archived prompts, code, or old Git history as current requirements.
Do not import or reactivate `archive/` code without a deliberate scope decision.

Keep changes small. Reuse chat, reading, graph, search, auth, and storage foundations.
Use Google ADK in Python. Next.js only calls the backend API.
Before Next.js changes, read the relevant bundled guide in `node_modules/next/dist/docs/`.
Use the existing design tokens in `app/globals.css`. Keep the UI simple.
Use clear technical English and the ASD-STE100 writing rules for user-facing content.

Preserve ownership checks, source provenance, and database migration history.
Keep failures explicit. Never treat missing evidence as a successful result.
Check TypeScript and lint after code changes. Run backend checks for Python changes.
Verify features before marking them complete in the product plan.
