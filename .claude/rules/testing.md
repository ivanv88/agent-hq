# Testing Rules

After any code change, run the tests for the affected package and confirm they pass before finishing.

## Run commands

```bash
# Orchestrator (routes, db, workers, streaming)
cd packages/orchestrator && npx vitest run

# UI (feed parser, utilities)
cd packages/ui && npx vitest run
```

## What requires a test

| Change | Required test |
|--------|--------------|
| New Fastify route | `tests/api/` — success case + key error codes (404, 400, 409) |
| New db helper | `tests/unit/db/` — insert/retrieve/edge cases |
| New pure function (parser, util, git, workflow) | `tests/unit/` — happy path + edge cases |
| Modified existing logic | Update the existing test to match new behaviour |
| React component added/changed | No automated test — use manual verification plan |

## What does NOT need a test

- React component rendering or DOM output
- Functions that only delegate to already-tested code with no new logic
- Behaviour enforced by TypeScript types at compile time

## Conventions

- Tests live alongside the package they test: `packages/orchestrator/tests/`, `packages/ui/tests/`
- Use `vitest` — `describe` / `it` / `expect`. No Jest globals needed.
- For orchestrator API tests: spin up a real Fastify instance with `app.inject()` — do not mock the HTTP layer
- For orchestrator unit tests: use an in-memory SQLite DB (`:memory:`) — do not mock the database
- Mock only at external boundaries: Docker (`dockerode`), `child_process` (`spawn`), filesystem (`fs`) when unavoidable
