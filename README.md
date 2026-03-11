# LACC — Local Agent Command Center

Run Claude Code agents in isolated Docker containers and manage them from a web UI.

## Prerequisites

- **Docker** (running)
- **Node.js 20+**
- **Anthropic API key**
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
