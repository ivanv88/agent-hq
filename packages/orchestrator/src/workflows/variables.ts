import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Task, WorkflowDefinition, DiffResult } from '@lacc/shared';
import { getDiff } from '../git/worktree.js';

// ── Sync variable substitution ────────────────────────────────────────────────

export function resolvePrompt(
  prompt: string,
  task: Task,
  workflow: { docsDir?: string },
): string {
  const containerWorkspace = '/workspace';
  const containerDocsDir = `${containerWorkspace}/${workflow.docsDir ?? 'ai-docs'}`;
  const taskDir = `${containerWorkspace}/.lacc/tasks/${task.id}`;
  const vars: Record<string, string> = {
    '{{user_docs}}': containerDocsDir,   // spec primary name
    '{{docs_dir}}':  containerDocsDir,   // backward compat alias
    '{{workspace}}': containerWorkspace,
    '{{repo}}':      '/original-repo',
    '{{branch}}':    task.branchName,
    '{{spec}}':      `${containerDocsDir}/.spec.md`,
    '{{plan}}':      `${containerDocsDir}/.plan.md`,
    '{{review}}':    `${containerDocsDir}/.review.md`,
    '{{jira}}':      `${containerDocsDir}/.jira.md`,
    '{{task_dir}}':    `${taskDir}/`,
    '{{task_spec}}':   `${taskDir}/.spec.md`,
    '{{task_plan}}':   `${taskDir}/.plan.md`,
    '{{task_review}}': `${taskDir}/.review.md`,
    '{{memory}}':      `${taskDir}/memory.md`,
  };
  let result = prompt;
  for (const [token, value] of Object.entries(vars)) {
    result = result.replaceAll(token, value);
  }
  return result;
}

// ── {{include:}} directive expansion ─────────────────────────────────────────

const INCLUDE_RE = /\{\{\s*include:([^}]+)\}\}/g;

function resolveIncludePath(arg: string, repoPath: string): string | null {
  const trimmed = arg.trim();

  // Absolute/tilde path — resolve directly
  if (trimmed.startsWith('~') || path.isAbsolute(trimmed)) {
    const resolved = trimmed.startsWith('~')
      ? path.join(os.homedir(), trimmed.slice(1))
      : trimmed;
    const candidates = resolved.endsWith('.md')
      ? [resolved]
      : [`${resolved}.md`, resolved];
    return candidates.find(fs.existsSync) ?? null;
  }

  // Relative path — resolve relative to <repo>/.lacc/ first, then ~/.lacc-data/
  // e.g. {{include:templates/ctx}} → <repo>/.lacc/templates/ctx.md
  const candidates = [
    path.join(repoPath, '.lacc', trimmed),
    path.join(os.homedir(), '.lacc-data', trimmed),
  ].flatMap(p => p.endsWith('.md') ? [p] : [`${p}.md`, p]);

  return candidates.find(fs.existsSync) ?? null;
}

export async function resolveIncludes(prompt: string, repoPath: string): Promise<string> {
  const matches = [...prompt.matchAll(INCLUDE_RE)];
  if (matches.length === 0) return prompt;

  let result = prompt;
  for (const match of matches) {
    const [token, arg] = match;
    const filePath = resolveIncludePath(arg, repoPath);
    if (!filePath) {
      console.warn(`[resolveIncludes] Could not resolve include: ${arg.trim()}`);
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    result = result.replace(token, content);
  }
  return result;
}

// ── {{diff}} formatting ───────────────────────────────────────────────────────

function formatDiff(diff: DiffResult): string {
  if (diff.files.length === 0) return 'No changes vs base branch.';
  const header = `Changes: ${diff.files.length} file${diff.files.length !== 1 ? 's' : ''}, +${diff.totalAdditions} -${diff.totalDeletions}`;
  const lines = diff.files.map(f => `  +${f.additions} -${f.deletions}  ${f.path}`);
  return [header, ...lines].join('\n');
}

// ── Full async stage prompt resolution ───────────────────────────────────────

export async function resolveStagePrompt(
  rawPrompt: string,
  task: Task,
  workflow: WorkflowDefinition,
): Promise<string> {
  // 1. Expand {{include:}} directives (one level deep)
  let prompt = await resolveIncludes(rawPrompt, task.repoPath);

  // 2. Lazily compute {{diff}} only if referenced
  if (prompt.includes('{{diff}}')) {
    if (task.worktreePath && task.baseBranch) {
      try {
        const diffResult = await getDiff(task.worktreePath, task.baseBranch);
        prompt = prompt.replaceAll('{{diff}}', formatDiff(diffResult));
      } catch {
        console.warn('[resolveStagePrompt] Could not compute {{diff}}');
        prompt = prompt.replaceAll('{{diff}}', '(diff unavailable)');
      }
    } else {
      prompt = prompt.replaceAll('{{diff}}', '(diff unavailable)');
    }
  }

  // 3. Resolve {{archive:<taskId>}} directives
  const ARCHIVE_RE = /\{\{archive:([^}]+)\}\}/g;
  const archiveMatches = [...prompt.matchAll(ARCHIVE_RE)];
  if (archiveMatches.length > 0) {
    const { getTaskStoragePath } = await import('../storage/lacc.js');
    const { getDb } = await import('../db/init.js');

    for (const match of archiveMatches) {
      const [token, arg] = match;
      const trimmed = arg.trim();

      let resolvedTaskId: string | null = null;

      if (trimmed === 'latest') {
        // Most recent completed task on same repo, excluding deleted
        const row = getDb().prepare(
          `SELECT id FROM tasks
           WHERE repo_path = ?
             AND archive_state != 'deleted'
             AND (completed_at IS NOT NULL OR created_at IS NOT NULL)
           ORDER BY COALESCE(completed_at, created_at) DESC
           LIMIT 1`
        ).get(task.repoPath) as { id: string } | undefined;
        resolvedTaskId = row?.id ?? null;
      } else {
        resolvedTaskId = trimmed;
      }

      let memoryContent = '';
      if (resolvedTaskId) {
        const storagePath = getTaskStoragePath(task.repoPath, resolvedTaskId);
        if (storagePath) {
          try {
            memoryContent = fs.readFileSync(
              path.join(storagePath, 'memory.md'), 'utf-8'
            );
          } catch { /* file doesn't exist — leave empty */ }
        }
      }

      prompt = prompt.replace(token, memoryContent);
    }
  }

  // 4. Sync variable substitution
  return resolvePrompt(prompt, task, workflow);
}

// ── Host-path resolution for file: step type ─────────────────────────────────
// Maps workflow YAML path tokens to actual host filesystem paths (not container paths).

export function resolveHostPath(fileToken: string, worktreePath: string, docsDir: string): string {
  let p = fileToken.trim();
  const hostDocs = path.join(worktreePath, docsDir);
  p = p
    .replace('{{user_docs}}', hostDocs)
    .replace('{{docs_dir}}', hostDocs)
    .replace('{{workspace}}', worktreePath)
    .replace(/^~/, os.homedir());
  return path.isAbsolute(p) ? p : path.join(worktreePath, p);
}
