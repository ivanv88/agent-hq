import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import type { DiffResult, DiffFile } from '@lacc/shared';

const execFileAsync = promisify(execFile);

const WORKTREES_DIR = path.join(os.homedir(), '.lacc-data', 'worktrees');

export async function isGitRepo(repoPath: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd: repoPath });
    return true;
  } catch {
    return false;
  }
}

export async function createWorktree(
  repoPath: string,
  taskId: string,
  branchName: string,
  baseBranch: string
): Promise<string> {
  const worktreePath = path.join(WORKTREES_DIR, taskId);

  await execFileAsync('git', [
    'worktree', 'add',
    '-b', branchName,
    worktreePath,
    baseBranch,
  ], { cwd: repoPath });

  return worktreePath;
}

export async function getDiff(worktreePath: string, baseBranch: string): Promise<DiffResult> {
  // Get stats
  const { stdout: statOutput } = await execFileAsync('git', [
    'diff',
    `${baseBranch}...HEAD`,
    '--stat',
    '--numstat',
  ], { cwd: worktreePath });

  // Get full patch
  const { stdout: patchOutput } = await execFileAsync('git', [
    'diff',
    `${baseBranch}...HEAD`,
  ], { cwd: worktreePath });

  const files = parseNumstat(statOutput);
  const patches = splitPatch(patchOutput);

  // Merge patches into files
  const result: DiffFile[] = files.map(f => ({
    ...f,
    patch: patches[f.path] ?? '',
  }));

  return {
    files: result,
    totalAdditions: result.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: result.reduce((sum, f) => sum + f.deletions, 0),
  };
}

function parseNumstat(output: string): Array<Omit<DiffFile, 'patch'>> {
  const files: Array<Omit<DiffFile, 'patch'>> = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (match) {
      files.push({
        path: match[3],
        additions: match[1] === '-' ? 0 : parseInt(match[1], 10),
        deletions: match[2] === '-' ? 0 : parseInt(match[2], 10),
      });
    }
  }
  return files;
}

function splitPatch(patch: string): Record<string, string> {
  const result: Record<string, string> = {};
  const fileSections = patch.split(/(?=^diff --git )/m);

  for (const section of fileSections) {
    const match = section.match(/^diff --git a\/.+ b\/(.+)$/m);
    if (match) {
      result[match[1]] = section;
    }
  }

  return result;
}

export async function cleanupWorktree(worktreePath: string, branchName: string): Promise<void> {
  // Get the repo path from worktree
  try {
    const { stdout: mainRepoPath } = await execFileAsync('git', [
      'worktree', 'list', '--porcelain',
    ], { cwd: worktreePath });

    // Find the main worktree
    const lines = mainRepoPath.split('\n');
    const mainPath = lines[0]?.replace('worktree ', '').trim();

    if (mainPath) {
      await execFileAsync('git', [
        'worktree', 'remove', '--force', worktreePath,
      ], { cwd: mainPath });

      await execFileAsync('git', [
        'branch', '-D', branchName,
      ], { cwd: mainPath }).catch(() => {}); // branch may not exist
    }
  } catch (err) {
    console.error('cleanupWorktree error:', err);
  }
}

export function generateBranchName(opts: {
  type: string;
  ticket?: string;
  prompt: string;
  template: string;
  date?: string;
  suffix?: string;
}): string {
  const { type, ticket, prompt, template } = opts;
  const date = opts.date ?? new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }).replace('/', '');

  // Generate slug: first 5 words of prompt, hyphenated
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join('-');

  let result = template;
  result = result.replace('{type}', type);
  result = result.replace('{date}', date);
  result = result.replace('{slug}', slug);

  // Issue 53: if ticket is empty, remove the {ticket}- segment entirely
  if (ticket && ticket.trim()) {
    result = result.replace('{ticket}', ticket.trim());
  } else {
    result = result.replace('{ticket}-', '').replace('{ticket}', '');
  }

  // Append suffix for uniqueness if provided
  if (opts.suffix) {
    result = `${result}-${opts.suffix}`;
  }

  // Sanitize: lowercase, max 100 chars, no double dashes
  result = result
    .toLowerCase()
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

  return result;
}
