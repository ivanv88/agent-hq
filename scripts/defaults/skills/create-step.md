---
name: Create LACC Step
description: How to create a well-formed LACC command file with correct frontmatter
---

# Creating a LACC Command File

A command file is a markdown file with YAML frontmatter. It lives in
`~/.lacc-data/.claude/commands/` (global) or `<repo>/.claude/commands/` (repo-specific).

## File format

```markdown
---
name: Human-readable name
description: One-line description of what this step does

reads:
  - path: "{{user_docs}}/.jira.md"
    required: true
  - path: "{{user_docs}}/.spec.md"
    required: false

writes:
  - "{{user_docs}}/.spec.md"

depends:
  agents: []          # agent names that should be available
  skills: []          # skill names that should be available
  commands: []        # other commands this one depends on

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
- [ ] Filename is kebab-case (e.g. `spec-from-jira.md`)
