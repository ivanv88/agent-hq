import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { DATA_DIR } from './init.js';
import type { CommandDefinition, WorkflowDefinition } from '@lacc/shared';

const COMMANDS_DIR = path.join(DATA_DIR, '.claude', 'commands');
const WORKFLOWS_DIR = path.join(DATA_DIR, 'workflows');

function ensureDirs() {
  fs.mkdirSync(COMMANDS_DIR, { recursive: true });
  fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
}

// ── Commands ──────────────────────────────────────────────────────────────────

function parseCommandFile(filename: string, content: string): CommandDefinition {
  const parts = content.split(/^---\s*$/m);
  // parts[0] is empty (file starts with ---), parts[1] is frontmatter, parts[2]+ is body
  const frontmatterRaw = parts.length >= 3 ? parts[1] : '';
  const promptBody = parts.length >= 3 ? parts.slice(2).join('---').trim() : content.trim();
  const fm = (yaml.load(frontmatterRaw) ?? {}) as Record<string, unknown>;
  const stem = path.basename(filename, '.md');
  return {
    name: (fm.name as string) ?? stem,
    filename: stem,
    description: (fm.description as string) ?? '',
    reads: (fm.reads as string[]) ?? [],
    writes: (fm.writes as string[]) ?? [],
    promptUser: Boolean(fm.promptUser),
    depends: fm.depends as CommandDefinition['depends'],
    tools: fm.tools as CommandDefinition['tools'],
    prompt: promptBody,
  };
}

function serializeCommandFile(cmd: CommandDefinition): string {
  const fm: Record<string, unknown> = {
    name: cmd.name,
    description: cmd.description,
    reads: cmd.reads,
    writes: cmd.writes,
  };
  if (cmd.promptUser) fm.promptUser = true;
  if (cmd.depends) fm.depends = cmd.depends;
  if (cmd.tools) fm.tools = cmd.tools;
  return `---\n${yaml.dump(fm).trim()}\n---\n\n${cmd.prompt}\n`;
}

export function listCommands(): CommandDefinition[] {
  ensureDirs();
  const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.md'));
  return files.map(f => {
    const content = fs.readFileSync(path.join(COMMANDS_DIR, f), 'utf-8');
    return parseCommandFile(f, content);
  });
}

export function getCommand(name: string): CommandDefinition | null {
  ensureDirs();
  const filePath = path.join(COMMANDS_DIR, `${name}.md`);
  if (!fs.existsSync(filePath)) return null;
  return parseCommandFile(`${name}.md`, fs.readFileSync(filePath, 'utf-8'));
}

export function saveCommand(name: string, cmd: CommandDefinition): void {
  ensureDirs();
  fs.writeFileSync(path.join(COMMANDS_DIR, `${name}.md`), serializeCommandFile(cmd), 'utf-8');
}

export function deleteCommand(name: string): boolean {
  const filePath = path.join(COMMANDS_DIR, `${name}.md`);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

// ── Workflows ────────────────────────────────────────────────────────────────

export function listWorkflows(): WorkflowDefinition[] {
  ensureDirs();
  const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  return files.map(f => {
    const content = fs.readFileSync(path.join(WORKFLOWS_DIR, f), 'utf-8');
    return yaml.load(content) as WorkflowDefinition;
  });
}

export function getWorkflow(name: string): WorkflowDefinition | null {
  ensureDirs();
  for (const ext of ['.yml', '.yaml']) {
    const filePath = path.join(WORKFLOWS_DIR, `${name}${ext}`);
    if (fs.existsSync(filePath)) {
      return yaml.load(fs.readFileSync(filePath, 'utf-8')) as WorkflowDefinition;
    }
  }
  return null;
}

export function saveWorkflow(name: string, workflow: WorkflowDefinition): void {
  ensureDirs();
  // yaml.dump preserves camelCase keys (e.g. docsDir, canLoop).
  // Hand-authored YAML files must also use camelCase keys — js-yaml does NOT convert snake_case.
  fs.writeFileSync(path.join(WORKFLOWS_DIR, `${name}.yml`), yaml.dump(workflow), 'utf-8');
}

export function deleteWorkflow(name: string): boolean {
  for (const ext of ['.yml', '.yaml']) {
    const filePath = path.join(WORKFLOWS_DIR, `${name}${ext}`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  }
  return false;
}
