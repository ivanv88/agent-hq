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
      command: command-file-name  # OR file: path OR prompt: "inline..."
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
- [ ] Each `step.command` references an existing command file
- [ ] Final stage has appropriate `oversight`
- [ ] Gates make sense for the workflow's autonomy level
- [ ] Saved to correct location (global vs repo-specific)
- [ ] Filename is kebab-case (e.g. `feature-development.yml`)
