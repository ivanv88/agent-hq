import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { DATA_DIR } from './init.js';
import type { StepDefinition, WorkflowDefinition } from '@lacc/shared';

const STEPS_DIR = path.join(DATA_DIR, 'steps');
const WORKFLOWS_DIR = path.join(DATA_DIR, 'workflows');

function ensureDirs() {
  fs.mkdirSync(STEPS_DIR, { recursive: true });
  fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
}

// ── Steps ────────────────────────────────────────────────────────────────────

function parseStepFile(filename: string, content: string): StepDefinition {
  const parts = content.split(/^---\s*$/m);
  // parts[0] is empty (file starts with ---), parts[1] is frontmatter, parts[2]+ is body
  const frontmatterRaw = parts.length >= 3 ? parts[1] : '';
  const promptBody = parts.length >= 3 ? parts.slice(2).join('---').trim() : content.trim();
  const fm = yaml.load(frontmatterRaw) as Record<string, unknown>;
  const stem = path.basename(filename, '.md');
  return {
    name: (fm.name as string) ?? stem,
    filename: stem,
    description: (fm.description as string) ?? '',
    reads: (fm.reads as string[]) ?? [],
    writes: (fm.writes as string[]) ?? [],
    promptUser: Boolean(fm.prompt_user),
    tools: fm.tools as StepDefinition['tools'],
    prompt: promptBody,
  };
}

function serializeStepFile(step: StepDefinition): string {
  const fm: Record<string, unknown> = {
    name: step.name,
    description: step.description,
    reads: step.reads,
    writes: step.writes,
  };
  if (step.promptUser) fm.prompt_user = true;
  if (step.tools) fm.tools = step.tools;
  return `---\n${yaml.dump(fm).trim()}\n---\n\n${step.prompt}\n`;
}

export function listSteps(): StepDefinition[] {
  ensureDirs();
  const files = fs.readdirSync(STEPS_DIR).filter(f => f.endsWith('.md'));
  return files.map(f => {
    const content = fs.readFileSync(path.join(STEPS_DIR, f), 'utf-8');
    return parseStepFile(f, content);
  });
}

export function getStep(name: string): StepDefinition | null {
  ensureDirs();
  const filePath = path.join(STEPS_DIR, `${name}.md`);
  if (!fs.existsSync(filePath)) return null;
  return parseStepFile(`${name}.md`, fs.readFileSync(filePath, 'utf-8'));
}

export function saveStep(name: string, step: StepDefinition): void {
  ensureDirs();
  fs.writeFileSync(path.join(STEPS_DIR, `${name}.md`), serializeStepFile(step), 'utf-8');
}

export function deleteStep(name: string): boolean {
  const filePath = path.join(STEPS_DIR, `${name}.md`);
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
