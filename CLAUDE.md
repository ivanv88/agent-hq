# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AI Docs

`ai-docs/` contains specs, plans, and templates for AI agents. **Read files here only when directly relevant to the current task — do not load them upfront.**

- `local_agent_command_center_specs.md` — Full product spec
- `implementation_plan.md` — Staged implementation plan
- `build-checklist.md` — Per-stage verification checklist (✅/🔲/⚠️)
- `verification-plan.md` — Step-by-step plan to verify all ⚠️ checklist items
- `templates/` — Reusable prompt/task templates
- `style-guide.md` — Design tokens, typography, colors, spacing reference. Read when building or modifying UI.
- `ui-best-practices.md` — Detailed patterns and code examples for UI. Referenced by `.claude/rules/ui.md` (auto-loaded for `packages/ui/**`).

## Commands

```bash
# Install dependencies
npm install

# First-time setup (builds Docker image, creates ~/.lacc-data/, stores API key)
npm run setup

# Dev (Vite :5173 + orchestrator :7842 with hot reload)
npm run dev

# Production build + start
npm run build && npm start

# Build Docker base image (required before first run)
npm run docker:build

# Type-check without emitting
npx tsc --noEmit

# Build individual packages
npm run build --workspace=packages/ui
npm run build --workspace=packages/orchestrator
```

## Architecture

LACC is an npm workspaces monorepo with three packages:

- **`packages/shared`** — Zod schemas, TypeScript types (`Task`, `WsEvent`, `SpawnTaskInput`, etc.). Compiled as a project reference consumed by both orchestrator and UI.
- **`packages/orchestrator`** — Fastify server on port 7842. Manages Docker containers, runs Claude agents, persists state to SQLite.
- **`packages/ui`** — React 19 + Tailwind v4 SPA. In production, built into `packages/orchestrator/public/` and served statically. In dev, Vite proxies to `http://127.0.0.1:7842` (explicit IPv4).

### Orchestrator internals

The orchestrator is organized into:

- `src/db/` — SQLite access via `better-sqlite3`. DB lives at `~/.lacc-data/lacc.db`. Tables: `tasks`, `pool_containers`, `logs`, `prompts`, `meta_messages`.
- `src/config/` — Global config (`~/.lacc-data/config.json`) and per-repo `.lacc` file merging.
- `src/containers/` — Dockerode wrappers: `lifecycle.ts` (warm/claim/configure/start/kill), `ports.ts`, `devcontainer.ts`, `image.ts`.
- `src/routes/` — Fastify route handlers: `tasks.ts`, `review.ts`, `config.ts`, `meta.ts`, `pool.ts`.
- `src/streaming/` — Log capture, cost parsing, rate-limit detection, completion detection, dev-server URL detection.
- `src/workers/` — Background workers: `cleanup.ts` (worktree/container GC), `spin.ts` (loop detection).
- `src/git/` — Worktree creation, branch name generation.

### Container lifecycle

Pool containers are generic `lacc-agent-base:latest` containers running `sleep infinity`. On task spawn:
1. A READY pool container is claimed.
2. It is stopped, removed, and recreated with task-specific mounts (repo worktree + `--add-dir /original-repo`).
3. `postCreateCommand` runs.
4. `claude -p` starts and its exec stream is piped through `startLogPipe` → ring buffer (500 lines) + SQLite `logs` table.

Agent logs are delivered to the UI via SSE (`GET /tasks/:id/logs`). Real-time updates (task status, cost, pool changes) use WebSocket (`GET /events`).

### UI structure

`App.tsx` owns global state (selected task, modal, WS connection, session cost) and passes data down to:
- `TopBar` — pool status, session cost, keyboard shortcut hints
- `TaskList` — filterable list of tasks
- `DetailPanel` — logs (xterm), diff view, action buttons for the selected task
- `NotificationStrip` — ephemeral banners
- Modals: `NewTaskModal`, `FeedbackModal`, `MemoryModal`, `SettingsModal`

Custom hooks in `src/hooks/`: `useWebSocket`, `useTasks`, `usePool`, `useKeyboardShortcuts`.

### Key constraints

- All `claude` invocations require the `-p` flag for stream-json output to work.
- `tsconfig.base.json`: `module=NodeNext`, `moduleResolution=NodeNext`.
- `packages/ui/tsconfig.json` overrides to `module=ESNext`, `moduleResolution=bundler` (Vite).
- `packages/shared/tsconfig.json` must have `composite: true` for project references.
- Tailwind v4: `@tailwindcss/vite` plugin in `vite.config.ts` + `@import "tailwindcss"` in CSS (no postcss config).
- Docker binary at `/usr/local/bin/docker` (may not be in PATH for child processes).
- Data directory: `~/.lacc-data/` (DB, config, worktrees, certs).
