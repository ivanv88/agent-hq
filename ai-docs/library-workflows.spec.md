# Spec: Library & Workflow Builder

> Supersedes spec-workflow-builder.md.
> Covers file architecture, command format, dependency resolution,
> workflow engine, library UI, sources, and system prompts.

---

## Concepts

### Naming — Claude Code vs LACC

These two systems share the same file format but use different terminology.
Understanding the distinction is important before reading the rest of this spec.

**Claude Code territory** — Claude Code's own naming conventions, untouched by LACC:
- `commands/` — folder name for slash command files (`~/.claude/commands/`)
- `/command-name` — how a user invokes a command interactively in the terminal
- `agents/`, `skills/`, `CLAUDE.md` — Claude Code's native library format

LACC does not rename or redefine any of these. Claude Code files live where
Claude Code expects them and follow Claude Code's format.

**LACC territory** — LACC's own orchestration layer:
- **Step** — a single stage in a workflow pipeline. A step is an orchestration
  primitive, not a Claude Code concept. A step can be:
  - A reference to a Claude Code command file (`command: spec-from-jira`)
  - A direct path to any `.md` file — a plan, a spec, a checklist, a brief
  - An inline prompt string written directly in the workflow YAML
- **Workflow** — an ordered sequence of steps with gates. The assembly line.
  One LACC task = one workflow execution.
- **Template** — a prompt fragment for injection via `{{include:}}`.
  Never invoked directly. LACC-specific, lives in `.lacc/templates/`.
- **Source** — a git repo or local folder registered as a capability provider.
  Each source is a namespace (`my-library/debug` ≠ `community/debug`).
- **System prompt** — configures meta-Claude's behaviour per UI context.
  Editable by user, overridable per repo.

### The key insight

A Claude Code command file and a LACC step are not the same thing —
but a step can *reference* a command file as its implementation:

```
Claude Code command file:
  ~/.lacc-data/steps/spec-from-jira.md
  → invoked as /spec-from-jira in terminal
  → OR referenced as a step in a workflow

LACC step (in workflow YAML):
  - id: spec
    step:
      command: spec-from-jira   ← delegates to the command file above

  - id: brief
    step:
      file: "{{user_docs}}/.jira.md"   ← just a file, no command needed

  - id: orient
    step:
      prompt: |                         ← inline, no file at all
        Summarise the codebase structure
        before starting work.
```

The `step:` field in a workflow YAML is always LACC's vocabulary.
What it points to may be a Claude Code command, a file, or an inline prompt.

---

## File architecture

### Global LACC home (~/.lacc/)

```
~/.lacc/
  config.json
  system-prompts/
    library-workbench.md
    session-assistant.md
    workflow-builder.md
  workflows/
    feature-development.yml
    bug-investigation.yml
  .claude/
    CLAUDE.md
    commands/
      spec-from-jira.md
      technical-plan.md
      implement.md
      code-review.md
      fix-review.md
    agents/
      general-purpose.md
      security-reviewer.md
    skills/
      debug.md
      test-runner.md
    settings.json
  sources/
    my-library/
      .claude/
        commands/
        agents/
        skills/
      workflows/
    community-skills/
      .claude/
        skills/
  sources.json
```

### Repo-level (<repo>/.lacc/)

```
<repo>/
  .lacc/
    config.yml
    workflows/
      feature-development.yml     ← overrides global if same name
    templates/
      spec-context.md
      review-criteria.md
    system-prompts/
      library-workbench.md        ← repo override
  .claude/
    CLAUDE.md
    commands/
      spec.md                     ← overrides global spec-from-jira
    agents/
    settings.json
```

### Resolution order (repo always wins)

```
Commands:
  1. <repo>/.claude/commands/<n>.md
  2. ~/.lacc/sources/<source>/.claude/commands/<n>.md
  3. ~/.lacc/.claude/commands/<n>.md

Templates:
  1. <repo>/.lacc/templates/<n>.md
  2. (global templates future addition)

Workflows:
  1. <repo>/.lacc/workflows/<n>.yml
  2. ~/.lacc/sources/<source>/workflows/<n>.yml
  3. ~/.lacc/workflows/<n>.yml

Agents/Skills:
  1. <repo>/.claude/agents|skills/<n>.md
  2. ~/.lacc/sources/<source>/.claude/agents|skills/<n>.md
  3. ~/.lacc/.claude/agents|skills/<n>.md

System prompts:
  1. <repo>/.lacc/system-prompts/<context>.md
  2. ~/.lacc/system-prompts/<context>.md
```

### Storage locations (current implementation)

> Note: spec uses `~/.lacc/` as the target home. Current implementation
> uses `~/.lacc-data/`. Migration deferred — update paths accordingly.

| Concept | Spec path | Current implementation |
|---|---|---|
| Global home | `~/.lacc/` | `~/.lacc-data/` |
| Commands | `~/.lacc/.claude/commands/` | `~/.lacc-data/.claude/commands/` |
| Workflows | `~/.lacc/workflows/` | `~/.lacc-data/workflows/` |
| Sources | `~/.lacc/sources/` | not yet implemented |
| System prompts | `~/.lacc/system-prompts/` | not yet implemented |

Until migration: use `~/.lacc-data/` paths in all implementation work.
The resolution order (repo → global) should be implemented against
`~/.lacc-data/` for now.

LACC mounts ~/.lacc-data/.claude/ as additional directory in every container:

```typescript
Binds: [
  `${worktreePath}:/workspace`,
  `${home}/.claude:/home/node/.claude`,
  `${home}/.ssh:/home/node/.ssh:ro`,
  `${repoPath}:/original-repo:ro`,
  `${home}/.lacc-data/.claude:/lacc-global:ro`,  // current impl path
]
Args: ['--add-dir', '/original-repo', '--add-dir', '/lacc-global']
```

---

## Command file format

Command files live in `commands/` folders following Claude Code's native format.
When referenced by a step as `command: spec-from-jira`, LACC resolves the file,
expands template variables, and uses the body as the stage prompt.

The frontmatter declares LACC-specific metadata — reads, writes, dependencies,
tool permissions. This is invisible to Claude Code when the file is used as a
slash command; it's only meaningful to the LACC orchestrator.

```markdown
---
name: Write Technical Spec
description: Translates a Jira-style ticket into a technical specification

reads:
  - path: "{{user_docs}}/.jira.md"
    required: true
  - path: "{{templates}}/spec-context.md"
    required: false

writes:
  - "{{user_docs}}/.spec.md"

depends:
  agents: [general-purpose]   # warn if not found, don't block (v1)
  skills: [debug]
  steps: []                   # informational only in v1

tools:
  skills: [debug]             # skills available during this step
  agents: [general-purpose]   # agents available during this step
  allow: [Read, Write, Bash, Glob, Grep]  # --allowedTools
  deny: [WebFetch]                         # --disallowedTools

promptUser: true
---

Read the task description at {{user_docs}}/.jira.md carefully.

{{include:templates/spec-context}}

Identify any ambiguities. Ask the user via AskUserQuestion before proceeding.

Produce a technical specification at {{user_docs}}/.spec.md covering:
- Overview
- Technical approach
- Files to create or modify
- Edge cases and error handling
- Testing approach
```

### origin field

Not declared in frontmatter — derived from location:
- `~/.lacc/.claude/commands/` → origin: global
- `~/.lacc/sources/my-library/.claude/commands/` → origin: my-library
- `<repo>/.claude/commands/` → origin: local

---

## Template variables

| Variable | Resolves to |
|---|---|
| `{{workspace}}` | /workspace — container working directory |
| `{{repo}}` | /original-repo — original repo read-only mount |
| `{{user_docs}}` | `<worktreePath>/<config.docsDir>` — user's doc folder |
| `{{templates}}` | resolved template path (repo then global) |
| `{{branch}}` | current branch name |
| `{{diff}}` | summary of current git diff vs base branch |
| `{{include:path}}` | replaced with content of referenced file |

### {{include:}} directive

Inlined by orchestrator before prompt reaches the agent. Agent sees
fully expanded prompt, not the directive.

```
{{include:templates/spec-context}}       ← .md extension optional
{{include:~/.lacc/templates/output-format}}  ← absolute path works too
```

Resolution: `<repo>/.lacc/templates/<n>.md` first, then global.
Recursive: one level deep (template can include template, no deeper).
Unknown variables left as-is with warning logged.

---

## Workflow file format

```yaml
name: feature-development
version: 1
description: Jira ticket to spec to plan to implement to review to fix
docsDir: ai-docs              # exposes as {{user_docs}}
model: claude-sonnet-4-6      # default model for all stages
oversight: gate_on_completion  # default oversight for final stage

tools:
  skills: [debug, test-runner]
  agents: [general-purpose]
  mcp: []

stages:
  - id: spec
    name: Write Spec
    step:
      command: spec-from-jira   # delegates to ~/.lacc-data/steps/spec-from-jira.md
    gate: manual
    optional: false

  - id: plan
    name: Create Plan
    step:
      command: technical-plan
    gate: manual
    optional: true

  - id: implement
    name: Implement
    step:
      command: implement
    oversight: gate_on_completion
    gate: auto
    tools:
      skills: [test-runner]   # extends workflow-level tools

  - id: review
    name: Code Review
    step:
      command: code-review
    gate: manual
    tools:
      agents: [security-reviewer]

  - id: fix
    name: Fix Review
    step:
      command: fix-review
    oversight: gate_on_completion
    gate: manual
    canLoop: true
```

### Step types

A step can be one of three types — all are LACC concepts:

```yaml
# Type 1 — reference a Claude Code command file
# File resolved from ~/.lacc-data/.claude/commands/ or <repo>/.claude/commands/
step:
  command: spec-from-jira

# Type 2 — reference any .md file directly
# Template variables resolved, {{include:}} expanded
# No command file needed — the file IS the prompt
step:
  file: "{{user_docs}}/.jira.md"

# Type 3 — inline prompt
# Written directly in the workflow YAML
# Good for short orientation steps that don't warrant a separate file
step:
  prompt: |
    You are starting a new implementation task.
    Read the codebase structure and summarise what you find
    before proceeding. Be concise.
```

**StepDefinition type:**

```typescript
type StepDefinition =
  | { command: string }   // references a command file by name
  | { file: string }      // any .md path, template vars resolved
  | { prompt: string }    // inline prompt string
```

### Future step types (v2)

```yaml
# v2 future — spawn specialist sub-agent
step:
  agent: security-reviewer
  prompt: "Review {{diff}} for security issues"

# v2 future — parallel fan-out
step:
  parallel: [research-frontend, research-backend]
```

Build only `command`, `file`, and `prompt` step types in v1.
`agent` and `parallel` after inter-agent communication is implemented.

---

## Dependency resolution at stage launch

```
resolve step:
  command → load command file from resolution order, read frontmatter
  file    → load .md file directly, no frontmatter expected
  prompt  → use inline string directly, skip file loading

if command file loaded:
  → resolve reads: substitute vars, check existence
      required: true + missing → block + surface warning
      required: false + missing → warn + proceed after 3s
  → resolve depends:
      agents/skills: check existence, warn if missing, proceed
      steps: informational, no validation in v1
  → resolve {{include:}} directives in prompt body

for all step types:
  → build --add-dir flags: /original-repo, /lacc-global, templates dir
  → build --allowedTools / --disallowedTools from tools.allow/deny
  → launch stage with final resolved prompt string
```

---

## Repo config (<repo>/.lacc/config.yml)

```yaml
defaultWorkflow: feature-development
docsDir: ai-docs              # exposes as {{user_docs}}
baseBranch: develop
defaultModel: claude-opus-4-5
maxRetries: 5
oversightMode: gate_on_completion

devServer:
  mode: proxy
  hostname: my-domain.ai.local
  port: 8127
  tls:
    certScript: ./create.sh
    cnfTemplate: ./req.cnf

agentExtraFlags: []
```

---

## Sources (~/.lacc/sources.json)

```json
{
  "sources": [
    {
      "name": "my-library",
      "type": "github",
      "url": "https://github.com/ivan/my-claude-library",
      "maintainer": true,
      "lastSyncedAt": "2026-03-23T10:00:00Z"
    },
    {
      "name": "community-skills",
      "type": "github",
      "url": "https://github.com/someone/claude-skills",
      "maintainer": false,
      "lastSyncedAt": "2026-03-22T08:00:00Z"
    },
    {
      "name": "work-prompts",
      "type": "local",
      "path": "~/work/ai-prompts",
      "maintainer": true
    }
  ]
}
```

### Sync behaviour

- GitHub + maintainer: git pull on sync. LACC can push new items created via workbench.
- GitHub + external: git pull only. Read-only. Local edits warned as overwrite risk.
- Local folder: always live. Symlinked or read directly. No sync.

Sync trigger: manual button per source + "Sync all". Not on startup.

### Conflict resolution (same name, two sources)

Priority: local folder > maintained GitHub > external GitHub.
Within same priority: first added wins.
Conflicts surfaced in library UI. User can pin a source per item.

### Namespaced references in workflows

```yaml
stages:
  - step: my-library/spec-from-jira    # explicit source
  - step: code-review                   # unnamespaced = resolution order
```

---

## System prompts (~/.lacc/system-prompts/)

```markdown
---
name: Library Workbench
context: library-workbench
version: 1
---

You are a Claude Code configuration assistant for LACC.

You help the user create and manage capabilities stored in ~/.lacc-data/ —
steps, agents, skills, and workflows.

Always confirm what you wrote and where after creating anything.

Available locations (current implementation):
- Steps:     ~/.lacc-data/steps/
- Agents:    ~/.lacc-data/.claude/agents/
- Skills:    ~/.lacc-data/.claude/skills/
- Workflows: ~/.lacc-data/workflows/

If saving to a specific source, write to:
~/.lacc-data/sources/<source-name>/.claude/...
```

### Loading

```typescript
export function loadSystemPrompt(
  context: string,
  variables: Record<string, string> = {}
): string {
  const repoPth = `${repoPath}/.lacc/system-prompts/${context}.md`;
  const globalPath = `${home}/.lacc/system-prompts/${context}.md`;
  const filePath = fs.existsSync(repoPth) ? repoPth
    : fs.existsSync(globalPath) ? globalPath : null;
  if (!filePath) return FALLBACK_PROMPTS[context] ?? '';
  const body = stripFrontmatter(fs.readFileSync(filePath, 'utf-8'));
  return resolveVariables(body, variables);
}
```

Fallback prompts hardcoded in orchestrator for fresh installs.

---

## Stage engine

Built on existing launchClaude() — same mechanism as feedback handler.

### Flow

```
claude -p exits (type: "result" received)
  → advanceWorkflow(taskId, workflow)
  → createCheckpoint(taskId, nextStage.id, worktreePath)  ← always first
  → resolve next stage: load command, resolve deps, expand includes, substitute vars
  → evaluate gate:

      gate: auto
        → updateTask: workflow_stage = nextStage.id, workflow_status = running
        → launchClaude(taskId, containerId, worktreePath, resolvedPrompt)

      gate: manual
        → updateTask: workflow_stage = nextStage.id, workflow_status = waiting_gate
        → broadcastWsEvent TASK_UPDATED → UI shows gate decision point

  → user clicks Continue (manual gate)
      → updateTask: workflow_status = running
      → launchClaude(taskId, containerId, worktreePath, resolvedPrompt + optional context)
```

### Restart recovery

```
On orchestrator restart for each active workflow task:
  1. Read workflow_name, workflow_stage from SQLite
  2. Walk stages in order:
     checkpoint + output doc → completed cleanly
     checkpoint + no output  → interrupted → restore checkpoint, rerun
     no checkpoint            → never started → run from here
```

---

## SQLite additions

```sql
ALTER TABLE tasks ADD COLUMN workflow_name TEXT;
ALTER TABLE tasks ADD COLUMN workflow_stage TEXT;
ALTER TABLE tasks ADD COLUMN workflow_status TEXT;
ALTER TABLE tasks ADD COLUMN workflow_skipped_stages TEXT;

CREATE TABLE library_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  url TEXT,
  local_path TEXT,
  maintainer INTEGER DEFAULT 0,
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL
);
```

---

## API

```
# Workflow management
GET    /workflows
POST   /workflows
GET    /workflows/:name
PUT    /workflows/:name
DELETE /workflows/:name
GET    /workflows/:name/validate

# Step management
GET    /steps
POST   /steps
GET    /steps/:name
PUT    /steps/:name
DELETE /steps/:name

# Library sources
GET    /library/sources
POST   /library/sources
DELETE /library/sources/:name
POST   /library/sources/:name/sync
GET    /library/agents
GET    /library/skills
GET    /library/templates

# Stage control
POST   /tasks/:id/stage/continue
POST   /tasks/:id/stage/skip
POST   /tasks/:id/stage/rerun
POST   /tasks/:id/stage/loop

# System prompts
GET    /system-prompts
GET    /system-prompts/:context
PUT    /system-prompts/:context
```

---

## UI — Library page

```
Library
[Steps]  [Workflows]  [Agents]  [Skills]  [Templates]  [Sources]

Source: [All ▾]
```

### Command editor

```
┌────────────────────────────────────────────────────────────┐
│ spec-from-jira                [Source: my-library]  [Save] │
├────────────────────────────────────────────────────────────┤
│ Name         [Write Technical Spec              ]          │
│ Description  [Translates Jira ticket to spec    ]          │
│                                                            │
│ Reads                                                      │
│ ● {{user_docs}}/.jira.md              required  [×]        │
│ ○ {{templates}}/spec-context          optional  [×]        │
│ [+ Add read]                                               │
│                                                            │
│ Writes                                                     │
│ {{user_docs}}/.spec.md                          [×]        │
│ [+ Add write]                                              │
│                                                            │
│ Dependencies                                               │
│ Agents  [general-purpose ×]           [+ Add]              │
│ Skills  [debug ×]                     [+ Add]              │
│                                                            │
│ Tools                                                      │
│ Allow  [Read ×] [Write ×] [Bash ×]   [+ Add]              │
│ Deny   [WebFetch ×]                   [+ Add]              │
│                                                            │
│ Prompt                                                     │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Read at {{user_docs}}/.jira.md...                      │ │
│ │ {{include:templates/spec-context}}                     │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ [Ask meta-Claude to improve this command]                  │
└────────────────────────────────────────────────────────────┘
```

External source items: read-only + "Copy to global to edit" banner.
Maintainer source items: fully editable, save commits back to repo.

### Workflow editor

```
┌────────────────────────────────────────────────────────────┐
│ feature-development                                [Save]  │
├────────────────────────────────────────────────────────────┤
│ Docs dir  [ai-docs       ]  Model  [claude-sonnet-4-6 ▾ ] │
│ Oversight [Gate on completion ▾ ]                          │
│                                                            │
│ Tools (all stages)                                         │
│ Skills  [debug ×] [test-runner ×]  [+ Add]                │
│ Agents  [general-purpose ×]        [+ Add]                │
│                                                            │
│ Stages                               [+ Add stage]        │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ ⠿  1  Spec      spec-from-jira  manual  req  [···]   │   │
│ │ ⠿  2  Plan      technical-plan  manual  opt  [···]   │   │
│ │ ⠿  3  Implement implement       auto    req  [···]   │   │
│ │ ⠿  4  Review    code-review     manual  req  [···]   │   │
│ │ ⠿  5  Fix       fix-review      manual  req  [···]   │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                            │
│ [Validate]  [Ask meta-Claude to improve]                   │
└────────────────────────────────────────────────────────────┘
```

Stage inline expand shows: step selector, gate, optional, canLoop,
per-stage tools.

### Sources tab

```
Sources                                          [+ Add source]
──────────────────────────────────────────────────────────────
my-library       github  maintainer  2min ago  [Sync] [···]
community-skills github  external    1hr ago   [Sync] [···]
work-prompts     local   maintainer  live            [···]
```

---

## UI — Workflow progress in task detail

Workflow tab in DetailPanel (shown only when task has workflow_name):

```
┌──────────────────────────────────────────────────────────┐
│ Workflow: feature-development                            │
├──────────────────────────────────────────────────────────┤
│ ↺  Initial state    clean worktree        09:10          │
│ ✓  Spec             .spec.md              09:14  $0.21 [↺]│
│ ✓  Plan             .plan.md              09:31  $0.18 [↺]│
│ ●  Implement        working...            09:44          │
│ ○  Review           waiting                              │
│ ○  Fix              waiting                              │
├──────────────────────────────────────────────────────────┤
│                                  [Skip to Review]        │
└──────────────────────────────────────────────────────────┘
```

[↺] restore on hover. Inline confirmation on click.

### Gate decision point

```
┌──────────────────────────────────────────────────────────┐
│ ✓  Spec complete · .spec.md                              │
├──────────────────────────────────────────────────────────┤
│  ## Overview                                             │
│  Implement JWT refresh token flow...                     │
│                                                          │
│  ## Technical approach                                   │
│  1. Add /auth/refresh endpoint                           │
│  ...                                                     │
├──────────────────────────────────────────────────────────┤
│ checkpoint saved                                         │
│ [Open in editor]  [Re-run Spec]  [Continue to Plan →]   │
└──────────────────────────────────────────────────────────┘
```

---

## Spawn modal changes

```
Workflow    [feature-development ▾]   [Edit]   [None]
```

Selecting a workflow pre-fills model, oversight, shows stage preview
with optional stage toggles. Prompt field becomes optional.

---

## Meta-Claude integration

Workbench creates commands + workflows from description. Reads existing
slash commands and maps to workflow. "Ask meta-Claude" in each editor
pre-loads current file as context.

When saving, asks which source (if multiple maintainer sources exist).
External sources never shown as save targets.

---

## Notes

- Commands are dual-use: slash commands interactively + stages in workflows.
  Same file, no duplication.
- `npm run setup` creates starter commands in ~/.lacc/.claude/commands/ if empty.
- Source repos need only .claude/ and/or workflows/ subdirectories — LACC
  ignores everything else.
- /compact between stages is the agent's responsibility.
- Workflow cost shown as total + per-stage breakdown in workflow tab.
