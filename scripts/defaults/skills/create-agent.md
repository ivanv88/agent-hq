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

## Tips

- The `description` is used by Claude Code to decide when to invoke the agent.
  Make it precise — e.g. "Use when reviewing TypeScript code for correctness" not "code review agent".
- Instructions in the body should narrow focus, not broaden it.
  An agent is better at one specific thing than a generic catch-all.
- Keep agents stateless — they run fresh each invocation.

## Checklist

- [ ] Clear, specific `description` (one sentence, action-oriented)
- [ ] Instructions are specific enough to change agent behaviour
- [ ] `name` is PascalCase or Title Case (e.g. `Code Reviewer`)
- [ ] Saved to correct location (global vs repo-specific)
