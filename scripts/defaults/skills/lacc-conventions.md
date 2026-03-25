---
name: LACC Conventions
description: File locations, naming rules, and conventions for LACC
---

# LACC Conventions

## Where things live

LACC uses `~/.lacc-data/` as its global home.

### Global locations

| Type | Path |
|---|---|
| Commands (step files) | `~/.lacc-data/.claude/commands/` |
| Workflows | `~/.lacc-data/workflows/` |
| Agents | `~/.lacc-data/.claude/agents/` |
| Skills | `~/.lacc-data/.claude/skills/` |
| System prompts | `~/.lacc-data/system-prompts/` |
| Sources | `~/.lacc-data/sources/` |

### Repo locations (when a repo is active)

| Type | Path |
|---|---|
| Repo config | `<repo>/.lacc/config.yml` |
| Repo commands (overrides) | `<repo>/.claude/commands/` |
| Repo templates | `<repo>/.lacc/templates/` |
| Repo workflow overrides | `<repo>/.lacc/workflows/` |
| User documents | `<repo>/<docsDir>/` (default: `ai-docs/`) |

## Naming conventions

- Command files: kebab-case, descriptive (`spec-from-jira.md`, `code-review.md`)
- Workflow files: kebab-case (`feature-development.yml`)
- Template files: kebab-case (`spec-context.md`)
- No spaces, no uppercase in filenames

## Step types (LACC vocabulary)

A **step** is LACC's orchestration primitive. Three types:

```yaml
# Type 1 — reference a command file by name
step:
  command: spec-from-jira   # resolves from ~/.lacc-data/.claude/commands/

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
| `{{workspace}}` | `/workspace` (container root) |
| `{{repo}}` | `/original-repo` (read-only original repo) |
| `{{user_docs}}` | `<worktree>/<docsDir>` (user's document folder) |
| `{{branch}}` | current git branch name |
| `{{include:path}}` | inlines file content at this position |

## When writing files

Always confirm the full path after writing.
Always use the correct location based on scope:
- Global capability → `~/.lacc-data/.claude/commands/` or `~/.lacc-data/workflows/`
- Repo-specific → `<repo>/.lacc/` or `<repo>/.claude/commands/`
- If unsure, ask the user which scope they want.
