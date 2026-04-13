import fs from 'fs';
import path from 'path';
import os from 'os';

function getDataDir(): string {
  return process.env.LACC_DATA_DIR_OVERRIDE ?? path.join(os.homedir(), '.lacc-data');
}

function getRegistryPath(): string {
  return path.join(getDataDir(), 'registry.json');
}

function readRegistry(): Record<string, { name: string; remoteUrl: string | null }> {
  try {
    return JSON.parse(fs.readFileSync(getRegistryPath(), 'utf-8'));
  } catch {
    return {};
  }
}

function getRepoNameFromRegistry(repoPath: string): string | null {
  return readRegistry()[repoPath]?.name ?? null;
}

export type LaccMode = 'local' | 'global' | 'none';

export interface LaccRoot {
  mode: LaccMode;
  root: string | null;
}

/**
 * Resolve the .lacc root for a given repo.
 * - local:  <repo>/.lacc/ exists as a directory
 * - global: repo is registered in registry.json
 * - none:   unconfigured
 */
export function getLaccRoot(repoPath: string): LaccRoot {
  // 1. Check for local .lacc/ directory
  const localLacc = path.join(repoPath, '.lacc');
  try {
    if (fs.statSync(localLacc).isDirectory()) {
      return { mode: 'local', root: localLacc };
    }
  } catch {
    // not a directory
  }

  // 2. Check registry for global mode
  const name = getRepoNameFromRegistry(repoPath);
  if (name) {
    return {
      mode: 'global',
      root: path.join(getDataDir(), 'repos', name),
    };
  }

  return { mode: 'none', root: null };
}

/**
 * Find the task storage path without creating directories.
 * Returns the path if the root exists (even if task dir doesn't yet), null if unconfigured.
 * Use this for read operations — does not create directories.
 */
export function getTaskStoragePath(repoPath: string, taskId: string): string | null {
  const { root } = getLaccRoot(repoPath);
  if (!root) return null;
  return path.join(root, 'tasks', taskId);
}

/**
 * Get (and create) the task storage path for a given task.
 * Returns null if repo has no .lacc configuration.
 * Use this for write operations — creates the directory if it doesn't exist.
 */
export function ensureTaskStoragePath(repoPath: string, taskId: string): string | null {
  const { root } = getLaccRoot(repoPath);
  if (!root) return null;
  const p = path.join(root, 'tasks', taskId);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/**
 * For container mounting: returns the host-side task storage path.
 * In local mode it's inside the worktree; in global mode it's external.
 */
export function getContainerTaskMount(
  repoPath: string,
  worktreePath: string,
  taskId: string,
): { hostPath: string | null; needsExplicitMount: boolean } {
  const { mode, root } = getLaccRoot(repoPath);
  if (!root) return { hostPath: null, needsExplicitMount: false };

  if (mode === 'local') {
    // .lacc/ is inside the worktree — already mounted via /workspace, no extra bind needed
    const hostPath = path.join(worktreePath, '.lacc', 'tasks', taskId);
    fs.mkdirSync(hostPath, { recursive: true });
    return { hostPath, needsExplicitMount: false };
  }

  // global mode — needs an explicit bind mount
  const hostPath = path.join(root, 'tasks', taskId);
  fs.mkdirSync(hostPath, { recursive: true });
  return { hostPath, needsExplicitMount: true };
}

/** Scaffold a new .lacc directory structure */
export function initLaccDir(root: string): void {
  for (const dir of ['tasks', 'workflows', '.claude/commands', '.claude/skills']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }
  const configPath = path.join(root, 'config.yml');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, [
      '# LACC repo configuration',
      'commitLacc: true',
      'baseBranch: main',
      'defaultWorkflow: null',
    ].join('\n') + '\n');
  }
}
