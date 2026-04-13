# LACC — Implementation Plan

> Based on `local_agent_command_center_specs.md` (Final)
> All spec stages are preserved verbatim. Issues are reported only — no spec changes made.

---

## Part 1 — Approach Validation

**Verdict: Sound architecture with fixable structural problems before coding begins.**

### What is well-designed
- SQLite for a local tool: no extra process, trivial backup, fits perfectly
- Dockerode for container orchestration: standard, well-understood
- Git worktrees for parallel agent isolation: exactly the right primitive
- WebSocket for discrete events + SSE for log streams: correct separation
- Vite output into `orchestrator/public`, single port 7842: clean
- Pre-warmed container pool: right solution for Docker-on-macOS startup latency

### Critical architectural issues to decide before coding

**A. `-p` flag omission (load-bearing).** The `claude` invocation in the spec does not include `--print` (`-p`). Without it, claude starts an interactive REPL: no `stream-json` events, no `type: "result"` exit signal, no exit. Cost parsing, completion detection, and the entire task lifecycle depend on `-p`. **Must add.**

**B. Container reconfigure after pool claim is impossible.** Spec steps 6–8 in the spawn flow (claim → configure mounts/env) cannot work — Docker does not allow changing volume mounts or env on an existing container. Pool containers cannot carry task-specific mounts. Resolution required before Stage 2 starts.

**C. Base image does not exist.** `ghcr.io/anthropics/claude-code-devcontainer:latest` is not a published image. Anthropic publishes a devcontainer *feature*, not a pre-built image. The Dockerfile will fail immediately. Must decide alternative base before Stage 2.

**D. Rate limit via SIGSTOP is semantically wrong.** A 429-blocked process is already frozen (waiting on HTTP). SIGSTOPping it changes nothing. On SIGCONT, claude retries immediately, ignoring the retry-after window. The spec stores `rateLimitRetryAfter` but provides no enforcement. This remains as a known limitation unless spec is updated.

**E. Meta-Claude "filesystem tools" are not configured.** A plain Anthropic API call with a system prompt saying "use filesystem tools" produces text, not file writes. The meta endpoint needs a real tool-use setup (custom tools or a claude subprocess) to actually write files.

---

## Part 2 — Issues Found (preserved, not fixed)

Issues are grouped by severity. **The spec is not altered** — these are flagged for user decision.

### Critical — Will not work as specified

| # | Issue |
|---|---|
| 1 | **Missing `-p` flag** on claude invocation. Without `--print`, no stream-json output and process never exits. |
| 2 | **Base image `ghcr.io/anthropics/claude-code-devcontainer:latest` does not exist.** Will fail on `docker build`. |
| 3 | **Container reconfiguration after pool claim is impossible.** Volume mounts and env vars cannot be changed on an existing Docker container. |
| 4 | **`PAUSED` status missing from `TaskStatus` type.** Stage 3.8 sets status `PAUSED` but the type union and state machine diagram don't include it. UI icon `⏸ blue = PAUSED` is also defined — consistent only if type is fixed. |
| 5 | **`--session-name` flag does not exist in the claude CLI.** Stage 2.5 uses it. Will be rejected as unknown flag. |
| 6 | **SIGSTOP on a rate-limited process is semantically wrong.** See Architectural Issues D above. |
| 7 | **`--add-dir ${originalRepoPath}` uses a host path.** Inside the container, the host path doesn't exist — only `/workspace` is mounted. CLAUDE.md loading silently fails. |
| 8 | **Meta-Claude "filesystem tools" are not configured.** Plain API call cannot write files. |

### Schema / Type Inconsistencies

| # | Issue |
|---|---|
| 9 | `pr_title` and `pr_body` added in Stage 4.2 but absent from the initial SQLite schema. Needs migration. |
| 10 | `Task.containerId` is `string` (required) but POOLED tasks have no container yet. Should be `containerId?: string`. |
| 11 | `Task.startedAt: Date` vs SQLite `started_at INTEGER` — conversion must be implemented explicitly. |
| 12 | `devServerMode` is on `Task` but not in `SpawnTaskInput` — derivation from `.lacc` config is implicit, never documented in the spawn flow. |
| 13 | `Notification` interface referenced in `WsEvent` but never defined in the shared types. |
| 14 | Default model `claude-sonnet-4-5` may be stale as of 2026. |
| 15 | Pool table `dev_port INTEGER NOT NULL` — pool containers have no port at creation time; conflicts with generic pool model. |
| 16 | No `devServerMode` override field in `SpawnTaskInput` (may be intentional — mode is per-repo). |

### API / Endpoint Gaps

| # | Issue |
|---|---|
| 17 | `POST /tasks/:id/feedback` request body shape never defined. `${feedbackText}` appears in template but no JSON schema. |
| 18 | `POST /tasks/:id/approve` body not defined (likely no-body, but not stated). |
| 19 | `POST /tasks/:id/reject` body not defined. |
| 20 | `GET /prompts` says "(paginated)" but `listPrompts` has no limit/offset defined. Inconsistent with "no pagination" on logs. |
| 21 | No `POST /prompts` endpoint — prompt upsert is implicit on task spawn (not documented). |
| 22 | No `GET /tasks/:id/memory` read endpoint. |
| 23 | `POST /pool/refill` body and exact behavior not defined. |
| 24 | `DELETE /meta/history` return value not stated (should be 204). |
| 25 | `GET /tasks/:id/diff` needs base branch but `base_branch` column is absent from tasks table. |
| 38 | `O` key "Open in editor" calls `editorCommand <path>` from the browser — impossible without a backend endpoint. `POST /tasks/:id/open-editor` is missing from the API surface. |

### Container / Docker Issues

| # | Issue |
|---|---|
| 26 | `~/.claude` mounted `:ro` but auto-memory is ON (`CLAUDE_CODE_DISABLE_AUTO_MEMORY=0`) — writes will fail. |
| 27 | Official Dockerfile uses `node` user but mounts target `/root/.claude` and `/root/.ssh` — permission denied at runtime. |
| 28 | `docker attach` captures PID 1 stdout; `docker exec` spawns a child with its own stdio — they are not the same stream. Log attachment strategy depends on which is used. |
| 29 | Pool health check is `claude --version` — confirms binary exists, not API connectivity. |
| 30 | `postCreateCommand` string with shell operators (e.g. `npm install && build`) will fail under `docker exec` without `sh -c` wrapper. |
| 31 | Named volume for `node_modules` in Dockerfile comment is never wired to container creation options. |

### Dev Server / Proxy Issues

| # | Issue |
|---|---|
| 32 | Caddy must be running as a daemon for `caddy reload` to work — spec has no Caddy startup step. |
| 33 | Cert generation failure in proxy mode not handled atomically — cascade to Caddy reload with missing cert files. |
| 34 | Dev server URL detection regex (`localhost:` + port) will match database connections, redis, etc. Should scope to startup message patterns. |

### UI Issues

| # | Issue |
|---|---|
| 35 | `"xterm": "^5"` is deprecated. Should use `@xterm/xterm`. |
| 36 | `keytar` is unmaintained (4 years, build failures with modern Node). Should use `@postman/final-node-keytar` or macOS `security` CLI. |
| 37 | `Cmd+,` for settings mentioned in Stage 7.6 but absent from Stage 6.7 keyboard shortcuts table. |
| 39 | `<iframe>` for preview will be blocked by dev servers that send `X-Frame-Options: SAMEORIGIN`. |
| 40 | `B` shortcut for opening devServerUrl not clearly categorized in keyboard handler scope. |
| 41 | No loading/skeleton states defined for DetailPanel data fetches. |
| 42 | Multi-repo tab switch behavior (what happens to DetailPanel) is underspecified. |

### Logic / Behavior Gaps

| # | Issue |
|---|---|
| 43 | Spin detection: "no test run detected" is ambiguous. No definition of what counts as a test run. |
| 44 | `SPINNING` has no recovery path in the state machine — no `SPINNING → WORKING` transition defined. |
| 45 | Feedback compound prompt uses "last 50 lines of log" but logs are raw stream-json blobs — not readable by the agent as progress context. |
| 46 | `maxRetries` exceeded: no defined behavior (should return 422). |
| 47 | `flaggedForDelete` field is boolean but spec says "flag worktree for auto-delete" — no timestamp field for scheduled cleanup. `flagged_for_delete_at` column missing from schema. |
| 48 | Simultaneous proxy mode spawns may race on Caddyfile writes. |
| 49 | After orchestrator restart, in-memory ring buffer for active tasks is empty — live SSE shows no prior output. |
| 50 | Boundary between `config.json` (user-managed) and runtime state is blurry. |
| 51 | `ANTHROPIC_BASE_URL=''` (empty string) may behave differently from omitting the env var. |
| 52 | `skillNames` in `SpawnTaskInput` is never wired to the claude invocation (no `--skill` flag exists). |
| 53 | Branch template `{type}/{ticket}-{slug}-{date}` with empty ticket produces `feat/-add-auth-0302` (leading dash). |
| 54 | No git credential documentation for HTTPS remotes — SSH mount handles SSH but not token-based HTTPS auth. |
| 55 | `planFirst` + `GATE_ALWAYS` interaction not defined — no intermediate review state after planning before execution. |
| 56 | Dev mode says "Vite proxied through orchestrator" but no proxy implementation or dependency (`@fastify/http-proxy`) is specified. |
| 57 | Meta-Claude model never specified (Stage 4.2 uses `claude-haiku-4-5` for approve, but meta has no model). |
| 58 | Log archive stores raw chunks; 200 chunks ≠ 200 terminal lines. "Last 200 lines" promise may not be honored. |

---

## Part 3 — Implementation Checklist

> Stages are verbatim from the spec. Each stage has an Acceptance Criteria block.
> Issue numbers reference Part 2 above.

---

### Prerequisites (resolve before writing any code)

- [ ] **Resolve Issue 1**: Confirm `-p` / `--print` is added to all claude invocations
- [ ] **Resolve Issue 2**: Choose base image strategy — Option A: `FROM node:20` + replicate official install steps; Option B: clone and build Anthropic's reference Dockerfile locally
- [ ] **Resolve Issue 3**: Choose pool reconfigure strategy — Recommended: pool pre-warms image layers only (docker create with no task mounts); on claim, stop + rm + recreate container with task-specific mounts
- [ ] **Resolve Issue 8**: Choose meta-Claude implementation — Recommended: spawn `claude -p` subprocess with CWD `~/.claude/` (gets real filesystem tools); Alternative: Anthropic SDK + custom tool definitions
- [ ] Confirm: Docker Desktop running, Node ≥ 20, claude CLI installed on host

---

### Stage 1 — Foundation

**Deliverable:** Monorepo scaffold, shared types, SQLite layer, config loading, orchestrator skeleton.

#### 1.1 Monorepo scaffold
- [ ] Root `package.json` with `"workspaces": ["packages/*"]`
- [ ] `packages/shared/package.json` (`@lacc/shared`), `packages/orchestrator/package.json`, `packages/ui/package.json`
- [ ] Root `tsconfig.base.json`: strict mode, `target: ES2022`, `moduleResolution: bundler`
- [ ] Each package extends base tsconfig
- [ ] `docker/agent-base/Dockerfile` (placeholder using chosen base — see Prerequisites)
- [ ] Root `.gitignore`: `node_modules`, `dist`, `*.db`, `.env`
- [ ] `npm run docker:build` script in root

#### 1.2 Shared types (`packages/shared/src/types.ts`)
- [ ] `TaskStatus`: add `'PAUSED'` (Issue 4)
- [ ] `OversightMode`, `TaskType`, `DevServerMode`
- [ ] `Task` interface: `containerId?: string` (Issue 10); no `anthropicBaseUrl` (it lives on `SpawnTaskInput` only)
- [ ] `PoolStatus`, `WsEvent` interfaces
- [ ] `Notification` interface: `{ message: string; taskId?: string; level: 'info' | 'warning' | 'error' }` (Issue 13)
- [ ] `SpawnTaskInput`, `FeedbackInput: { feedback: string }` (Issue 17), `SaveMemoryInput`
- [ ] `DiffResult`, `DiffFile` interfaces
- [ ] `DevcontainerConfig` interface

#### 1.3 Shared Zod schemas (`packages/shared/src/schemas.ts`)
- [ ] `SpawnTaskInputSchema`, `FeedbackInputSchema`, `SaveMemoryInputSchema`, `ConfigPatchSchema`
- [ ] Export all schemas; infer TS types from Zod

#### 1.4 SQLite layer (`packages/orchestrator/src/db/`)
- [ ] `init.ts`:
  - [ ] `CREATE TABLE IF NOT EXISTS tasks` with all spec columns PLUS: `pr_title TEXT`, `pr_body TEXT` (Issue 9), `base_branch TEXT NOT NULL DEFAULT 'main'` (Issue 25), `flagged_for_delete INTEGER DEFAULT 0`, `flagged_for_delete_at INTEGER` (Issue 47)
  - [ ] Pool table: `dev_port INTEGER` nullable (Issue 15)
  - [ ] All `CREATE INDEX IF NOT EXISTS` statements
  - [ ] `PRAGMA user_version` migration: `ALTER TABLE` to add missing columns on existing DBs
- [ ] `tasks.ts`: `insertTask`, `updateTask`, `getTask`, `listTasks`, `listTasksByRepo`, `listActiveNonTerminalTasks`; explicit Date↔integer conversion (Issue 11)
- [ ] `pool.ts`: `insertPooled`, `claimOne` (atomic), `getPoolStatus`, `removePooled`, `updatePoolStatus`
- [ ] `prompts.ts`: `upsertPrompt` (insert or increment), `listPrompts(limit?, offset?)`
- [ ] `logs.ts`: `appendChunk` (one stream-json line per row), `getLastNChunks(taskId, n)`
- [ ] `meta.ts`: `insertMessage`, `listMessages`, `clearMessages`

#### 1.5 Config loader
- [ ] `config/global.ts`: `GlobalConfig` interface, `loadGlobalConfig()`, `saveGlobalConfig(patch)`; create `~/.lacc-data/{worktrees,certs}/` on first run
- [ ] `config/repo.ts`: `loadRepoConfig(repoPath)`, `mergeConfigs(global, repo)`

#### 1.6 Orchestrator skeleton (`packages/orchestrator/src/index.ts`)
- [ ] Fastify instance with logger
- [ ] Register `@fastify/websocket`, `@fastify/static` (from `orchestrator/public`)
- [ ] Internal typed EventEmitter; `broadcastWsEvent(event: WsEvent)` helper
- [ ] `GET /health` → `{ status: 'ok', pool, version }`
- [ ] WebSocket on `/events`: store clients in `Set`, 30s PING heartbeat
- [ ] DB init + config load on startup
- [ ] Graceful shutdown: close DB, close all WS connections on SIGTERM/SIGINT

**Acceptance Criteria:**
- [ ] `curl http://localhost:7842/health` → 200
- [ ] `wscat -c ws://localhost:7842/events` connects, receives PING
- [ ] `~/.lacc-data/lacc.db` created with correct schema
- [ ] `~/.lacc-data/config.json` created with defaults
- [ ] `tsc --noEmit` on `packages/shared` with zero errors

---

### Stage 2 — Container Infrastructure

**Deliverable:** Container lifecycle, pool, git worktrees, cleanup worker, restart recovery.

#### 2.1 Docker base image
- [ ] `docker/agent-base/Dockerfile` using chosen base (see Prerequisites)
- [ ] Install `tsx`, `prettier`; create `/workspace`
- [ ] `npm run docker:build` succeeds
- [ ] `docker run --rm lacc-agent-base claude --version` prints version

#### 2.2 devcontainer.json reader (`containers/devcontainer.ts`)
- [ ] Check `.devcontainer/devcontainer.json`, then `.devcontainer.json`; return `null` if neither
- [ ] If `dockerComposeFile` present: log warning, return `null`
- [ ] Parse and validate with Zod; return `DevcontainerConfig | null`

#### 2.3 Image resolver (`containers/image.ts`)
- [ ] Priority 1: `devcontainerConfig.image` → inspect local, pull if missing
- [ ] Priority 2: `devcontainerConfig.build.dockerfile` → hash file+context, build+cache by hash
- [ ] Priority 3: `lacc-agent-base:latest`
- [ ] In-process cache per repoPath

#### 2.4 Port assignment (`containers/ports.ts`)
- [ ] On startup: hydrate `Set<number>` from active tasks + pool in SQLite
- [ ] `assignPort(): number`, `releasePort(port: number): void`

#### 2.5 Container lifecycle manager (`containers/lifecycle.ts`)
- [ ] `warmOne()`: create generic container (no task mounts per Issue 3 resolution), start, exec `claude --version` health check, insert to pool table WARMING → READY, push `POOL_UPDATED`
- [ ] `maintain(targetSize)`: count READY+WARMING, call `warmOne()` for deficit
- [ ] `claim()`: `pool.claimOne()`, trigger `maintain()` in background
- [ ] `adoptExisting()`: inspect all pool containers, remove dead entries from DB
- [ ] `configure(containerId, task, worktreePath)`: per Issue 3 resolution — stop + rm claimed container, create new one with mounts:
  - `worktreePath:/workspace`
  - `~/.claude:/home/node/.claude` — **no `:ro`** (Issues 26, 27)
  - `~/.ssh:/home/node/.ssh:ro`
  - `originalRepoPath:/original-repo:ro` (Issue 7 fix — add this mount)
  - Env: conditionally omit `ANTHROPIC_BASE_URL` if empty (Issue 51); include `lacc=true` label for orphan detection
  - Port binding: `devPort:devPort/tcp`
- [ ] `startClaude(containerId, task)`: build command array:
  ```
  claude -p --output-format stream-json --dangerously-skip-permissions
    --model {task.model}
    --add-dir /original-repo        ← container-internal path (Issue 7)
    [--permission-mode plan]        ← if planFirst
    [--agent {task.agentName}]
    "{task.prompt}"
  NOTE: --session-name omitted (Issue 5 — flag does not exist)
  NOTE: skillNames not wired to invocation (Issue 52 — report to user)
  ```
  Execute via `container.exec()`, return exec stream (Issue 28 — exec stream, not attach)
- [ ] `runPostCreate(containerId, cmd)`: string → `["sh", "-c", cmd]` (Issue 30); array → pass directly
- [ ] `pause(containerId)` → `docker pause`; `resume(containerId)` → `docker unpause`
- [ ] `kill(containerId, gracePeriodMs)`: SIGTERM → wait → `docker rm -f`
- [ ] `killImmediate(containerId)`: `docker rm -f`

#### 2.6 Git manager (`git/worktree.ts`)
- [ ] `createWorktree(repoPath, taskId, branchName, baseBranch)`: `git worktree add ... -b <branch> <base>`, return path
- [ ] `getDiff(worktreePath, baseBranch)`: `git diff <base>...HEAD` stats + patch → `DiffResult`
- [ ] `cleanupWorktree(worktreePath, branchName)`: `git worktree remove --force` + `git branch -D`
- [ ] `generateBranchName(template, opts)`: `{type}`, `{ticket}`, `{slug}` (first 5 words, hyphenated), `{date}` (MMDD); if ticket empty, remove `{ticket}-` segment entirely (Issue 53); sanitize: lowercase, max 100 chars, no double-dashes

#### 2.7 Cleanup worker (`workers/cleanup.ts`)
- [ ] `setInterval` every 5 minutes
- [ ] DONE/KILLED tasks with `container_id`: `docker rm -f`, clear `container_id` in DB
- [ ] Tasks with `flagged_for_delete_at` past `worktreeAutoDeleteHours`: `cleanupWorktree()` + `rm -rf`
- [ ] Orphan detection: `docker ps --filter label=lacc=true`; anything not in DB → `docker rm -f`
- [ ] Proxy mode: stale Caddy blocks (no matching active task) → remove + reload

#### 2.8 Restart recovery (in `index.ts` before routes)
- [ ] `adoptExisting()`
- [ ] `listActiveNonTerminalTasks()` → for each: inspect container → running: re-attach stream, resume monitoring; gone: mark FAILED, push `TASK_UPDATED`
- [ ] `maintain(config.poolSize)`
- [ ] On re-attach: pre-populate ring buffer from `db.logs.getLastNChunks(taskId, 500)` (Issue 49 fix)

**Acceptance Criteria:**
- [ ] `GET /pool` shows correct ready/warming counts
- [ ] `docker ps` shows pool containers
- [ ] Kill + restart orchestrator: pool re-adopted, no new containers for existing pool
- [ ] Cleanup worker kills orphaned containers within 5 minutes

---

### Stage 3 — Task Execution

**Deliverable:** Full spawn, SSE log streaming, cost parsing, spin detection, rate limits, state transitions.

#### 3.1 Branch name generator (`git/branch.ts`)
- [ ] Implement `generateBranchName` (calls or colocates with worktree.ts version)
- [ ] Unit test: `feat + ENG-421 + "add jwt refresh token" → feat/ENG-421-add-jwt-refresh-0302`
- [ ] Unit test: no ticket → `feat/add-jwt-refresh-0302` (no leading dash — Issue 53)

#### 3.2 Spawn endpoint (`routes/tasks.ts` — `POST /tasks`)
- [ ] Validate body with `SpawnTaskInputSchema` → 400 on failure
- [ ] Load and merge per-repo `.lacc` config with global config
- [ ] Read `devcontainerConfig` for repo; resolve image
- [ ] Determine `devServerMode` from merged config (document derivation — Issue 12)
- [ ] Assign `devPort`: `devcontainerConfig.forwardPorts[0]` or `ports.assignPort()`; skip if `devServerMode = 'none'`
- [ ] Generate `branchName` from template
- [ ] Insert task to SQLite with status `SPAWNING`; store `baseBranch` (Issue 25)
- [ ] Push `TASK_CREATED` WS event; return `{ taskId }` immediately
- [ ] Background (catch + log errors):
  - [ ] Claim or cold-create container; update task `containerId`
  - [ ] `createWorktree()`
  - [ ] `configure()` container; `runPostCreate()` if needed
  - [ ] `startClaude()` → get exec stream
  - [ ] Status → `WORKING`, push `TASK_UPDATED`
  - [ ] Start: log pipe, cost parser, file watcher, rate limit watcher, dev server detection
  - [ ] `maintain()` pool; `upsertPrompt(task.prompt)`

#### 3.3 Log streaming (`streaming/logs.ts`)
- [ ] `Map<string, string[]>` ring buffer (taskId → last 500 lines)
- [ ] `startLogPipe(taskId, execStream)`:
  - [ ] `dockerode.modem.demuxStream` to separate stdout/stderr (Issue 28)
  - [ ] Split on `\n`; push to ring buffer (cap 500); `db.logs.appendChunk()`
  - [ ] Emit `log:{taskId}` internal event for all subscribers
- [ ] `GET /tasks/:id/logs` SSE:
  - [ ] Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
  - [ ] Active task: flush ring buffer as initial burst, subscribe to `log:{taskId}`, keep open
  - [ ] Ended task: `getLastNChunks(200)`, send each as SSE data, close

#### 3.4 Cost parser (`streaming/cost.ts`)
- [ ] Subscribe to `log:{taskId}` events
- [ ] Parse each line as JSON; extract `type: "result"` or usage events for `input_tokens`, `output_tokens`, `total_cost_usd`
- [ ] Batch update SQLite every 10s; push `COST_UPDATED` WS event
- [ ] If `costUsd > config.costAlertThreshold`: push `NOTIFICATION`

#### 3.5 Spin detection (`workers/spin.ts`)
- [ ] Chokidar watch on `worktreePath`; track `lastChangeAt`, `recentFiles` (last 10)
- [ ] 60s interval: if no change for `> spinDetectionWindowMin * 60_000` → SPINNING
- [ ] If all `recentFiles` are same path AND no `jest|vitest|pytest|cargo test|go test` in recent logs → SPINNING (Issue 43)
- [ ] If SPINNING and file activity resumes → WORKING (Issue 44 fix — add recovery)
- [ ] Update `task.lastFileChanged` on each change event
- [ ] `stopSpinDetector(taskId)`: close chokidar, clear interval

#### 3.6 Rate limit handler (`streaming/ratelimit.ts`)
- [ ] Watch log lines for `429`, `rate_limit`, `Too Many Requests`
- [ ] On detect: `container.pause()`, update status `RATE_LIMITED`, store `rateLimitRetryAfter`, push `TASK_UPDATED`

#### 3.7 Completion detection (`streaming/completion.ts`)
- [ ] Watch for `type: "result"` event in stream-json
- [ ] `GATE_ON_COMPLETION` or `GATE_ALWAYS` → `AWAITING_REVIEW`, push Web Notification
- [ ] `NOTIFY_ONLY` → `DONE`, push OS notification, flag worktree for auto-delete
- [ ] Non-zero exit → `FAILED`
- [ ] On any completion: stop chokidar, stop cost parser interval, close SSE, `releasePort(devPort)`

#### 3.8 Remaining task endpoints
- [ ] `GET /tasks` → `listTasks()`
- [ ] `GET /tasks/:id` → `getTask()`, 404 if null
- [ ] `DELETE /tasks/:id`: kill container, stop monitoring, status `KILLED`, release port, push WS
- [ ] `POST /tasks/:id/pause`: `container.pause()`, status `PAUSED`, push WS
- [ ] `POST /tasks/:id/resume`: `container.resume()`, status `WORKING`, clear `rateLimitRetryAfter`, push WS
- [ ] `POST /tasks/:id/restart`: check `retryCount < maxRetries` → 422 if exceeded (Issue 46); kill, increment `retryCount`, re-spawn
- [ ] `POST /tasks/:id/feedback`: validate `FeedbackInputSchema`; fetch last 50 **decoded** log lines (extract `type: "assistant"` text from stream-json — Issue 45 fix); build compound prompt; kill; re-spawn with modified prompt

**Acceptance Criteria:**
- [ ] `POST /tasks` returns `{ taskId }` within 200ms
- [ ] Status transitions SPAWNING → WORKING visible in `GET /tasks/:id`
- [ ] `GET /tasks/:id/logs` SSE streams output in real time
- [ ] `COST_UPDATED` WS event received by connected WebSocket client
- [ ] Task transitions to `AWAITING_REVIEW` on completion (with `GATE_ON_COMPLETION`)
- [ ] `DELETE /tasks/:id` kills container, status becomes `KILLED`

---

### Stage 4 — Review Flow

**Deliverable:** Diff, approve (PR draft), reject, memory save, open-in-editor.

#### 4.1 Diff endpoint (`routes/review.ts`)
- [ ] `GET /tasks/:id/diff`: verify AWAITING_REVIEW or DONE; `getDiff(worktreePath, task.baseBranch)` (uses stored `baseBranch` — Issue 25 fix); return `DiffResult`

#### 4.2 Approve endpoint
- [ ] `POST /tasks/:id/approve`: verify AWAITING_REVIEW; `killImmediate()`; get diff; call Anthropic API (model: `claude-haiku-4-5`, or add `metaModel` to config — Issue 57) for PR draft; store `pr_title`, `pr_body`; status `DONE`; set `flaggedForDelete`, `flaggedForDeleteAt`; release port; push `TASK_UPDATED`; return `{ prTitle, prBody, branchName }`

#### 4.3 Reject endpoint
- [ ] `POST /tasks/:id/reject`: `kill()` with grace; status `KILLED`; flag for delete; release port; push WS; return 204

#### 4.4 Memory + editor endpoints
- [ ] `POST /tasks/:id/memory`:
  - `target: 'auto'` → append to `~/.claude/projects/<hash>/memory/lacc-notes.md`
  - `target: 'project'` → append to `<worktreePath>/CLAUDE.md`
  - Return `{ written: true, path, lineCount? }`
- [ ] `POST /tasks/:id/open-editor` (Issue 38 — missing from spec API surface):
  - Spawn `config.editorCommand task.worktreePath` as detached child process
  - Return 200

**Acceptance Criteria:**
- [ ] `GET /tasks/:id/diff` returns structured diff
- [ ] `POST /tasks/:id/approve` returns PR draft with title and body
- [ ] `POST /tasks/:id/memory` writes to correct file for both targets

---

### Stage 5 — Dev Server Profiles

**Deliverable:** Port mode, proxy mode, none mode, auto-detection.

#### 5.1 Port mode
- [ ] `devServerUrl = http://localhost:{devPort}` set immediately on spawn (port mode)

#### 5.2 Proxy mode (`devserver/proxy.ts`)
- [ ] Mutex on all Caddyfile operations (Issue 48)
- [ ] `setupProxy(task, repoConfig)`: add `/etc/hosts` entry via helper; run cert script; on failure: log + push `NOTIFICATION` + continue; append Caddy block; `caddy reload`; return URL or null
- [ ] `teardownProxy(task)`: remove `/etc/hosts` entry, delete certs, remove Caddy block, reload
- [ ] `npm run setup` additions: check caddy, handle Caddy startup (Issue 32), install hosts helper + sudoers

#### 5.3 None mode
- [ ] `devPort = null`, `devServerUrl = null`, skip port assignment

#### 5.4 Dev server URL detection (`streaming/devserver.ts`)
- [ ] Scoped regex (Issue 34): `(?:Local|listening|running at|started at|available at).*?(?:https?://)(?:localhost|0\.0\.0\.0):(\d{4,5})`
- [ ] On first match: update `devServerUrl`, push `TASK_UPDATED`; guard against further matches

**Acceptance Criteria:**
- [ ] Port mode task has `devServerUrl` after detection
- [ ] Proxy mode: Caddyfile has entry, `/etc/hosts` updated
- [ ] None mode: `devServerUrl = null`

---

### Stage 6 — UI Shell + Core

**Deliverable:** Browser app, task list, terminal, live WS updates.

#### 6.1 Vite + React setup
- [ ] `vite.config.ts`: proxy `/api` → `localhost:7842`, proxy `/events` WS (Issue 56 fix)
- [ ] Tailwind v4 config
- [ ] `main.tsx`: React 19 root, strict mode
- [ ] `useWebSocket` hook: exponential backoff reconnect, dispatch to state
- [ ] `useTasks` hook: initial fetch + WS event merge
- [ ] `usePool` hook: initial fetch + `POOL_UPDATED` merge

#### 6.2 Three-pane layout
- [ ] `TopBar`, `TaskList` (fixed ~320px), `DetailPanel` (flex-grow), `NotificationStrip` (fixed bottom)

#### 6.3 TopBar
- [ ] Session cost (from `GET /session/cost`, updated by `COST_UPDATED`)
- [ ] Pool status dot
- [ ] `[N] New` button

#### 6.4 TaskList
- [ ] Repo tabs (only when >1 repo)
- [ ] Filter row: All / Active / Review / Done
- [ ] Task row: status icon (all statuses including PAUSED), branch name, status badge, elapsed time, cost, `lastFileChanged`
- [ ] Selected row highlighted; sorted: active first

#### 6.5 DetailPanel
- [ ] Tab bar: Terminal / Diff (hidden unless AWAITING_REVIEW or DONE) / Preview (hidden unless `devServerUrl` set)
- [ ] **Terminal**: use `@xterm/xterm` + `@xterm/addon-fit` (Issue 35); SSE via `EventSource`; parse stream-json for `type: "assistant"` text; auto-scroll; "Task ended" banner
- [ ] **Diff**: lazy fetch on tab open; file list + highlighted patch; stats bar
- [ ] **Preview**: `<iframe src={devServerUrl} sandbox="allow-scripts allow-same-origin allow-forms">`; note iframe limitation (Issue 39); "Open in new tab" button

#### 6.6 Action bar (bottom of DetailPanel)
- [ ] `AWAITING_REVIEW`: Approve, Feedback, Reject, Open in editor
- [ ] Active (`WORKING`, `SPINNING`, `SPAWNING`): Open in editor, Pause, Restart, Kill
- [ ] `PAUSED`: Resume, Kill
- [ ] `RATE_LIMITED`: countdown + Resume + Kill
- [ ] `DONE`/`KILLED`/`FAILED`: PR draft if available; no action buttons

#### 6.7 Keyboard shortcuts (`useKeyboardShortcuts.ts`)
- [ ] Global: `N`, `Tab`, `Shift+Tab`, `1`, `2`, `3`, `Cmd+,` (Issue 37 — add settings shortcut)
- [ ] Per-task: `A`, `X`, `F`, `O`, `B`, `K`, `P`, `R`
- [ ] All disabled when any modal is open

**Acceptance Criteria:**
- [ ] `http://localhost:7842` loads
- [ ] Pool indicator correct
- [ ] Task spawned via API appears in list within 1 second
- [ ] Terminal streams live; status colors update
- [ ] All keyboard shortcuts functional

---

### Stage 7 — UI Features

**Deliverable:** Modals, PR draft panel, notifications, settings.

#### 7.1 New task modal
- [ ] All fields from spec
- [ ] `↑` key → prompt history dropdown (`GET /prompts`)
- [ ] Branch name auto-generates as user types
- [ ] Repo path: text input + recently used dropdown
- [ ] Dev server mode shown read-only from `GET /config/repo?path=`
- [ ] Agent: `GET /config/agents`; Skills: `GET /config/skills` multi-select
- [ ] Submit: `POST /tasks`

#### 7.2 Feedback modal
- [ ] Textarea + read-only header; submit: `POST /tasks/:id/feedback`

#### 7.3 PR draft panel
- [ ] Shown below action bar when `DONE` and `prTitle` exists
- [ ] Branch, PR title, PR body, git push command — each with copy button

#### 7.4 Memory save modal
- [ ] Radio: Agent memory / Project CLAUDE.md
- [ ] Textarea pre-filled from last decoded agent output
- [ ] CLAUDE.md size warning if `lineCount > 150` from API response

#### 7.5 Notification strip
- [ ] Fixed bottom, single row; entries from `NOTIFICATION` WS + AWAITING_REVIEW / RATE_LIMITED / FAILED transitions
- [ ] Click → select task; auto-fade after 60s; max 20 entries

#### 7.6 Settings modal (`Cmd+,`)
- [ ] All config fields from spec; load `GET /config`; submit `PATCH /config`

**Acceptance Criteria:**
- [ ] Full spawn → work → review → approve flow from UI only
- [ ] PR draft visible with copyable content
- [ ] Feedback modal restarts task
- [ ] Memory saves to correct files
- [ ] Notifications appear for status changes

---

### Stage 8 — Config & Meta-Claude

**Deliverable:** Config endpoints, skills/agents browser, meta-Claude workbench.

#### 8.1 Config endpoints (`routes/config.ts`)
- [ ] `GET /config`, `PATCH /config`, `GET /config/repo?path=`, `GET /config/skills`, `GET /config/agents`

#### 8.2 Meta-Claude endpoint (`routes/meta.ts`)
- [ ] `POST /meta`: validate body; insert user message; run chosen meta implementation (see Prerequisites); insert assistant message; refresh skills/agents in-memory cache; return `{ response: string }`
- [ ] `GET /meta/history` → `listMessages()`
- [ ] `DELETE /meta/history` → `clearMessages()`, return 204

#### 8.3 Config panel UI
- [ ] Library tab: file tree (skills + agents); click → show content read-only
- [ ] Workbench tab: chat UI; `POST /meta`; re-fetch skills/agents after each turn; Clear button

**Acceptance Criteria:**
- [ ] `GET /config/skills` returns files from `~/.claude/skills/`
- [ ] Meta-Claude creates a new skill file on disk
- [ ] New skill appears in spawn modal immediately after creation

---

### Stage 9 — Hardening + Ship

**Deliverable:** Context monitoring, rate limit UI, plan mode, setup script, final integration.

#### 9.1 Context window monitoring
- [ ] Parse `context_tokens_used` from cost parser events; store on task; push `TASK_UPDATED`
- [ ] TaskList: subtle progress bar at >70% context usage
- [ ] At 85%: push `NOTIFICATION`
- [ ] DetailPanel: show `$X.XX · NNk ctx`
- [ ] Note: `contextWindowSize` per model mapping needed (add to config or hardcode lookup table)

#### 9.2 Rate limit UI polish
- [ ] Countdown timer: `mm:ss` from `rateLimitRetryAfter - Date.now()`; `setInterval` in action bar component

#### 9.3 Plan mode
- [ ] Verify `--permission-mode plan` in invocation when `planFirst = true`
- [ ] TaskList: "Planning..." subtitle for SPAWNING tasks with `planFirst = true`

#### 9.4 Model + base URL
- [ ] Model select in spawn modal; `ANTHROPIC_BASE_URL` field in settings + per-task advanced section

#### 9.5 `npm run setup` (`scripts/setup.ts`)
- [ ] Use `@inquirer/prompts`
- [ ] Step 1: `docker build -t lacc-agent-base`
- [ ] Step 2: create `~/.lacc-data/` directories + default config
- [ ] Step 3: prompt for `ANTHROPIC_API_KEY` → store via `@postman/final-node-keytar` (Issue 36 — not deprecated `keytar`)
- [ ] Step 4: check `which caddy` → print status
- [ ] Step 5 (if Caddy found): install hosts helper + sudoers; start Caddy daemon (Issue 32)
- [ ] Step 6: print "Ready. Run npm start."

#### 9.6 Dev workflow scripts
- [ ] `npm run dev`: concurrent `tsx watch` orchestrator + Vite dev server
- [ ] `npm run build`: `tsc -b` + `vite build --outDir ../orchestrator/public`
- [ ] `npm start`: `node packages/orchestrator/dist/index.js`

#### 9.7 Final integration checklist (from spec)
- [ ] Full spawn → work → review → approve (UI only)
- [ ] Feedback → restart with compound prompt verified
- [ ] Reject → KILLED, worktree flagged
- [ ] Pool warms to `poolSize` on startup; refills after claims
- [ ] `POST /pool/refill` triggers `maintain()`
- [ ] Orchestrator restart: tasks re-attached, pool re-adopted, no orphans
- [ ] Rate limit: status flips, countdown shows, Resume works
- [ ] Dev server URL auto-detected, preview tab appears
- [ ] Memory save to both targets
- [ ] SSH mount allows agent `git push`
- [ ] Context warning at 85%
- [ ] PR draft generated on approve
- [ ] Multi-repo tab filtering
- [ ] Meta-Claude creates skill, appears in spawn modal
- [ ] Settings persist across restarts
- [ ] Cleanup worker removes orphaned containers + stale worktrees

---

## Part 4 — Sanity Check

### Architecture integrity
- **Single source of truth**: SQLite holds all persistent state; orchestrator is the only writer. ✓
- **No shared mutable state between routes**: each request goes through DB layer. ✓
- **Stream data flow**: exec stream → demux → ring buffer + archive → SSE/WS. Clean one-way flow. ✓
- **Port assignment**: single-threaded Node.js + synchronous `Set` access = no race condition. ✓

### Stage dependencies verified
- Stage 2 depends on Stage 1 (DB, types, config). ✓
- Stage 3 depends on Stage 2 (containers, git). ✓
- Stage 4 depends on Stage 3 (completed tasks exist). ✓
- Stage 5 depends on Stage 3 (spawn flow). ✓
- Stages 6–9 depend on Stages 1–5 (backend complete). ✓

### Critical path items (must not skip or defer)
1. **Issue 1** (`-p` flag): Without this, nothing after Stage 2 works. First thing to add.
2. **Issue 3** (container reconfigure): The pool claim + configure design must be settled before writing any container code.
3. **Issue 2** (base image): Must be resolved before `npm run docker:build` in Stage 2.1 can succeed.
4. **Issue 7** (`--add-dir` inside container): Mount `/original-repo` is required for CLAUDE.md hierarchy loading to work.
5. **Issue 28** (exec stream vs attach): Log pipe correctness depends on using `container.exec()` stream, not `container.attach()`.

### Known limitations to document in README
- Issue 6: Rate limit via SIGSTOP/SIGCONT does not enforce retry-after window
- Issue 39: Preview iframe may be blocked by dev server X-Frame-Options headers
- Issue 52: `skillNames` field in spawn input is accepted but not passed to the agent invocation
- Issue 54: HTTPS git remotes not covered — SSH key mount only
- Issue 55: `planFirst` + `GATE_ALWAYS` interaction undefined

### Dependency versions to validate at build time
- `@xterm/xterm` (not deprecated `xterm`) — Issue 35
- `@postman/final-node-keytar` (not unmaintained `keytar`) — Issue 36
- `claude-sonnet-4-6` as default model (not stale `claude-sonnet-4-5`) — Issue 14
- `react@19`, `fastify@5`, `vite@6`, `tailwindcss@4` — all specified in spec; verify no peer dep conflicts at install time
