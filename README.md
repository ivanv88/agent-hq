# LACC — Local Agent Command Center

Run Claude Code agents in isolated Docker containers and manage them from a web UI.

Each task gets its own git worktree and container. Agents stream output in real time — text, tool calls, file changes, todos — into a live message feed. You review and approve before anything merges.

## Prerequisites

- **Docker daemon** — [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [Colima](https://github.com/abiosoft/colima) (running)
- **Node.js 20+**
- **Anthropic API key** or **Claude subscription** (Pro/Max) — one or the other is required for the Claude CLI
- **Caddy** (optional, for dev-server proxy mode)

## First-time setup

```bash
npm install
npm run setup      # builds Docker image, creates ~/.lacc-data/, stores API key
```

## Running

```bash
npm run dev        # Vite on :5173 + orchestrator on :7842 (with hot reload)
npm run build && npm start   # production, everything on :7842
```

Open `http://localhost:7842`.

## What you can do

- **Spawn tasks** — give the agent a prompt and a repo path; it runs in an isolated worktree
- **Live feed** — watch the agent's reasoning, tool calls, file changes, and todos stream in real time
- **Give feedback** — send mid-task messages or commands (`/pause`, `/kill`, `/restart`) without stopping the agent
- **Review & approve** — inspect the diff before any changes land; approve, reject, or request changes
- **Workflows** — chain multiple agent stages with automatic or manual gates between them, with checkpoints for rollback

## Workflows

A workflow is a YAML file that defines a sequence of stages. Each stage runs a Claude agent with its own prompt; stages can advance automatically or pause for manual review.

Place workflow definitions in `docs/` (or the `docsDir` configured for the repo).

```yaml
name: feature
stages:
  - id: plan
    prompt: "Read the codebase and write a plan to {{workspace}}/plan.md"
    gate: manual          # pauses for approval before continuing
  - id: implement
    prompt: "Implement the plan in {{workspace}}/plan.md"
    gate: auto
  - id: test
    prompt: "Write and run tests. Fix any failures."
    gate: manual
```

**Gate types:**
- `auto` — advances immediately when the stage completes
- `manual` — pauses and waits for you to click Continue (or `/continue` in the command box)

**Variables available in prompts:** `{{workspace}}`, `{{branch}}`, `{{docs_dir}}`

Checkpoints are saved at each gate so you can restore to any earlier stage.

## Per-repo configuration

### `.lacc` (LACC-specific settings)

Create a `.lacc` file in the repo root to override global defaults:

```json
{
  "oversightMode": "GATE_ON_COMPLETION",
  "devServerMode": "port",
  "devPort": 3000,
  "model": "claude-sonnet-4-6",
  "branchTemplate": "{type}/{ticket}-{slug}-{date}",
  "postCreateCommand": "npm install",
  "proxyHostname": "myapp.localhost"
}
```

All fields are optional. Global defaults live in `~/.lacc-data/config.json` and can be changed in the UI (Settings → Configuration).

### `.devcontainer.json` (container environment)

LACC reads the repo's devcontainer config to set up the agent container. Add a `.devcontainer.json` to the repo root (or `.devcontainer/devcontainer.json`) so the agent gets the right environment — correct Node/Python/etc version, dependencies installed, ports forwarded.

```json
{
  "image": "node:20",
  "postCreateCommand": "npm install",
  "forwardPorts": [3000],
  "remoteEnv": {
    "NODE_ENV": "development"
  }
}
```

If no devcontainer config is present, agents run in the generic `lacc-agent-base` image (Node 20 + Claude CLI + git). This works for many projects but won't have project-specific tooling.

Supported fields: `image`, `build`, `forwardPorts`, `postCreateCommand`, `remoteEnv`, `mounts`.
Not supported: `dockerComposeFile`.

See the [devcontainer spec](https://containers.dev/implementors/json_reference/) for full field documentation.

## Global configuration

| Setting | Default | Description |
|---|---|---|
| `poolSize` | `2` | Number of warm containers kept ready |
| `costAlertThreshold` | `1.0` | USD cost at which the UI warns |
| `spinDetectionWindowMin` | `5` | Minutes before a looping agent is flagged |
| `worktreeAutoDeleteHours` | `24` | Hours before completed worktrees are cleaned up |
| `defaultModel` | `claude-sonnet-4-6` | Model used when not overridden per-repo |
| `defaultOversightMode` | `GATE_ON_COMPLETION` | See oversight modes below |
| `editorCommand` | `code` | Command to open files in your editor |

## Oversight modes

| Mode | Behaviour |
|---|---|
| `GATE_ON_COMPLETION` | Agent runs freely, pauses for review when done |
| `GATE_ALWAYS` | Agent pauses for approval before every tool call |
| `NOTIFY_ONLY` | Agent runs fully autonomously, notifies on completion |

## Development

### Package structure

```
packages/
  shared/       # Zod schemas + TypeScript types shared by both packages
  orchestrator/ # Fastify server on :7842 — Docker, SQLite, SSE, WebSocket
  ui/           # React 19 + Tailwind v4 SPA
```

### Testing

```bash
cd packages/orchestrator && npx vitest run   # API + unit tests
cd packages/ui && npx vitest run             # feed parser + utility tests
```

### Type-check

```bash
npx tsc --noEmit
```
