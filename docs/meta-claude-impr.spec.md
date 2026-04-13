# Spec: Meta-Claude Context & Starter Skills

## Overview

Meta-Claude currently runs as a `claude -p` subprocess with `cwd: ~/.lacc-data/`
and no awareness of the current repo or LACC conventions. This spec defines:

1. Proper working context for meta-Claude (global + repo-aware)
2. A skill-based approach to teaching meta-Claude LACC conventions
3. Starter skills shipped with LACC, following Claude Code folder structure
4. How skills are discovered — not hardcoded, configurable via sources

---

## The problem

Meta-Claude has no context about:
- Where it is (confused about cwd when repo isn't active)
- LACC file formats (step frontmatter, workflow YAML, template variables)
- Where to write things (`~/.lacc-data/steps/` vs `<repo>/.claude/commands/`)
- The current repo's conventions (`.lacc/config.yml`, existing steps/workflows)

Result: meta-Claude asks questions it shouldn't need to ask, writes files to
wrong locations, or produces malformed output.

---

## Solution

Two parts:

**Part 1 — Runtime context:** pass the right directories and system prompt to
meta-Claude at spawn time, including the current repo when one is active.

**Part 2 — Skill-based knowledge:** meta-Claude learns LACC conventions via
skills stored in `~/.lacc-data/.claude/skills/`. Same mechanism as any agent.
Not hardcoded — discovered via the existing library resolution order.

---

## Part 1 — Runtime context

### Updated `POST /meta` handler

```typescript
interface MetaInput {
  message: string
  repoPath?: string       // current active repo, if any
  context?: string        // which system prompt to use (default: library-workbench)
}

async function spawnMetaClaude(input: MetaInput): Promise<string> {
  const home = os.homedir();
  const laccDataDir = path.join(home, '.lacc-data');

  // Base args
  const args = [
    '-p',
    '--model', config.metaModel ?? 'claude-sonnet-4-6',
    '--output-format', 'stream-json',
    '--dangerously-skip-permissions',
    '--add-dir', laccDataDir,           // global LACC library
  ];

  // Add repo context if a repo is active
  if (input.repoPath) {
    args.push('--add-dir', input.repoPath);

    const repoLaccDir = path.join(input.repoPath, '.lacc');
    if (fs.existsSync(repoLaccDir)) {
      args.push('--add-dir', repoLaccDir);
    }

    const repoClaudeDir = path.join(input.repoPath, '.claude');
    if (fs.existsSync(repoClaudeDir)) {
      args.push('--add-dir', repoClaudeDir);
    }
  }

  // Load system prompt with variables
  const systemPrompt = loadSystemPrompt(
    input.context ?? 'library-workbench',
    {
      lacc_data_dir: laccDataDir,
      repo_path: input.repoPath ?? 'none',
      has_repo: input.repoPath ? 'true' : 'false',
    }
  );

  // Prepend system prompt to message
  const fullMessage = `${systemPrompt}\n\n---\n\n${input.message}`;
  args.push(fullMessage);

  return new Promise((resolve) => {
    let output = '';
    const proc = spawn('claude', args, {
      cwd: laccDataDir,              // meta-Claude always starts in ~/.lacc-data/
      env: { ...process.env },
    });
    proc.stdout.on('data', (d: Buffer) => output += d.toString());
    proc.on('close', () => resolve(extractAssistantText(output)));
    proc.on('error', () => resolve(''));
  });
}
```

### What meta-Claude can now read

With `--add-dir ~/.lacc-data/`:
- `~/.lacc-data/.claude/CLAUDE.md` — LACC global rules
- `~/.lacc-data/.claude/skills/` — all LACC skills including starter skills
- `~/.lacc-data/.claude/agents/` — all agents
- `~/.lacc-data/workflows/` — existing workflows
- `~/.lacc-data/steps/` — existing steps

With `--add-dir <repo>/`:
- `<repo>/.claude/CLAUDE.md` — repo conventions
- `<repo>/.claude/commands/` — repo-specific commands

With `--add-dir <repo>/.lacc/`:
- `<repo>/.lacc/config.yml` — repo LACC config (docsDir, defaultWorkflow etc.)
- `<repo>/.lacc/templates/` — repo templates
- `<repo>/.lacc/workflows/` — repo workflow overrides

### UI change — pass active repo

The workbench component needs to send `repoPath` with each message:

```typescript
// In POST /meta request body
{
  message: userInput,
  repoPath: activeRepo?.path ?? undefined,
  context: 'library-workbench',
}
```

`activeRepo` is whatever repo is currently selected in the task list.
If no repo is active (no tasks running), `repoPath` is omitted —
meta-Claude works in global context only.

---

## Part 2 — Starter skills

Skills live in `~/.lacc-data/.claude/skills/` following Claude Code's
exact folder convention. Meta-Claude discovers them the same way any
agent does — via `--add-dir ~/.lacc-data/` which loads the `.claude/`
hierarchy.

**Not hardcoded.** The skills are files on disk. The user can:
- Edit them directly
- Delete and replace with their own versions
- Add them to a maintained source repo (e.g. `my-library`) and have
  them loaded from there instead
- Override specific skills at the repo level in `<repo>/.claude/skills/`

Resolution follows the standard order: repo → global → sources.

### Skill files to create

#### `~/.lacc-data/.claude/skills/lacc-conventions.md`

The most important skill. Teaches meta-Claude the full picture.

```markdown
---
name: LACC Conventions
description: File locations, naming rules, and conventions for LACC
---

# LACC Conventions

## Where things live

LACC uses ~/.lacc-data/ as its global home (current implementation).
Future: will migrate to ~/.lacc/.

### Global locations

| Type | Path |
|---|---|
| Steps (command files) | ~/.lacc-data/steps/ |
| Workflows | ~/.lacc-data/workflows/ |
| Agents | ~/.lacc-data/.claude/agents/ |
| Skills | ~/.lacc-data/.claude/skills/ |
| System prompts | ~/.lacc-data/system-prompts/ |
| Sources | ~/.lacc-data/sources/ |

### Repo locations (when a repo is active)

| Type | Path |
|---|---|
| Repo config | <repo>/.lacc/config.yml |
| Repo steps (overrides) | <repo>/.claude/commands/ |
| Repo templates | <repo>/.lacc/templates/ |
| Repo workflow overrides | <repo>/.lacc/workflows/ |
| User documents | <repo>/<docsDir>/ (default: ai-docs/) |

## Naming conventions

- Step files: kebab-case, descriptive (`spec-from-jira.md`, `code-review.md`)
- Workflow files: kebab-case (`feature-development.yml`)
- Template files: kebab-case (`spec-context.md`)
- No spaces, no uppercase in filenames

## Step types (LACC vocabulary)

A step is LACC's orchestration primitive. Three types:

```yaml
# Type 1 — reference a command file by name
step:
  command: spec-from-jira   # resolves to ~/.lacc-data/steps/spec-from-jira.md

# Type 2 — reference any .md file
step:
  file: "{{user_docs}}/.jira.md"

# Type 3 — inline prompt
step:
  prompt: |
    Summarise the codebase structure before starting work.
```

## Template variables

| Variable | Resolves to |
|---|---|
| {{workspace}} | /workspace (container root) |
| {{repo}} | /original-repo (read-only original repo) |
| {{user_docs}} | <worktree>/<docsDir> (user's document folder) |
| {{templates}} | repo .lacc/templates/ then global |
| {{branch}} | current git branch name |
| {{include:path}} | inlines file content at this position |

## When writing files

Always confirm the full path after writing.
Always use the correct location based on scope:
- Global capability → ~/.lacc-data/steps/ or ~/.lacc-data/workflows/
- Repo-specific → <repo>/.lacc/ or <repo>/.claude/commands/
- If unsure, ask the user which scope they want.
```

---

#### `~/.lacc-data/.claude/skills/create-step.md`

```markdown
---
name: Create LACC Step
description: How to create a well-formed LACC step file with correct frontmatter
---

# Creating a LACC Step

A step file is a markdown file with YAML frontmatter. It lives in
`~/.lacc-data/steps/` (global) or `<repo>/.claude/commands/` (repo-specific).

## File format

```markdown
---
name: Human-readable name
description: One-line description of what this step does

reads:
  - path: "{{user_docs}}/.jira.md"
    required: true
  - path: "{{templates}}/context.md"
    required: false

writes:
  - "{{user_docs}}/.spec.md"

depends:
  agents: []          # agent names that should be available
  skills: []          # skill names that should be available
  steps: []           # informational only

tools:
  allow: [Read, Write, Bash, Glob, Grep]
  deny: []

promptUser: false     # true if step may pause to ask user questions
---

[Prompt body here. Use {{template_variables}} freely.
Reference {{include:path}} to inline template fragments.]
```

## Checklist before saving

- [ ] `name` and `description` filled in
- [ ] `reads` lists all files the step expects to find
- [ ] `writes` lists all files the step will produce
- [ ] `required: true` only on files that are essential
- [ ] Template variables used for all paths (not hardcoded absolute paths)
- [ ] Prompt is self-contained — another agent reading it cold understands what to do
- [ ] Saved to correct location (global vs repo-specific)
```

---

#### `~/.lacc-data/.claude/skills/create-workflow.md`

```markdown
---
name: Create LACC Workflow
description: How to create a well-formed LACC workflow YAML file
---

# Creating a LACC Workflow

A workflow is a YAML file in `~/.lacc-data/workflows/` (global) or
`<repo>/.lacc/workflows/` (repo-specific override).

## File format

```yaml
name: workflow-name            # kebab-case, matches filename
version: 1
description: Short description of what this workflow does

docsDir: ai-docs               # where the user keeps working documents
model: claude-sonnet-4-6       # default model for all stages
oversight: gate_on_completion  # gate_on_completion | notify_only | gate_always

tools:                         # available to all stages
  skills: []
  agents: []
  mcp: []

stages:
  - id: stage-id               # kebab-case, unique within workflow
    name: Human-readable name
    step:
      command: step-file-name  # OR file: path OR prompt: "inline..."
    gate: manual               # manual | auto
    optional: false            # true = user can skip at spawn time
    canLoop: false             # true = user can send back to previous stage
    oversight: gate_on_completion  # override workflow default for this stage
    tools:                     # extends workflow-level tools
      skills: []
      agents: []
```

## Gate behaviour

- `gate: manual` — pause after stage completes, show output, wait for user to continue
- `gate: auto` — immediately advance to next stage on completion

## Checklist before saving

- [ ] `name` matches filename (without .yml)
- [ ] At least two stages
- [ ] Each stage has a unique `id`
- [ ] Each `step.command` references an existing step file
- [ ] Final stage has appropriate `oversight`
- [ ] Gates make sense for the workflow's autonomy level
- [ ] Saved to correct location
```

---

#### `~/.lacc-data/.claude/skills/create-agent.md`

```markdown
---
name: Create Claude Code Agent
description: How to create a Claude Code agent definition for use in LACC workflows
---

# Creating a Claude Code Agent

Agent files live in `~/.lacc-data/.claude/agents/` (global) or
`<repo>/.claude/agents/` (repo-specific).

## File format

Agent files follow Claude Code's native format:

```markdown
---
name: Agent Name
description: What this agent specialises in
---

[Agent instructions here. Be specific about the agent's role,
what it should focus on, and how it should behave differently
from the default general-purpose agent.]

## Responsibilities

- ...

## Constraints

- ...
```

## Checklist

- [ ] Clear description of the agent's specialty
- [ ] Instructions are specific enough to change agent behaviour
- [ ] Saved to correct location
```

---

### Setup script additions

`npm run setup` creates these files if they don't already exist:

```typescript
// scripts/setup.ts

const STARTER_SKILLS = [
  'lacc-conventions.md',
  'create-step.md',
  'create-workflow.md',
  'create-agent.md',
];

const skillsDir = path.join(home, '.lacc-data', '.claude', 'skills');
fs.mkdirSync(skillsDir, { recursive: true });

for (const filename of STARTER_SKILLS) {
  const dest = path.join(skillsDir, filename);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(
      path.join(__dirname, 'defaults', 'skills', filename),
      dest
    );
    console.log(`  Created ${dest}`);
  } else {
    console.log(`  Skipped ${dest} (already exists)`);
  }
}
```

Source files live in `scripts/defaults/skills/` in the LACC repo.
Setup never overwrites existing files — user edits are preserved.

---

## How skills become configurable / sourceable

Because skills follow Claude Code's folder structure, the entire
existing source system applies without any changes:

**User edits a starter skill:**
```bash
# Just edit the file directly
cursor ~/.lacc-data/.claude/skills/lacc-conventions.md
```

**User moves skills to a maintained repo:**
```
~/.lacc-data/sources/my-library/.claude/skills/
  lacc-conventions.md      ← user's maintained version
  create-step.md
```

Register `my-library` as a source. Resolution order picks up
the source version over the global default.

**Per-repo skill override:**
```
<repo>/.claude/skills/
  create-step.md           ← repo-specific override
```

The agent running in the container for that repo gets the repo's
version via `--add-dir`.

**Configuration** — no special config needed. The resolution order
(repo → source → global) handles everything. To disable a starter
skill: delete the file. To replace it: put a file with the same name
in a higher-priority location.

---

## Summary of changes

### Backend

| File | Change |
|---|---|
| `routes/meta.ts` | Add `repoPath` to request body, pass `--add-dir` flags for repo context |
| `meta/systemPrompts.ts` | Pass `lacc_data_dir`, `repo_path`, `has_repo` variables to system prompt |

### Setup script

| File | Change |
|---|---|
| `scripts/setup.ts` | Create `~/.lacc-data/.claude/skills/` and copy 4 starter skill files |
| `scripts/defaults/skills/` | New folder with 4 starter skill markdown files |

### UI

| File | Change |
|---|---|
| `components/MetaWorkbench.tsx` | Include `activeRepo?.path` in POST /meta request body |

---

## Notes

- Starter skills are templates, not sacred. User should feel free to edit them.
- `lacc-conventions.md` should be kept up to date as the system evolves —
  it's the single source of truth meta-Claude uses for "where do things go."
- When `~/.lacc-data/` migrates to `~/.lacc/`, update `lacc-conventions.md`
  to reflect the new paths. Meta-Claude will immediately use the new locations.
- The system prompt (`library-workbench.md`) and the skills complement each
  other — system prompt sets meta-Claude's role and tone, skills provide
  the specific how-to knowledge.