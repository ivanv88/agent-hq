# LACC — Technical Spec (Final)
> Local Agent Command Center — MVP Build Spec

---

## Architecture Overview

```
lacc/
├── packages/
│   ├── orchestrator/   # Fastify daemon — API + serves UI static files
│   ├── ui/             # React/TS browser app (Vite, built to orchestrator/public)
│   └── shared/         # Zod schemas + TypeScript types (no logic)
└── docker/
    └── agent-base/     # Extends Anthropic's official Claude Code devcontainer
```

- UI lives at `http://localhost:7842` — no Electron, no Tauri, just a browser tab
- Orchestrator is the single source of truth. UI is a pure client.
- All persistent state in SQLite at `~/.lacc-data/lacc.db`
- All config at `~/.lacc-data/config.json`

---

## Core Decisions (locked)

| Decision | Choice |
|---|---|
| Container base | Anthropic's official Claude Code devcontainer |
| devcontainer.json support | Image/Dockerfile only — skip Docker Compose devcontainers in MVP |
| Feedback mechanism | Kill + restart with context (Option C) |
| PR flow | Generate branch name + copyable PR draft only. No GitHub CLI. |
| Log replay | Last 200 lines from archive. No pagination. |
| Rate limit (429) | Flip to RATE_LIMITED status, show in UI, manual resume |
| Multi-repo | Tab bar at top of task list per repo |
| Local UI security | Deferred post-MVP |
| Dev server modes | `port` (default) / `proxy` (Caddy + hostname) / `none` |
| Port forwarding | Read from repo's `devcontainer.json` if present, else use `devPortRangeStart` |

---

## Key Data Types (`packages/shared`)

```typescript
type TaskStatus =
  'POOLED' | 'SPAWNING' | 'WORKING' | 'AWAITING_REVIEW' |
  'SPINNING' | 'RATE_LIMITED' | 'FAILED' | 'DONE' | 'KILLED'

type OversightMode = 'NOTIFY_ONLY' | 'GATE_ON_COMPLETION' | 'GATE_ALWAYS'
type TaskType = 'feat' | 'fix' | 'chore' | 'refactor' | 'test'
type DevServerMode = 'port' | 'proxy' | 'none'

interface Task {
  id: string
  prompt: string
  status: TaskStatus
  oversightMode: OversightMode
  taskType: TaskType
  worktreePath: string
  containerId: string
  branchName: string
  ticketId?: string
  repoPath: string
  startedAt: Date
  endedAt?: Date
  costUsd: number
  inputTokens: number
  outputTokens: number
  contextTokensUsed?: number       // parsed from stream-json if available
  lastFileChanged?: string
  devPort?: number
  devServerMode: DevServerMode
  devServerUrl?: string
  retryCount: number
  maxRetries: number
  agentName?: string
  model: string                    // e.g. claude-sonnet-4-5, gpt-oss:32k
  rateLimitRetryAfter?: number     // epoch ms when rate limit clears
}

interface WsEvent {
  type:
    | 'TASK_CREATED' | 'TASK_UPDATED' | 'TASK_REMOVED'
    | 'COST_UPDATED' | 'POOL_UPDATED' | 'NOTIFICATION'
  payload: Task | PoolStatus | Notification
}

interface PoolStatus {
  ready: number
  warming: number
  target: number
}

interface SpawnTaskInput {
  prompt: string
  repoPath: string
  oversightMode: OversightMode
  taskType: TaskType
  ticketId?: string
  branchName?: string
  maxRetries: number
  baseBranch?: string
  agentName?: string
  skillNames?: string[]
  model?: string
  anthropicBaseUrl?: string
  planFirst?: boolean
  extraFlags?: string[]
}
```

---

## SQLite Schema

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SPAWNING',
  oversight_mode TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'feat',
  worktree_path TEXT NOT NULL,
  container_id TEXT,
  branch_name TEXT NOT NULL,
  ticket_id TEXT,
  repo_path TEXT NOT NULL,
  dev_port INTEGER,
  dev_server_mode TEXT NOT NULL DEFAULT 'port',
  dev_server_url TEXT,
  agent_name TEXT,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  cost_usd REAL DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  context_tokens_used INTEGER,
  last_file_changed TEXT,
  max_retries INTEGER DEFAULT 3,
  retry_count INTEGER DEFAULT 0,
  rate_limit_retry_after INTEGER
);

CREATE TABLE pool (
  id TEXT PRIMARY KEY,
  container_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'WARMING',  -- WARMING | READY
  dev_port INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE prompts (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  use_count INTEGER DEFAULT 1,
  starred INTEGER DEFAULT 0
);

CREATE TABLE meta_messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,  -- user | assistant
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE log_archive (
  task_id TEXT NOT NULL,
  chunk TEXT NOT NULL,
  ts INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_repo ON tasks(repo_path);
CREATE INDEX idx_log_archive_task ON log_archive(task_id);
CREATE INDEX idx_prompts_used_at ON prompts(used_at DESC);
```

---

## Config

### Global (`~/.lacc-data/config.json`)

```json
{
  "editorCommand": "cursor",
  "worktreePath": "~/.lacc-data/worktrees",
  "poolSize": 2,
  "defaultModel": "claude-sonnet-4-5",
  "agentExtraFlags": [],
  "inputCostPer1M": 3.00,
  "outputCostPer1M": 15.00,
  "costAlertThreshold": 5.00,
  "spinDetectionWindowMin": 5,
  "worktreeAutoDeleteHours": 24,
  "branchTemplate": "{type}/{ticket}-{slug}-{date}",
  "devPortRangeStart": 4000
}
```

### Per-repo (`<repo>/.lacc`, gitignored)

```json
{
  "defaultModel": "claude-opus-4-5",
  "extraFlags": [],
  "maxRetries": 5,
  "baseBranch": "develop",
  "branchTemplate": "feature/{ticket}-{slug}",
  "devServer": {
    "mode": "proxy",
    "hostname": "my-domain.ai.local",
    "port": 8127,
    "tls": {
      "certScript": "./create.sh",
      "cnfTemplate": "./req.cnf"
    }
  }
}
```

---

## API Surface

```
# Tasks
POST   /tasks                    Spawn task
GET    /tasks                    List all tasks
GET    /tasks/:id                Single task
DELETE /tasks/:id                Kill + cleanup

POST   /tasks/:id/pause          SIGSTOP
POST   /tasks/:id/resume         SIGCONT (also used to resume from RATE_LIMITED)
POST   /tasks/:id/restart        Kill + re-spawn with same prompt
POST   /tasks/:id/feedback       Kill + re-spawn with original prompt + progress + feedback

# Review
GET    /tasks/:id/diff           Structured git diff
POST   /tasks/:id/approve        Generate PR draft, flag worktree for cleanup
POST   /tasks/:id/reject         Kill + queue cleanup

# Streaming
GET    /tasks/:id/logs           SSE — live stdout/stderr (or last 200 lines if ended)
WS     /events                   All state changes pushed to UI

# Pool
GET    /pool                     Pool status
POST   /pool/refill              Manual top-up

# Config
GET    /config                   Global config
PATCH  /config                   Update global config
GET    /config/repo?path=        Per-repo .lacc config
GET    /config/skills            List ~/.claude/skills/
GET    /config/agents            List ~/.claude/agents/

# Meta-Claude
POST   /meta                     Chat turn with meta-Claude
GET    /meta/history             Conversation history
DELETE /meta/history             Clear history

# Misc
GET    /prompts                  Prompt history (paginated)
GET    /session/cost             Session aggregate cost
GET    /health                   Ping + pool status
```

---

## Task State Machine

```
POOLED ──→ SPAWNING ──→ WORKING ──→ AWAITING_REVIEW ──→ DONE
                              ↘ SPINNING
                              ↘ RATE_LIMITED
                              ↘ FAILED
               (any state) ──→ KILLED
```

---
---

# BUILD STAGES

Each stage is a self-contained Claude Code handoff.
Complete and verify each before starting the next.
Stages 1–5 are backend only. Stages 6–9 are frontend only.

---

## Stage 1 — Foundation

**Deliverable:** Monorepo scaffold, shared types, SQLite layer, config loading, orchestrator skeleton accepting connections.

### 1.1 Monorepo setup
```
lacc/
├── package.json              # npm workspaces
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   └── src/
│   │       ├── types.ts      # All types from spec
│   │       └── schemas.ts    # Zod schemas for all API inputs
│   ├── orchestrator/
│   │   ├── package.json
│   │   └── src/
│   │       └── index.ts      # Entry point
│   └── ui/
│       ├── package.json      # Vite + React
│       └── src/
└── docker/
    └── agent-base/
        └── Dockerfile
```

**Dependencies:**
- `shared`: `zod`, `typescript`
- `orchestrator`: `fastify`, `@fastify/static`, `@fastify/websocket`, `better-sqlite3`, `zod`, `typescript`, `tsx`
- `ui`: `react`, `react-dom`, `vite`, `tailwindcss`, `typescript`

### 1.2 SQLite layer
- `db/init.ts` — run all CREATE TABLE + CREATE INDEX on startup, idempotent
- `db/tasks.ts` — typed CRUD: `insertTask`, `updateTask`, `getTask`, `listTasks`, `listTasksByRepo`
- `db/pool.ts` — `insertPooled`, `claimOne`, `getReady`, `removePooled`
- `db/prompts.ts` — `insertPrompt`, `listPrompts`, `incrementUseCount`
- `db/logs.ts` — `appendChunks`, `getLastNChunks(taskId, n=200)`
- `db/meta.ts` — `insertMessage`, `listMessages`, `clearMessages`

### 1.3 Config loader
- `config/global.ts` — read/write `~/.lacc-data/config.json`, merge with defaults
- `config/repo.ts` — read `<repoPath>/.lacc`, return merged config

### 1.4 Orchestrator skeleton
- Fastify instance on port 7842
- `GET /health` → `{ status: 'ok', pool: { ready: 0, warming: 0 } }`
- WebSocket on `/events` — event emitter wired up, no events yet
- Static file serving from `orchestrator/public` (empty dir for now)
- Graceful shutdown handler

**Verify:** `curl localhost:7842/health` returns 200. WebSocket connects without error.

---

## Stage 2 — Container Infrastructure

**Deliverable:** Full container lifecycle manager. Pool warms on startup. Containers can be created, claimed, and killed. Git worktrees can be created and cleaned up. SSH mounted. devcontainer.json read from repo.

### 2.1 Agent base image
```dockerfile
# docker/agent-base/Dockerfile
FROM ghcr.io/anthropics/claude-code-devcontainer:latest

RUN npm install -g tsx prettier

# Named volume target for node_modules (perf on macOS)
RUN mkdir -p /workspace/node_modules

WORKDIR /workspace
```

Build script: `npm run docker:build` → `docker build -t lacc-agent-base ./docker/agent-base`

### 2.2 devcontainer.json reader
`containers/devcontainer.ts`

```typescript
interface DevcontainerConfig {
  image?: string
  build?: { dockerfile: string; context?: string }
  forwardPorts?: number[]
  postCreateCommand?: string | string[]
  containerEnv?: Record<string, string>
}

async function readDevcontainerConfig(repoPath: string): Promise<DevcontainerConfig | null>
// Looks for: .devcontainer/devcontainer.json, then .devcontainer.json
// Returns null if not found
// Skips if dockerComposeFile is present (not supported in MVP — logs warning)
```

### 2.3 Image resolver
`containers/image.ts`

```typescript
async function resolveImage(repoPath: string): Promise<string>
// Priority:
// 1. .devcontainer/devcontainer.json → image field → pull if not local
// 2. .devcontainer/devcontainer.json → build.dockerfile → docker build, cache by hash
// 3. lacc-agent-base:latest (fallback)
```

### 2.4 Port assignment
`containers/ports.ts`
- In-memory set of used ports (rebuilt from SQLite on startup)
- `assignPort(): number` — next available from `devPortRangeStart`
- `releasePort(port: number): void`
- On spawn: if `devcontainer.forwardPorts[0]` exists, map that; else assign from pool

### 2.5 Container lifecycle manager
`containers/lifecycle.ts`

```typescript
class ContainerLifecycleManager {
  // Pool
  async maintain(targetSize: number): Promise<void>
  async warmOne(): Promise<void>
  // docker create → docker start → health check (claude --version)
  // pool table: WARMING → READY

  async claim(): Promise<{ containerId: string; port: number } | null>
  // Claims READY from pool, triggers maintain() in background

  async adoptExisting(): Promise<void>
  // On restart: inspect known pool containers, re-adopt healthy ones

  // Task containers
  async configure(containerId: string, task: Task, worktreePath: string): Promise<void>
  // Set env vars, mount worktree, ~/.claude/, ~/.ssh/, apply port bindings

  async runPostCreate(containerId: string, cmd: string | string[]): Promise<void>
  // docker exec the postCreateCommand from devcontainer.json

  async startClaude(containerId: string, task: Task): Promise<void>
  // docker exec: claude --output-format stream-json [--permission-mode plan] [...flags]

  async pause(containerId: string): Promise<void>
  async resume(containerId: string): Promise<void>

  async kill(containerId: string, gracePeriodMs = 30_000): Promise<void>
  // SIGTERM → wait → docker rm -f

  async killImmediate(containerId: string): Promise<void>
  // docker rm -f, no wait
}
```

**Container mounts (always applied):**
```typescript
Binds: [
  `${worktreePath}:/workspace`,
  `${home}/.claude:/root/.claude:ro`,
  `${home}/.ssh:/root/.ssh:ro`,
]
```

**Container env (always applied):**
```typescript
Env: [
  `ANTHROPIC_API_KEY=${apiKey}`,
  `ANTHROPIC_BASE_URL=${task.anthropicBaseUrl ?? ''}`,
  `TASK_PROMPT=${task.prompt}`,
  `TASK_ID=${task.id}`,
  `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0`,   // auto memory on
  `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`,  // load CLAUDE.md from --add-dir
]
```

**Claude invocation:**
```bash
claude \
  --output-format stream-json \
  --dangerously-skip-permissions \
  --model ${task.model} \
  --add-dir ${originalRepoPath} \          # loads CLAUDE.md hierarchy from real repo
  [--permission-mode plan]                 # if task.planFirst = true
  [--session-name ${task.branchName}]      # for /resume to work sensibly
  [--agent ${task.agentName}]              # if specified
  "${task.prompt}"
```

### 2.6 Git manager
`git/worktree.ts`

```typescript
async function createWorktree(repoPath: string, taskId: string, branchName: string, baseBranch: string): Promise<string>
// git worktree add ~/.lacc-data/worktrees/<repoSlug>/<taskId> -b <branchName> <baseBranch>
// Returns worktreePath

async function getDiff(worktreePath: string): Promise<DiffResult>
// simple-git diff --stat + diff content, structured

async function cleanupWorktree(worktreePath: string, branchName: string): Promise<void>
// git worktree remove --force <path>
// git branch -D <branchName>

async function generateBranchName(template: string, opts: BranchNameOpts): Promise<string>
```

### 2.7 Cleanup worker
`workers/cleanup.ts` — runs every 5 minutes:
- Tasks in KILLED/DONE with container_id still set → `docker rm -f`
- Containers running with no task or pool record → `docker rm -f` (orphans)
- Worktrees past `worktreeAutoDeleteHours` → `rm -rf` + `cleanupWorktree()`
- Proxy mode: stale Caddy entries with no matching active task → remove + reload

### 2.8 Restart recovery
Runs in `orchestrator/src/index.ts` before registering routes:
```
1. adoptExisting()
2. For each non-terminal task in SQLite:
   a. docker inspect containerId
   b. Running → re-attach log stream, resume monitoring
   c. Gone → mark FAILED ("container lost on restart")
3. Kill orphaned containers
4. maintain(config.poolSize)
```

**Verify:** Start orchestrator. Check `GET /pool` shows warming/ready counts. Kill orchestrator and restart — pool re-adopted, no orphan containers.

---

## Stage 3 — Task Execution

**Deliverable:** Full spawn flow end-to-end. SSE log streaming. Cost parsing. Spin detection. Rate limit handling. Task state transitions pushed via WebSocket.

### 3.1 Branch name generator
`git/branch.ts`
- Template: `{type}/{ticket}-{slug}-{date}`
- `{slug}` = first 5 words of prompt, lowercased, hyphenated
- `{date}` = `MMDD`
- `{ticket}` omitted if blank

### 3.2 Spawn endpoint
`routes/tasks.ts` — `POST /tasks`

```
1. Validate input (zod SpawnTaskInput)
2. Read per-repo .lacc config
3. Read devcontainer.json → resolve image, forwardPorts, postCreateCommand
4. Assign dev port (devcontainer.forwardPorts[0] or pool)
5. Generate branch name
6. claim() from pool OR cold-start
7. createWorktree()
8. configure() container (mounts, env, ports)
9. runPostCreate() if devcontainer.postCreateCommand exists
10. startClaude()
11. Insert task to SQLite (status: WORKING)
12. Start log pipe → SSE buffer → log_archive
13. Start cost parser
14. Start chokidar watcher on worktreePath
15. Push TASK_CREATED via WS
16. maintain() pool in background
17. Return { taskId }
```

### 3.3 Log streaming
`streaming/logs.ts`
- `dockerode` attach to container stdout/stderr
- Pipe raw chunks to:
  - In-memory ring buffer per task (last 500 lines for live SSE)
  - `db/logs.appendChunks()` for archival
- `GET /tasks/:id/logs` SSE:
  - If task is active → stream from ring buffer, keep connection open
  - If task is ended → flush last 200 lines from `db/logs.getLastNChunks()`, close

### 3.4 Cost parser
`streaming/cost.ts`
- Parse `stream-json` events for `type: "usage"` blocks
- Extract `input_tokens`, `output_tokens`, `context_tokens_used`
- Batch update SQLite every 10s
- Push `COST_UPDATED` WS event
- If `cost_usd > config.costAlertThreshold` → push `NOTIFICATION` WS event

### 3.5 Spin detection
`workers/spin.ts` — chokidar + 60s interval per active task:
```
IF no file mtime change in worktree for > spinWindowMin  → status: SPINNING
IF same filepath in last 10 changes AND no test run detected → status: SPINNING
```
Spin → push `TASK_UPDATED` WS event.

### 3.6 Rate limit handler
`streaming/ratelimit.ts`
- Watch stderr for `429` signals or Anthropic rate limit messages
- On detect:
  - SIGSTOP container
  - Parse `retry-after` header if available → store as `rateLimitRetryAfter`
  - Set status: `RATE_LIMITED`
  - Push `TASK_UPDATED` WS event
- `POST /tasks/:id/resume` → SIGCONT, clear `rateLimitRetryAfter`, set status: `WORKING`

### 3.7 Completion detection
- Watch stream-json for `type: "result"` event
- If `oversightMode = GATE_ON_COMPLETION` or `GATE_ALWAYS` → status: `AWAITING_REVIEW`
- If `oversightMode = NOTIFY_ONLY` → status: `DONE`, push OS notification
- On non-zero exit / repeated failures → status: `FAILED`
- On `AWAITING_REVIEW` → push `TASK_UPDATED` WS event + OS Web Notification

### 3.8 Remaining task endpoints
- `DELETE /tasks/:id` → `kill()`, status: KILLED, push WS
- `POST /tasks/:id/pause` → SIGSTOP, status: PAUSED, push WS
- `POST /tasks/:id/resume` → SIGCONT, status: WORKING, push WS
- `POST /tasks/:id/restart` → `kill()` + re-spawn with same prompt
- `POST /tasks/:id/feedback` → `kill()` + re-spawn with compound prompt:
  ```
  Original task: ${task.prompt}

  Progress so far (summary):
  ${last 50 lines of log}

  User feedback:
  ${feedbackText}

  Continue from where you left off, incorporating the feedback above.
  ```

**Verify:** Spawn a real task against a test repo. See logs stream in SSE. See cost update. See status flip to AWAITING_REVIEW on completion.

---

## Stage 4 — Review Flow

**Deliverable:** Diff endpoint, approve (PR draft), reject, feedback/restart, memory save.

### 4.1 Diff endpoint
`routes/review.ts` — `GET /tasks/:id/diff`

```typescript
interface DiffResult {
  stats: { filesChanged: number; insertions: number; deletions: number }
  files: Array<{
    path: string
    status: 'added' | 'modified' | 'deleted' | 'renamed'
    insertions: number
    deletions: number
    patch: string   // unified diff
  }>
}
```
Uses `simple-git diff` on the worktree vs base branch.

### 4.2 Approve endpoint
`POST /tasks/:id/approve`
1. `killImmediate()` container
2. Generate PR draft:
   ```
   Call Anthropic API directly (claude-haiku-4-5, not a container):
   System: "Generate a concise PR title and description."
   User: "Branch: {branchName}\n\nDiff:\n{diff stats + first 100 lines of patch}\n\nLog summary:\n{last 30 log lines}"
   ```
3. Store PR draft in task record (add `pr_title TEXT, pr_body TEXT` columns)
4. Set status: DONE
5. Flag worktree for auto-delete
6. Push TASK_UPDATED

### 4.3 Reject endpoint
`POST /tasks/:id/reject`
1. `kill()` with grace period
2. Status: KILLED
3. Flag worktree for auto-delete
4. Push TASK_UPDATED

### 4.4 Memory save endpoint
`POST /tasks/:id/memory`
```typescript
interface SaveMemoryInput {
  text: string
  target: 'auto' | 'project'
  // auto   → append to ~/.claude/projects/<project>/memory/lacc-notes.md
  // project → append to <worktreePath>/CLAUDE.md
}
```

**Verify:** Complete a task, call `/diff`, call `/approve`, see PR draft returned. Call memory endpoint, verify file written.

---

## Stage 5 — Dev Server Profiles

**Deliverable:** All three dev server modes working. Caddy managed by orchestrator for proxy mode.

### 5.1 Port mode (default)
Already handled in Stage 3 port assignment. No additional work.
Preview URL: `http://localhost:{devPort}`

### 5.2 Proxy mode
`devserver/proxy.ts`

**Prerequisites (one-time, handled by `npm run setup`):**
- `brew install caddy`
- Install `/usr/local/bin/lacc-hosts-helper` sudo wrapper
- Generate wildcard cert for `*.{hostname}`, trust in OS keychain

**On agent spawn (proxy mode):**
```typescript
async function setupProxy(task: Task, repoConfig: RepoConfig): Promise<string> {
  const subdomain = `agent-${task.id}.${repoConfig.devServer.hostname}`
  // 1. Add to /etc/hosts via lacc-hosts-helper
  // 2. Generate cert: AGENT_HOST={subdomain} bash {certScript}
  //    → cert at ~/.lacc-data/certs/{taskId}/certificate.pem + private.key
  // 3. Append Caddy block to ~/.lacc-data/Caddyfile
  // 4. caddy reload --config ~/.lacc-data/Caddyfile
  return `https://${subdomain}`
}
```

**Caddyfile template:**
```
{
  admin localhost:2019
}

# Entries managed dynamically
agent-t1.my-domain.ai.local {
  tls ~/.lacc-data/certs/t1/certificate.pem ~/.lacc-data/certs/t1/private.key
  reverse_proxy localhost:4000
}
```

**On agent kill (proxy mode):**
```typescript
async function teardownProxy(task: Task): Promise<void>
// Remove /etc/hosts entry, delete certs, remove Caddy block, caddy reload
```

**Failure handling:** If Caddy reload fails → log error, surface NOTIFICATION in UI, keep task running. Proxy is optional for the agent itself.

### 5.3 None mode
No port assigned. `devServerUrl` = null. Preview tab hidden.

### 5.4 Dev server detection
Passive: watch agent log stream for `localhost:` or `0.0.0.0:` + port pattern.
When detected → update `devServerUrl` if not already set, push TASK_UPDATED.
The Preview tab appears automatically once a URL is detected.

**Verify:** Spawn agent in port mode, see devServerUrl populated. Open preview. Proxy mode: verify Caddy entry written, /etc/hosts updated, https URL resolves.

---

## Stage 6 — UI Shell + Core

**Deliverable:** Browser app connecting to orchestrator. Task list rendering live state. Terminal log view working.

### 6.1 Vite + React setup
- Tailwind configured
- `useWebSocket` hook — connects to `ws://localhost:7842/events`, auto-reconnects
- `useTasks` hook — initial `GET /tasks` fetch + WS updates merged into state
- `usePool` hook — `GET /pool` + WS POOL_UPDATED

### 6.2 Three-pane layout
```
┌──────────────────────────────────────────────────────────────┐
│  TopBar: LACC logo · session cost · pool indicator · [N] New  │
├─────────────────┬────────────────────────────────────────────┤
│                 │                                            │
│  TaskList       │  DetailPanel                               │
│  (left pane)    │  (right pane)                              │
│                 │                                            │
├─────────────────┴────────────────────────────────────────────┤
│  NotificationStrip                                           │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 TopBar
- Left: LACC wordmark
- Center: Session cost (`$12.40`) · Pool status dot (`● 2 ready`)
- Right: `[N] New` button

### 6.4 TaskList (left pane)
- Repo tabs at top if tasks span multiple repos
- Filter row: All · Active · Review · Done
- Task rows (compact, inbox-style):
  ```
  ● branchName          WORKING    00:12:04
    last file changed              $0.84
  ```
- Status indicators:
  - `●` pulsing green = WORKING
  - `⚠` yellow = AWAITING_REVIEW
  - `~` orange = SPINNING
  - `⏸` blue = PAUSED
  - `⛔` red = RATE_LIMITED
  - `✓` dim = DONE
  - `✗` dim red = FAILED/KILLED
- Click row → DetailPanel updates (no navigation)
- Selected row highlighted

### 6.5 DetailPanel (right pane)
Tab bar: `[Terminal]  [Diff]  [Preview]`

**Terminal tab** (always available):
- xterm.js instance
- SSE connection to `GET /tasks/:id/logs`
- Auto-scrolls to bottom
- If task ended: renders last 200 lines, shows "Task ended" banner
- Font: JetBrains Mono or IBM Plex Mono

**Diff tab** (visible when AWAITING_REVIEW or DONE):
- Fetch `GET /tasks/:id/diff` on tab open
- File list on left, patch on right
- Syntax-highlighted unified diff
- Stats bar: `4 files changed  +182 / -34`

**Preview tab** (visible when `devServerUrl` is set):
- `<iframe src={task.devServerUrl} />`
- "Open in new tab" button alongside tab label
- Hidden entirely if `devServerMode = 'none'` or no URL detected yet

### 6.6 Action bar (bottom of DetailPanel)
Shown when status = AWAITING_REVIEW:
```
[O] Open in editor    [A] Approve    [F] Feedback    [X] Reject
```

Shown for active tasks:
```
[O] Open in editor    [P] Pause    [R] Restart    [K] Kill
```

Shown when RATE_LIMITED:
```
⛔ Rate limited  ·  retry after: 01:24  ·  [Resume] [Kill]
```
Countdown timer if `rateLimitRetryAfter` is set.

### 6.7 Keyboard shortcuts
Global (when no modal open):

| Key | Action |
|---|---|
| `N` | Open new task modal |
| `Tab` / `Shift+Tab` | Cycle selected task |
| `1` `2` `3` | Switch detail tab (Terminal / Diff / Preview) |

Selected task:
| Key | Action |
|---|---|
| `A` | Approve |
| `X` | Reject |
| `F` | Open feedback modal |
| `O` | `editorCommand <worktreePath>` |
| `B` | Open devServerUrl in new tab |
| `K` | Kill |
| `P` | Pause / Resume |
| `R` | Restart |

**Verify:** Start orchestrator with pool warming. Open `http://localhost:7842`. See pool indicator. Spawn a task via API, see it appear in task list. See terminal stream. See status changes.

---

## Stage 7 — UI Features

**Deliverable:** New task modal, feedback modal, PR draft view, memory save modal, notification strip.

### 7.1 New task modal (`N`)

Fields:
| Field | UI | Notes |
|---|---|---|
| Prompt | `<textarea>` | Required. Searchable history dropdown (↑ key) |
| Ticket ID | `<input>` | Optional. `ENG-421` |
| Type | `<select>` | feat / fix / chore / refactor / test |
| Branch name | `<input>` | Auto-generated, editable |
| Oversight mode | `<radio>` | Notify Only / Gate on Completion / Gate Always |
| Plan first | `<toggle>` | Starts in `--permission-mode plan` |
| Model | `<select>` | Defaults from config. Free text option. |
| Agent | `<select>` | From `GET /config/agents`. Optional. |
| Skills | `<multiselect>` | From `GET /config/skills`. Optional. |
| Max retries | `<number>` | 1–20 |
| Base branch | `<input>` | Default: main/master |

Branch name auto-generates as user types prompt. Ticket ID field updates it.
Dev server mode shown read-only (derived from `.lacc` config for the selected repo).

Submit → `POST /tasks` → modal closes → task appears in list.

### 7.2 Feedback modal (`F`)
- `<textarea>` for feedback text
- Pre-header (read-only): "The agent will be restarted with your feedback appended to the original prompt."
- Submit → `POST /tasks/:id/feedback`

### 7.3 PR draft panel
Shown after approve. Slides in below action bar:
```
┌─────────────────────────────────────────────────────┐
│ ✓ Ready to push                                      │
│                                                      │
│ Branch: feat/ENG-421-auth-jwt-refresh-0302           │  [Copy]
│                                                      │
│ PR Title: Add JWT refresh token support              │  [Copy]
│                                                      │
│ PR Body:                                             │
│ ## What                                              │
│ Implements JWT refresh token flow...                 │  [Copy]
│                                                      │
│ git push origin feat/ENG-421-auth-jwt-refresh-0302   │  [Copy]
└─────────────────────────────────────────────────────┘
```

### 7.4 Memory save modal
Accessible from action bar button "Save to memory" (shown on AWAITING_REVIEW / DONE):
```
Save to memory

○ Agent memory    — personal notes, ~/.claude/projects/.../lacc-notes.md
● Project CLAUDE.md — shared conventions, applies to all future agents on this repo

[text area — editable, pre-filled from last agent output if parseable]

[Save]
```

Submit → `POST /tasks/:id/memory`

CLAUDE.md size warning: if project CLAUDE.md > 150 lines, show:
> ⚠ CLAUDE.md is getting long ({n} lines). Consider using imports or .claude/rules/ to split it.

### 7.5 Notification strip (bottom bar)
- Fixed height, single scrolling row
- Entries pushed by WS `NOTIFICATION` events and state transitions
- Format: `● Auth refactor complete · 4 files  ·  ~ E2E agent stuck · 5m ago`
- Click entry → selects that task in list
- Fades after 60s unless task needs attention

### 7.6 Settings modal (`Cmd+,`)
- Editor command (default: `cursor`)
- Pool size (default: 2)
- Default model
- Cost alert threshold
- Worktree auto-delete hours
- Branch template
- Dev port range start

**Verify:** Full spawn → work → review → approve flow works from UI. PR draft visible. Memory saves correctly to both targets.

---

## Stage 8 — Config & Meta-Claude

**Deliverable:** Config panel with skills/agents browser and meta-Claude workbench.

### 8.1 Config panel
Accessible via sidebar icon or `Cmd+Shift+C`. Replaces DetailPanel when open.

**Library tab:**

Two-column layout:
- Left: file tree of `~/.claude/skills/`, `~/.claude/agents/`
- Right: file content (read-only in MVP, editable in future)

Selecting a skill/agent shows its content. Close icon returns to task detail.

**Workbench tab:**

Chat interface against `POST /meta`:
```
┌─────────────────────────────────────────────────────┐
│ Meta-Claude                              [Clear ↺]  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  You: create a strict TS linter agent               │
│                                                      │
│  Claude: I'll create that. Writing to               │
│  ~/.claude/agents/ts-linter.md...                   │
│  Done. It's now available in the spawn modal.       │
│                                                      │
├─────────────────────────────────────────────────────┤
│  [                              ] [Send ↵]          │
└─────────────────────────────────────────────────────┘
```

`POST /meta` system prompt (orchestrator-side):
```
You are a Claude Code configuration assistant. You help the user create and 
manage Claude Code skills and agents stored in ~/.claude/. When you create 
or modify files, write them using the filesystem tools. Files must follow 
the Claude Code skill format (YAML frontmatter + markdown). Confirm what 
you wrote and where.
```

`GET /config/skills` + `GET /config/agents` refresh automatically after each meta turn
so new entries appear immediately in spawn modal dropdowns.

**Verify:** Ask meta-Claude to create a new skill. See file written to `~/.claude/skills/`. See it appear in spawn modal.

---

## Stage 9 — Hardening

**Deliverable:** Context window monitoring, rate limit UI polish, session naming, plan mode, ANTHROPIC_BASE_URL support. Everything needed to ship MVP.

### 9.1 Context window monitoring
- Parse `context_tokens_used` from stream-json usage events
- Store on task record
- Show in TaskList row as subtle progress bar (only when > 70% full)
- At 85% → push NOTIFICATION: "Agent t1 context window 85% full — consider restarting with summary"
- DetailPanel shows context usage next to cost: `$0.84 · 42k ctx`

### 9.2 Rate limit UI
- `RATE_LIMITED` status in task list with `⛔` icon
- Action bar shows countdown + manual Resume button
- Countdown reads from `rateLimitRetryAfter` field
- No auto-resume — user decides

### 9.3 Session naming
`--session-name ${task.branchName}` already in Claude invocation from Stage 2.
No UI work needed — this just makes `/resume` work correctly if user drops into container manually.

### 9.4 Plan mode
- Toggle in new task modal: "Plan first" (off by default)
- When on: `--permission-mode plan` added to claude invocation
- In task list, SPAWNING tasks show "📋 Planning..." subtitle until first file change detected
- No other UI changes needed — planning output streams normally to terminal tab

### 9.5 Model + base URL
- Model field in new task modal (select + free text)
- `ANTHROPIC_BASE_URL` in settings modal (global) + per task (advanced section of spawn form, collapsed by default)
- Both wired through to container env on spawn

### 9.6 npm run setup
Interactive first-run script:
```
1. Build lacc-agent-base Docker image
2. Initialise ~/.lacc-data/ directories
3. Prompt for ANTHROPIC_API_KEY → store in OS keychain via keytar
4. Check if Caddy installed (optional, for proxy mode)
5. Install lacc-hosts-helper if Caddy present
6. Write default ~/.lacc-data/config.json
7. Print: "Ready. Run npm start to launch LACC."
```

### 9.7 Final integration checklist
- [ ] Full spawn → work → review → approve flow
- [ ] Feedback → restart with context
- [ ] Reject → cleanup
- [ ] Pool warms on startup, refills after claims
- [ ] Orchestrator restart: tasks re-attached, orphans killed
- [ ] Rate limit: status flips, manual resume works
- [ ] Dev server detected in logs, preview tab appears
- [ ] Proxy mode: Caddy entry + /etc/hosts + cert (if configured)
- [ ] Memory save: both targets write correctly
- [ ] CLAUDE.md hierarchy loaded via --add-dir
- [ ] Auto memory shared across worktrees (native behaviour, no work needed)
- [ ] SSH mounted: agent can git push branch
- [ ] Context warning fires at 85%
- [ ] PR draft generated and displayed on approve
- [ ] Multi-repo: tabs appear when tasks span repos
- [ ] Meta-Claude: creates skill, appears in spawn modal
- [ ] Settings: all fields persist to config.json

---

## Dependencies Reference

### orchestrator
```json
{
  "dependencies": {
    "fastify": "^5",
    "@fastify/static": "^8",
    "@fastify/websocket": "^10",
    "dockerode": "^4",
    "simple-git": "^3",
    "better-sqlite3": "^9",
    "chokidar": "^4",
    "keytar": "^7",
    "zod": "^3",
    "@anthropic-ai/sdk": "^0.36"
  },
  "devDependencies": {
    "typescript": "^5",
    "tsx": "^4",
    "@types/node": "^22",
    "@types/better-sqlite3": "^7",
    "@types/dockerode": "^3"
  }
}
```

### ui
```json
{
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "xterm": "^5",
    "@xterm/addon-fit": "^0.10",
    "tailwindcss": "^4"
  },
  "devDependencies": {
    "vite": "^6",
    "typescript": "^5",
    "@types/react": "^19"
  }
}
```

---

## Dev Workflow

```bash
# Prerequisites
brew install docker node caddy   # caddy optional, for proxy mode only

# Clone + install
git clone https://github.com/you/lacc && cd lacc
npm install

# First run
npm run setup

# Dev (HMR + orchestrator)
npm run dev
# → orchestrator on :7842
# → Vite dev server proxied through orchestrator
# → open http://localhost:7842

# Production build
npm run build     # bundles UI into orchestrator/public
npm start         # single process, single port
```

---

## What's explicitly out of MVP scope

- GitHub CLI / auto-push / PR creation
- Docker Compose devcontainers
- Linear / Jira ticket auto-population
- Agent-to-agent communication
- LACC auto-update mechanism
- Local UI authentication
- Windows support
- Mobile monitoring view
