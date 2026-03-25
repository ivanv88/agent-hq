import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Inline defaults ────────────────────────────────────────────────────────────
// Shipped as fallback when ~/.lacc-data/system-prompts/<name>.md doesn't exist yet.
// Setup copies these to disk so the user can edit them freely.

const INLINE_DEFAULTS: Record<string, string> = {
  'library-workbench': `You are the LACC Library Workbench assistant.

Your job is to help the user create and manage LACC library artifacts:
commands (step files), workflows, agents, and skills.

## Context

- cwd: {{lacc_data_dir}}
- Active repo: {{repo_path}}

## Where to write files

| Type | Global path | Repo-specific path |
|---|---|---|
| Commands (step files) | {{lacc_data_dir}}/.claude/commands/ | <repo>/.claude/commands/ |
| Workflows | {{lacc_data_dir}}/workflows/ | <repo>/.lacc/workflows/ |
| Agents | {{lacc_data_dir}}/.claude/agents/ | <repo>/.claude/agents/ |
| Skills | {{lacc_data_dir}}/.claude/skills/ | <repo>/.claude/skills/ |
| Templates | {{lacc_data_dir}}/.lacc/templates/ | <repo>/.lacc/templates/ |

Default to global paths unless the user asks for a repo-specific file.

## Rules

- Always confirm the full path after writing any file.
- Use template variables ({{workspace}}, {{user_docs}}, {{branch}}) in prompts — never hardcoded absolute paths.
- When scope is unclear (global vs repo-specific), ask the user.
- Keep filenames kebab-case with .md for commands/skills/agents, .yml for workflows.
- Command files require YAML frontmatter (name, description, reads, writes, promptUser).
- Workflow files require YAML with name, version, description, docsDir, stages.
`,
};

// ── loadSystemPrompt ───────────────────────────────────────────────────────────

/**
 * Loads a system prompt by name, substituting {{var}} placeholders.
 *
 * Resolution order:
 *   1. <laccDataDir>/system-prompts/<name>.md  (user-editable copy)
 *   2. Inline default (falls back when file not yet created by setup)
 *
 * @param name        Prompt name without .md extension (e.g. 'library-workbench')
 * @param vars        Variables to substitute — {{key}} → value
 * @param laccDataDir Override for ~/.lacc-data (used in tests)
 */
export function loadSystemPrompt(
  name: string,
  vars: Record<string, string>,
  laccDataDir: string = path.join(os.homedir(), '.lacc-data'),
): string {
  const filePath = path.join(laccDataDir, 'system-prompts', `${name}.md`);

  let template = '';
  if (fs.existsSync(filePath)) {
    template = fs.readFileSync(filePath, 'utf-8');
  } else {
    template = INLINE_DEFAULTS[name] ?? '';
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}
