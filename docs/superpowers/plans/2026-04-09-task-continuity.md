# Task Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `.lacc` storage resolution, archive-based worktree retention, memory snapshots, git operations, and corresponding UI changes as specified in `docs/superpowers/specs/2026-04-08-task-continuity-design.md`.

**Architecture:** Three phases — Phase 1 lays the backend foundation (types, DB, storage, container mounts, template vars, archive API), Phase 2 adds memory snapshot generation and git operation routes, Phase 3 wires up all UI changes.

**Tech Stack:** Node.js/TypeScript, Fastify, better-sqlite3, simple-git (new dep), React 19, Tailwind v4, Zod

---

## File Map

### New files
| File | Purpose |
|---|---|
| `packages/orchestrator/src/config/registry.ts` | Read/write `~/.lacc-data/registry.json` — repo path → name mapping |
| `packages/orchestrator/src/storage/lacc.ts` | `getLaccRoot()`, `getTaskStoragePath()`, `initLaccDir()` |
| `packages/orchestrator/src/routes/git.ts` | Git operation route handlers (rebase, pull, push, reset, stash) |
| `packages/orchestrator/src/git/operations.ts` | `simple-git` wrappers for all git ops with conflict detection |
| `packages/orchestrator/src/memory/snapshot.ts` | Memory snapshot generation via `claude -p` |
| `packages/orchestrator/tests/unit/storage/lacc.test.ts` | Unit tests for storage path resolution |
| `packages/orchestrator/tests/unit/git/operations.test.ts` | Unit tests for git operation wrappers |
| `packages/orchestrator/tests/api/archive.test.ts` | API tests for POST /tasks/:id/archive |
| `packages/orchestrator/tests/api/git.test.ts` | API tests for git routes |
| `packages/orchestrator/tests/api/memory.test.ts` | API tests for memory routes |
| `packages/ui/src/modals/ArchiveModal.tsx` | Archive level selection modal |

### Modified files
| File | Change |
|---|---|
| `packages/shared/src/types.ts` | Add `ArchiveState` type; add `archiveState` to `Task`; remove `flaggedForDelete`, `flaggedForDeleteAt`; remove `worktreeAutoDeleteHours` from `ConfigPatch`; add `globalLaccPath` to `ConfigPatch` |
| `packages/orchestrator/src/db/init.ts` | Migration v5: add `archive_state` column |
| `packages/orchestrator/src/db/tasks.ts` | `rowToTask`, `insertTask`, `updateTask` for `archiveState` |
| `packages/orchestrator/src/config/global.ts` | Remove `worktreeAutoDeleteHours`; add `globalLaccPath` |
| `packages/orchestrator/src/config/repo.ts` | Support `.lacc/config.yml` dir + legacy `.lacc` JSON; add `commitLacc`, `defaultWorkflow` to `RepoConfig` |
| `packages/orchestrator/src/workers/cleanup.ts` | Replace `flaggedForDelete` query with `archiveState`; remove container auto-flagging for worktrees |
| `packages/orchestrator/src/containers/lifecycle.ts` | Add `/lacc-global` bind + task storage bind in `configure()`; add `--add-dir` flags in `startClaude()` |
| `packages/orchestrator/src/workflows/variables.ts` | Add `{{task_dir}}`, `{{task_spec}}`, `{{task_plan}}`, `{{task_review}}`, `{{memory}}` variables; add `{{archive:}}` resolution |
| `packages/orchestrator/src/routes/tasks.ts` | Add `POST /tasks/:id/archive`; remove `POST /tasks/:id/close`; add `GET /tasks/:id/memory` and `POST /tasks/:id/memory-snapshot` |
| `packages/orchestrator/src/index.ts` | Register git routes |
| `packages/ui/src/components/ActionBar.tsx` | Three-zone layout: agent controls, git ops, lifecycle |
| `packages/ui/src/components/DetailPanel.tsx` | Add memory tab |
| `packages/ui/src/modals/SettingsModal.tsx` | Add `globalLaccPath` field |

---

## Phase 1 — Foundation

### Task 1: `ArchiveState` type + remove `flaggedForDelete` from shared types

**Files:**
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: Add `ArchiveState` type and update `Task` interface**

In `packages/shared/src/types.ts`, after the `WorkflowStatus` type line, add:
```typescript
export type ArchiveState = 'alive' | 'archived' | 'summary' | 'deleted';
```

In the `Task` interface, replace:
```typescript
  flaggedForDelete: boolean;
  flaggedForDeleteAt: Date | null;
```
with:
```typescript
  archiveState: ArchiveState;
```

- [ ] **Step 2: Remove `worktreeAutoDeleteHours` from `ConfigPatch`; add `globalLaccPath`**

In `ConfigPatch` interface, remove:
```typescript
  worktreeAutoDeleteHours?: number;
```
Add:
```typescript
  globalLaccPath?: string;
```

- [ ] **Step 3: Type-check**
```bash
cd packages/shared && npx tsc --noEmit
```
Expected: errors about `flaggedForDelete` usages across orchestrator/UI — that's fine, we'll fix them per task.

- [ ] **Step 4: Commit**
```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): add ArchiveState type, replace flaggedForDelete"
```

---

### Task 2: DB migration — `archive_state` column

**Files:**
- Modify: `packages/orchestrator/src/db/init.ts`

- [ ] **Step 1: Write failing test**

Create `packages/orchestrator/tests/unit/db/archive-migration.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDb } from '../../../src/db/init.js';

describe('DB migration v5 — archive_state', () => {
  it('adds archive_state column with default alive', () => {
    const db = new Database(':memory:');
    initDb(db);
    const cols = (db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string; dflt_value: string | null }>);
    const col = cols.find(c => c.name === 'archive_state');
    expect(col).toBeDefined();
    expect(col!.dflt_value).toBe("'alive'");
  });

  it('does not have flagged_for_delete column', () => {
    const db = new Database(':memory:');
    initDb(db);
    const cols = (db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>);
    expect(cols.find(c => c.name === 'flagged_for_delete')).toBeUndefined();
    expect(cols.find(c => c.name === 'flagged_for_delete_at')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd packages/orchestrator && npx vitest run tests/unit/db/archive-migration.test.ts
```
Expected: FAIL

- [ ] **Step 3: Update `createTables` in `db/init.ts`**

Replace the `flagged_for_delete` and `flagged_for_delete_at` lines in `createTables`:
```typescript
      // replace:
      flagged_for_delete INTEGER NOT NULL DEFAULT 0,
      flagged_for_delete_at INTEGER,
      // with:
      archive_state TEXT NOT NULL DEFAULT 'alive',
```

- [ ] **Step 4: Add migration v5 in `runMigrations`**

After the existing `if (version < 4)` block, add:
```typescript
  if (version < 5) {
    const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
    const colNames = taskColumns.map(c => c.name);

    if (!colNames.includes('archive_state')) {
      db.exec("ALTER TABLE tasks ADD COLUMN archive_state TEXT NOT NULL DEFAULT 'alive'");
    }
    // flagged_for_delete and flagged_for_delete_at are kept as dead columns on existing DBs
    // (SQLite does not support DROP COLUMN in older versions) — they are ignored by rowToTask

    db.pragma('user_version = 5');
  }
```

- [ ] **Step 5: Run test to verify it passes**
```bash
cd packages/orchestrator && npx vitest run tests/unit/db/archive-migration.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add packages/orchestrator/src/db/init.ts packages/orchestrator/tests/unit/db/archive-migration.test.ts
git commit -m "feat(db): migration v5 — archive_state replaces flagged_for_delete"
```

---

### Task 3: Update `tasks.ts` DB helpers + test factory for `archiveState`

**Files:**
- Modify: `packages/orchestrator/src/db/tasks.ts`
- Modify: `packages/orchestrator/tests/helpers/factories.ts`

- [ ] **Step 1: Update `rowToTask`**

Replace:
```typescript
    flaggedForDelete: Boolean(row.flagged_for_delete),
    flaggedForDeleteAt: row.flagged_for_delete_at
      ? new Date(row.flagged_for_delete_at as number)
      : null,
```
with:
```typescript
    archiveState: (row.archive_state as string ?? 'alive') as import('@lacc/shared').ArchiveState,
```

- [ ] **Step 2: Update `insertTask`**

In the column list, replace `flagged_for_delete, flagged_for_delete_at,` with `archive_state,`.

In the values list, replace `@flaggedForDelete, @flaggedForDeleteAt,` with `@archiveState,`.

In the `.run({...})` call, replace:
```typescript
    flaggedForDelete: task.flaggedForDelete ? 1 : 0,
    flaggedForDeleteAt: task.flaggedForDeleteAt?.getTime() ?? null,
```
with:
```typescript
    archiveState: task.archiveState ?? 'alive',
```

- [ ] **Step 3: Update `updateTask` fieldMap**

`updateTask` uses a `fieldMap: Record<keyof Partial<Task>, string>` object — one entry per Task field, mapping to the DB column name. The loop at line ~154 iterates over it with parameterised queries.

In the `fieldMap` object, replace:
```typescript
    flaggedForDelete: 'flagged_for_delete',
    flaggedForDeleteAt: 'flagged_for_delete_at',
```
with:
```typescript
    archiveState: 'archive_state',
```

No special-case handling needed — `archiveState` is a TEXT value and the existing loop at line ~154 handles it correctly with `params[key] = val`. Also check the `switch` or special-case block below the loop (around line 159+) — it handles `skillNames`, `workflowSkippedStages`, `flaggedForDelete`, `flaggedForDeleteAt` as special serialisations. Remove the `flaggedForDelete` and `flaggedForDeleteAt` cases; `archiveState` needs no special serialisation.

- [ ] **Step 4: Update `tests/helpers/factories.ts`**

`createTestTask` signature is `createTestTask(overrides: Partial<Task> = {})` — one argument, no `app`. The factory hardcodes `flaggedForDelete: false, flaggedForDeleteAt: null` which will become a type error once Task 1 removes those fields from the `Task` type.

Replace those two lines in the default task object:
```typescript
    // remove:
    flaggedForDelete: false,
    flaggedForDeleteAt: null,
    // add:
    archiveState: 'alive',
```

- [ ] **Step 5: Type-check orchestrator**
```bash
cd packages/orchestrator && npx tsc --noEmit
```
Fix any type errors referencing `flaggedForDelete`.

- [ ] **Step 6: Run existing tests**
```bash
cd packages/orchestrator && npx vitest run
```
Expected: all pass

- [ ] **Step 7: Commit**
```bash
git add packages/orchestrator/src/db/tasks.ts packages/orchestrator/tests/helpers/factories.ts
git commit -m "feat(db): update tasks helpers and test factory for archiveState"
```

---

### Task 4: Update `GlobalConfig` — remove `worktreeAutoDeleteHours`, add `globalLaccPath`

**Files:**
- Modify: `packages/orchestrator/src/config/global.ts`

- [ ] **Step 1: Update `GlobalConfig` interface and `DEFAULTS`**

Remove `worktreeAutoDeleteHours: number` from the interface and from `DEFAULTS`.

Add to both:
```typescript
  globalLaccPath: string;
```
In `DEFAULTS`:
```typescript
  globalLaccPath: path.join(os.homedir(), '.lacc-data'),
```

- [ ] **Step 2: Update `cleanup.ts` — remove `worktreeAutoDeleteHours` usage**

In `packages/orchestrator/src/workers/cleanup.ts`, the `cleanupFlaggedWorktrees` function currently reads `config.worktreeAutoDeleteHours`. Remove that logic entirely. The new version queries `archiveState` instead of `flagged_for_delete`, and no time cutoff is applied — if `archiveState` is `'archived'`, `'summary'`, or `'deleted'` and `worktree_path IS NOT NULL`, the worktree is cleaned up.

Replace the function body:
```typescript
async function cleanupFlaggedWorktrees(): Promise<void> {
  const db = getDb();
  const tasks = db.prepare(
    `SELECT id, worktree_path, branch_name
     FROM tasks
     WHERE archive_state IN ('archived', 'summary', 'deleted')
       AND worktree_path IS NOT NULL`
  ).all() as Array<{ id: string; worktree_path: string; branch_name: string }>;

  for (const task of tasks) {
    try {
      if (fs.existsSync(task.worktree_path)) {
        await cleanupCheckpointRefs(task.id, task.worktree_path);
        await cleanupWorktree(task.worktree_path, task.branch_name);
        fs.rmSync(task.worktree_path, { recursive: true, force: true });
      }
      updateTask(task.id, { worktreePath: null });
    } catch (err) {
      console.error(`Cleanup: failed to remove worktree ${task.worktree_path}:`, err);
    }
  }
}
```

- [ ] **Step 3: Type-check**
```bash
cd packages/orchestrator && npx tsc --noEmit
```

- [ ] **Step 4: Run tests**
```bash
cd packages/orchestrator && npx vitest run
```

- [ ] **Step 5: Commit**
```bash
git add packages/orchestrator/src/config/global.ts packages/orchestrator/src/workers/cleanup.ts
git commit -m "feat(config): replace worktreeAutoDeleteHours with globalLaccPath, update cleanup"
```

---

### Task 5: Update `RepoConfig` + config loader migration

**Files:**
- Modify: `packages/orchestrator/src/config/repo.ts`

- [ ] **Step 1: Write failing test**

Create `packages/orchestrator/tests/unit/config/repo.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadRepoConfig } from '../../../src/config/repo.js';

const TMP = path.join(os.tmpdir(), `lacc-test-${Date.now()}`);

beforeEach(() => fs.mkdirSync(TMP, { recursive: true }));
afterEach(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe('loadRepoConfig', () => {
  it('returns {} when no .lacc exists', () => {
    expect(loadRepoConfig(TMP)).toEqual({});
  });

  it('reads legacy .lacc JSON file', () => {
    fs.writeFileSync(path.join(TMP, '.lacc'), JSON.stringify({ devServerMode: 'proxy' }));
    expect(loadRepoConfig(TMP)).toMatchObject({ devServerMode: 'proxy' });
  });

  it('reads .lacc/config.yml directory (YAML)', () => {
    fs.mkdirSync(path.join(TMP, '.lacc'));
    fs.writeFileSync(
      path.join(TMP, '.lacc', 'config.yml'),
      'commitLacc: true\nbaseBranch: develop\n'
    );
    const cfg = loadRepoConfig(TMP);
    expect(cfg.commitLacc).toBe(true);
    expect(cfg.baseBranch).toBe('develop');
  });

  it('prefers .lacc/ directory over .lacc JSON when both exist', () => {
    fs.mkdirSync(path.join(TMP, '.lacc'));
    fs.writeFileSync(path.join(TMP, '.lacc', 'config.yml'), 'commitLacc: false\n');
    // legacy file should be ignored
    expect(loadRepoConfig(TMP)).toMatchObject({ commitLacc: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd packages/orchestrator && npx vitest run tests/unit/config/repo.test.ts
```
Expected: FAIL

- [ ] **Step 3: Install `js-yaml` for YAML parsing**
```bash
cd packages/orchestrator && npm install js-yaml && npm install -D @types/js-yaml
```

- [ ] **Step 4: Update `RepoConfig` interface and `loadRepoConfig`**

Replace `packages/orchestrator/src/config/repo.ts`:
```typescript
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { OversightMode, DevServerMode } from '@lacc/shared';
import type { GlobalConfig } from './global.js';

export interface RepoConfig {
  // Existing fields — unchanged
  devServerMode?: DevServerMode;
  devPort?: number;
  oversightMode?: OversightMode;
  model?: string;
  branchTemplate?: string;
  postCreateCommand?: string;
  proxyHostname?: string;
  // New fields
  commitLacc?: boolean;
  defaultWorkflow?: string | null;
  baseBranch?: string;
}

export interface MergedConfig extends GlobalConfig {
  devServerMode: DevServerMode;
  devPort?: number;
  oversightMode: OversightMode;
  branchTemplate: string;
  postCreateCommand?: string;
  proxyHostname?: string;
}

export function loadRepoConfig(repoPath: string): RepoConfig {
  const laccDir = path.join(repoPath, '.lacc');
  const laccFile = laccDir; // same path — stat to distinguish

  // 1. .lacc/ directory with config.yml (new format)
  try {
    const stat = fs.statSync(laccDir);
    if (stat.isDirectory()) {
      const configYml = path.join(laccDir, 'config.yml');
      if (fs.existsSync(configYml)) {
        const raw = yaml.load(fs.readFileSync(configYml, 'utf-8'));
        return (raw as RepoConfig) ?? {};
      }
      return {};
    }
  } catch {
    // laccDir doesn't exist — fall through
  }

  // 2. .lacc as a flat JSON file (legacy format — read-only support)
  try {
    const stat = fs.statSync(laccFile);
    if (stat.isFile()) {
      return JSON.parse(fs.readFileSync(laccFile, 'utf-8')) as RepoConfig;
    }
  } catch {
    // not found or parse error
  }

  return {};
}

export function mergeConfigs(global: GlobalConfig, repo: RepoConfig): MergedConfig {
  return {
    ...global,
    devServerMode: repo.devServerMode ?? 'port',
    devPort: repo.devPort,
    oversightMode: repo.oversightMode ?? global.defaultOversightMode,
    branchTemplate: repo.branchTemplate ?? global.branchTemplate,
    postCreateCommand: repo.postCreateCommand,
    proxyHostname: repo.proxyHostname,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**
```bash
cd packages/orchestrator && npx vitest run tests/unit/config/repo.test.ts
```
Expected: PASS

- [ ] **Step 6: Run all orchestrator tests**
```bash
cd packages/orchestrator && npx vitest run
```

- [ ] **Step 7: Commit**
```bash
git add packages/orchestrator/src/config/repo.ts packages/orchestrator/tests/unit/config/repo.test.ts package-lock.json packages/orchestrator/package.json
git commit -m "feat(config): support .lacc/config.yml directory, add commitLacc/defaultWorkflow fields"
```

---

### Task 6: Registry module

**Files:**
- Create: `packages/orchestrator/src/config/registry.ts`
- Create: `packages/orchestrator/tests/unit/config/registry.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/orchestrator/tests/unit/config/registry.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP_DATA = path.join(os.tmpdir(), `lacc-registry-test-${Date.now()}`);

// Override DATA_DIR before importing
process.env.LACC_DATA_DIR_OVERRIDE = TMP_DATA;

const { getRepoName, registerRepo, resolveRepoName, updateRemoteUrl } = await import('../../../src/config/registry.js');

beforeEach(() => fs.mkdirSync(TMP_DATA, { recursive: true }));
afterEach(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

describe('registry', () => {
  it('returns null for unknown repo', () => {
    expect(getRepoName('/some/path')).toBeNull();
  });

  it('registers a repo with a name', () => {
    registerRepo('/Users/ivan/code/frontend', 'acme-frontend', null);
    expect(getRepoName('/Users/ivan/code/frontend')).toBe('acme-frontend');
  });

  it('resolveRepoName: returns existing name or suggests folder name', () => {
    const result = resolveRepoName('/Users/ivan/code/my-app');
    expect(result.suggested).toBe('my-app');
    expect(result.conflict).toBe(false);
  });

  it('resolveRepoName: detects name conflict', () => {
    registerRepo('/Users/ivan/code/other', 'my-app', null);
    const result = resolveRepoName('/Users/ivan/code/my-app');
    expect(result.conflict).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd packages/orchestrator && npx vitest run tests/unit/config/registry.test.ts
```
Expected: FAIL (module not found)

- [ ] **Step 3: Create `packages/orchestrator/src/config/registry.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';

const DATA_DIR = process.env.LACC_DATA_DIR_OVERRIDE ?? path.join(os.homedir(), '.lacc-data');
const REGISTRY_PATH = path.join(DATA_DIR, 'registry.json');

export interface RegistryEntry {
  name: string;
  remoteUrl: string | null;
}

export type Registry = Record<string, RegistryEntry>;

function readRegistry(): Registry {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')) as Registry;
  } catch {
    return {};
  }
}

function writeRegistry(reg: Registry): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

export function getRepoName(repoPath: string): string | null {
  return readRegistry()[repoPath]?.name ?? null;
}

export function getRepoEntry(repoPath: string): RegistryEntry | null {
  return readRegistry()[repoPath] ?? null;
}

export function registerRepo(repoPath: string, name: string, remoteUrl: string | null): void {
  const reg = readRegistry();
  reg[repoPath] = { name, remoteUrl };
  writeRegistry(reg);
}

export function updateRemoteUrl(repoPath: string, remoteUrl: string | null): void {
  const reg = readRegistry();
  if (reg[repoPath]) {
    reg[repoPath].remoteUrl = remoteUrl;
    writeRegistry(reg);
  }
}

export function unregisterRepo(repoPath: string): void {
  const reg = readRegistry();
  delete reg[repoPath];
  writeRegistry(reg);
}

/** Returns suggested name + whether it conflicts with an existing entry */
export function resolveRepoName(repoPath: string): { suggested: string; conflict: boolean } {
  const suggested = path.basename(repoPath);
  const reg = readRegistry();
  const conflict = Object.entries(reg).some(
    ([existingPath, entry]) => entry.name === suggested && existingPath !== repoPath
  );
  return { suggested, conflict };
}

export function listRegistry(): Array<{ repoPath: string } & RegistryEntry> {
  return Object.entries(readRegistry()).map(([repoPath, entry]) => ({ repoPath, ...entry }));
}
```

- [ ] **Step 4: Run test to verify it passes**
```bash
cd packages/orchestrator && npx vitest run tests/unit/config/registry.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add packages/orchestrator/src/config/registry.ts packages/orchestrator/tests/unit/config/registry.test.ts
git commit -m "feat(config): add registry module for repo name mapping"
```

---

### Task 7: `.lacc` storage path resolution

**Files:**
- Create: `packages/orchestrator/src/storage/lacc.ts`
- Create: `packages/orchestrator/tests/unit/storage/lacc.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/orchestrator/tests/unit/storage/lacc.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP = path.join(os.tmpdir(), `lacc-storage-test-${Date.now()}`);
const TMP_REPO = path.join(TMP, 'my-repo');
const TMP_DATA = path.join(TMP, 'lacc-data');

process.env.LACC_DATA_DIR_OVERRIDE = TMP_DATA;

const { getLaccRoot, getTaskStoragePath, LaccMode } = await import('../../../src/storage/lacc.js');

beforeEach(() => {
  fs.mkdirSync(TMP_REPO, { recursive: true });
  fs.mkdirSync(TMP_DATA, { recursive: true });
});
afterEach(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe('getLaccRoot', () => {
  it('returns local mode when .lacc/ dir exists in repo', () => {
    fs.mkdirSync(path.join(TMP_REPO, '.lacc'));
    const result = getLaccRoot(TMP_REPO);
    expect(result.mode).toBe('local');
    expect(result.root).toBe(path.join(TMP_REPO, '.lacc'));
  });

  it('returns global mode when repo is registered', () => {
    // register the repo manually in registry
    fs.writeFileSync(
      path.join(TMP_DATA, 'registry.json'),
      JSON.stringify({ [TMP_REPO]: { name: 'my-repo', remoteUrl: null } })
    );
    const result = getLaccRoot(TMP_REPO);
    expect(result.mode).toBe('global');
    expect(result.root).toBe(path.join(TMP_DATA, 'repos', 'my-repo'));
  });

  it('returns null mode when repo is not configured', () => {
    const result = getLaccRoot(TMP_REPO);
    expect(result.mode).toBe('none');
    expect(result.root).toBeNull();
  });
});

describe('getTaskStoragePath', () => {
  it('returns path inside local .lacc/ for local mode', () => {
    fs.mkdirSync(path.join(TMP_REPO, '.lacc', 'tasks', 'task-123'), { recursive: true });
    const p = getTaskStoragePath(TMP_REPO, 'task-123');
    expect(p).toBe(path.join(TMP_REPO, '.lacc', 'tasks', 'task-123'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd packages/orchestrator && npx vitest run tests/unit/storage/lacc.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create `packages/orchestrator/src/storage/lacc.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getRepoName } from '../config/registry.js';

const DATA_DIR = process.env.LACC_DATA_DIR_OVERRIDE ?? path.join(os.homedir(), '.lacc-data');

export type LaccMode = 'local' | 'global' | 'none';

export interface LaccRoot {
  mode: LaccMode;
  root: string | null;
}

/**
 * Resolve the .lacc root for a given repo.
 * - local:  <repo>/.lacc/ exists as a directory
 * - global: repo is registered in registry.json
 * - none:   unconfigured — UI should prompt to init
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
  const name = getRepoName(repoPath);
  if (name) {
    return {
      mode: 'global',
      root: path.join(DATA_DIR, 'repos', name),
    };
  }

  return { mode: 'none', root: null };
}

/**
 * Get (and create) the task storage path for a given task.
 * Returns null if repo has no .lacc configuration.
 */
export function getTaskStoragePath(repoPath: string, taskId: string): string | null {
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
      'commitLacc: false',
      'baseBranch: main',
      'defaultWorkflow: null',
    ].join('\n') + '\n');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**
```bash
cd packages/orchestrator && npx vitest run tests/unit/storage/lacc.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add packages/orchestrator/src/storage/lacc.ts packages/orchestrator/tests/unit/storage/lacc.test.ts
git commit -m "feat(storage): add .lacc root resolution and task storage path helpers"
```

---

### Task 8: Container mounts + `--add-dir` flags

**Files:**
- Modify: `packages/orchestrator/src/containers/lifecycle.ts`

- [ ] **Step 1: Update `configure()` to add `/lacc-global` bind and task storage bind**

In the `configure()` function, after the existing `binds` array is built, add:

```typescript
  // Mount global LACC library read-only
  const laccDataDir = path.join(os.homedir(), '.lacc-data');
  binds.push(`${laccDataDir}:/lacc-global:ro`);

  // Mount task storage at /workspace/.lacc if repo uses global mode
  const { getContainerTaskMount } = await import('../storage/lacc.js');
  const { hostPath, needsExplicitMount } = getContainerTaskMount(
    task.repoPath,
    worktreePath,
    task.id,
  );
  if (needsExplicitMount && hostPath) {
    binds.push(`${hostPath}:/workspace/.lacc`);
  }
```

- [ ] **Step 2: Update `startClaude()` to add `--add-dir` flags**

In `startClaude()`, after the existing `cmd.push('--add-dir', '/original-repo')` line, add:

```typescript
  cmd.push('--add-dir', '/workspace/.lacc');
  cmd.push('--add-dir', '/lacc-global');
```

- [ ] **Step 3: Type-check**
```bash
cd packages/orchestrator && npx tsc --noEmit
```

- [ ] **Step 4: Run tests**
```bash
cd packages/orchestrator && npx vitest run
```

- [ ] **Step 5: Commit**
```bash
git add packages/orchestrator/src/containers/lifecycle.ts
git commit -m "feat(containers): add /lacc-global mount and --add-dir flags for task agents"
```

---

### Task 9: New template variables

**Files:**
- Modify: `packages/orchestrator/src/workflows/variables.ts`

- [ ] **Step 1: Write failing test**

In `packages/orchestrator/tests/unit/workflows/variables.test.ts` (create if not exists, or add to existing):
```typescript
import { describe, it, expect } from 'vitest';
import { resolvePrompt } from '../../../src/workflows/variables.js';

// Minimal task stub
const task = {
  id: 'task-abc-123',
  branchName: 'feat/test',
  repoPath: '/repos/test',
} as any;

describe('resolvePrompt — new task_* variables', () => {
  it('resolves {{task_dir}}', () => {
    const result = resolvePrompt('dir: {{task_dir}}', task, {});
    expect(result).toBe('dir: /workspace/.lacc/tasks/task-abc-123/');
  });

  it('resolves {{task_spec}}', () => {
    const result = resolvePrompt('{{task_spec}}', task, {});
    expect(result).toBe('/workspace/.lacc/tasks/task-abc-123/.spec.md');
  });

  it('resolves {{memory}}', () => {
    const result = resolvePrompt('{{memory}}', task, {});
    expect(result).toBe('/workspace/.lacc/tasks/task-abc-123/memory.md');
  });

  it('does not change existing {{spec}} behaviour', () => {
    const result = resolvePrompt('{{spec}}', task, { docsDir: 'ai-docs' });
    expect(result).toBe('/workspace/ai-docs/.spec.md');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd packages/orchestrator && npx vitest run tests/unit/workflows/variables.test.ts
```
Expected: FAIL

- [ ] **Step 3: Add new variables to `resolvePrompt`**

In `variables.ts`, add to the `vars` object inside `resolvePrompt`:
```typescript
    '{{task_dir}}':    `/workspace/.lacc/tasks/${task.id}/`,
    '{{task_spec}}':   `/workspace/.lacc/tasks/${task.id}/.spec.md`,
    '{{task_plan}}':   `/workspace/.lacc/tasks/${task.id}/.plan.md`,
    '{{task_review}}': `/workspace/.lacc/tasks/${task.id}/.review.md`,
    '{{memory}}':      `/workspace/.lacc/tasks/${task.id}/memory.md`,
```

- [ ] **Step 4: Run test to verify it passes**
```bash
cd packages/orchestrator && npx vitest run tests/unit/workflows/variables.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add packages/orchestrator/src/workflows/variables.ts packages/orchestrator/tests/unit/workflows/variables.test.ts
git commit -m "feat(workflows): add task_dir, task_spec, task_plan, task_review, memory template variables"
```

---

### Task 10: `POST /tasks/:id/archive` route

**Files:**
- Modify: `packages/orchestrator/src/routes/tasks.ts`
- Create: `packages/orchestrator/tests/api/archive.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/orchestrator/tests/api/archive.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../helpers/app.js';
import { createTestTask } from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let taskId: string;

beforeEach(async () => {
  app = await buildApp();
  const task = createTestTask({ status: 'DONE', archiveState: 'alive' });
  taskId = task.id;
});

describe('POST /tasks/:id/archive', () => {
  it('returns 400 for invalid level', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/archive`,
      payload: { level: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('archives a task (level: archived)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/archive`,
      payload: { level: 'archived' },
    });
    expect(res.statusCode).toBe(200);
    const task = JSON.parse(res.body);
    expect(task.archiveState).toBe('archived');
  });

  it('returns 404 for unknown task', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/nonexistent/archive',
      payload: { level: 'archived' },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd packages/orchestrator && npx vitest run tests/api/archive.test.ts
```
Expected: FAIL

- [ ] **Step 3: Add `POST /tasks/:id/archive` handler in `routes/tasks.ts`**

Find the section where routes are registered and add (removing any existing `/close` handler):
```typescript
  // Archive task — set retention level
  fastify.post<{ Params: { id: string }; Body: { level: string } }>(
    '/tasks/:id/archive',
    async (req, reply) => {
      const { id } = req.params;
      const { level } = req.body;

      if (!['archived', 'summary', 'deleted'].includes(level)) {
        return reply.code(400).send({ error: 'level must be archived, summary, or deleted' });
      }

      const task = getTask(id);
      if (!task) return reply.code(404).send({ error: 'Task not found' });

      updateTask(id, { archiveState: level as import('@lacc/shared').ArchiveState });

      // If deleting task artifacts, clean them up immediately
      if (level === 'summary' || level === 'deleted') {
        const { getTaskStoragePath } = await import('../storage/lacc.js');
        const storagePath = getTaskStoragePath(task.repoPath, id);
        if (storagePath && fs.existsSync(storagePath)) {
          const toDelete = level === 'deleted'
            ? [storagePath]
            : ['.spec.md', '.plan.md', '.review.md'].map(f => path.join(storagePath, f));
          for (const p of toDelete) {
            if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
          }
        }
      }

      const updated = getTask(id)!;
      broadcastWsEvent({ type: 'TASK_UPDATED', task: updated });
      return updated;
    }
  );
```

- [ ] **Step 4: Run test to verify it passes**
```bash
cd packages/orchestrator && npx vitest run tests/api/archive.test.ts
```
Expected: PASS

- [ ] **Step 5: Run all tests**
```bash
cd packages/orchestrator && npx vitest run
```

- [ ] **Step 6: Commit**
```bash
git add packages/orchestrator/src/routes/tasks.ts packages/orchestrator/tests/api/archive.test.ts
git commit -m "feat(routes): add POST /tasks/:id/archive, remove POST /tasks/:id/close"
```

---

## Phase 2 — Memory & Git Operations

### Task 11: Install `simple-git` + git operations wrapper

**Files:**
- Create: `packages/orchestrator/src/git/operations.ts`
- Create: `packages/orchestrator/tests/unit/git/operations.test.ts`

- [ ] **Step 1: Install `simple-git`**
```bash
cd packages/orchestrator && npm install simple-git
```

- [ ] **Step 2: Write failing test**

Create `packages/orchestrator/tests/unit/git/operations.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    pull: vi.fn().mockResolvedValue({}),
    push: vi.fn().mockResolvedValue({}),
    stash: vi.fn().mockResolvedValue(''),
    rebase: vi.fn().mockRejectedValue(Object.assign(new Error('conflict'), { git: { conflicts: ['src/foo.ts'] } })),
    status: vi.fn().mockResolvedValue({ conflicted: ['src/foo.ts'] }),
    raw: vi.fn().mockResolvedValue(''),
  })),
}));

const { gitPull, gitPush, gitRebase, gitStash } = await import('../../../src/git/operations.js');

describe('git operations', () => {
  it('gitPull returns ok:true on success', async () => {
    const result = await gitPull('/workspace');
    expect(result.ok).toBe(true);
  });

  it('gitRebase returns conflict info on conflict', async () => {
    const result = await gitRebase('/workspace', 'main');
    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.conflictedFiles).toContain('src/foo.ts');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**
```bash
cd packages/orchestrator && npx vitest run tests/unit/git/operations.test.ts
```
Expected: FAIL

- [ ] **Step 4: Create `packages/orchestrator/src/git/operations.ts`**

```typescript
import simpleGit from 'simple-git';

export interface GitResult {
  ok: boolean;
  conflict?: boolean;
  conflictedFiles?: string[];
  message?: string;
}

export async function gitPull(worktreePath: string): Promise<GitResult> {
  try {
    await simpleGit(worktreePath).pull();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

export async function gitPush(worktreePath: string): Promise<GitResult> {
  try {
    await simpleGit(worktreePath).push();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

export async function gitRebase(worktreePath: string, branch: string = 'main'): Promise<GitResult> {
  const git = simpleGit(worktreePath);
  try {
    await git.rebase([branch]);
    return { ok: true };
  } catch {
    // Check for conflicts
    try {
      const status = await git.status();
      if (status.conflicted.length > 0) {
        return {
          ok: false,
          conflict: true,
          conflictedFiles: status.conflicted,
          message: `Rebase conflict in ${status.conflicted.length} file(s). Resolve manually or reset.`,
        };
      }
    } catch {
      // fallthrough
    }
    return { ok: false, message: 'Rebase failed' };
  }
}

export async function gitReset(worktreePath: string, hard: boolean = false): Promise<GitResult> {
  try {
    const git = simpleGit(worktreePath);
    if (hard) {
      await git.reset(['--hard', 'HEAD']);
    } else {
      await git.reset(['HEAD']);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

export async function gitStash(worktreePath: string): Promise<GitResult> {
  try {
    await simpleGit(worktreePath).stash();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

export async function gitStashPop(worktreePath: string): Promise<GitResult> {
  try {
    await simpleGit(worktreePath).stash(['pop']);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**
```bash
cd packages/orchestrator && npx vitest run tests/unit/git/operations.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add packages/orchestrator/src/git/operations.ts packages/orchestrator/tests/unit/git/operations.test.ts packages/orchestrator/package.json package-lock.json
git commit -m "feat(git): add simple-git operations wrapper with conflict detection"
```

---

### Task 12: Git operation routes

**Files:**
- Create: `packages/orchestrator/src/routes/git.ts`
- Create: `packages/orchestrator/tests/api/git.test.ts`
- Modify: `packages/orchestrator/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `packages/orchestrator/tests/api/git.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../helpers/app.js';
import { createTestTask } from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

vi.mock('../../src/git/operations.js', () => ({
  gitPull: vi.fn().mockResolvedValue({ ok: true }),
  gitPush: vi.fn().mockResolvedValue({ ok: true }),
  gitRebase: vi.fn().mockResolvedValue({ ok: true }),
  gitReset: vi.fn().mockResolvedValue({ ok: true }),
  gitStash: vi.fn().mockResolvedValue({ ok: true }),
  gitStashPop: vi.fn().mockResolvedValue({ ok: true }),
}));

let app: FastifyInstance;
let taskId: string;

beforeEach(async () => {
  app = await buildApp();
  const task = createTestTask({ status: 'DONE', worktreePath: '/workspace/test' });
  taskId = task.id;
});

describe('Git routes', () => {
  it('POST /tasks/:id/git/pull returns ok', async () => {
    const res = await app.inject({ method: 'POST', url: `/tasks/${taskId}/git/pull` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it('POST /tasks/:id/git/push returns ok', async () => {
    const res = await app.inject({ method: 'POST', url: `/tasks/${taskId}/git/push` });
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 for unknown task', async () => {
    const res = await app.inject({ method: 'POST', url: '/tasks/nope/git/pull' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when task has no worktree', async () => {
    const noWorktreeTask = createTestTask({ status: 'DONE', worktreePath: null });
    const res = await app.inject({ method: 'POST', url: `/tasks/${noWorktreeTask.id}/git/pull` });
    expect(res.statusCode).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
```bash
cd packages/orchestrator && npx vitest run tests/api/git.test.ts
```
Expected: FAIL

- [ ] **Step 3: Create `packages/orchestrator/src/routes/git.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { getTask } from '../db/tasks.js';
import { gitPull, gitPush, gitRebase, gitReset, gitStash, gitStashPop } from '../git/operations.js';

export async function registerGitRoutes(fastify: FastifyInstance): Promise<void> {
  function getWorktree(id: string, reply: any) {
    const task = getTask(id);
    if (!task) { reply.code(404).send({ error: 'Task not found' }); return null; }
    if (!task.worktreePath) { reply.code(409).send({ error: 'Task has no worktree' }); return null; }
    return task.worktreePath;
  }

  fastify.post<{ Params: { id: string } }>('/tasks/:id/git/pull', async (req, reply) => {
    const wt = getWorktree(req.params.id, reply);
    if (!wt) return;
    return gitPull(wt);
  });

  fastify.post<{ Params: { id: string } }>('/tasks/:id/git/push', async (req, reply) => {
    const wt = getWorktree(req.params.id, reply);
    if (!wt) return;
    return gitPush(wt);
  });

  fastify.post<{ Params: { id: string }; Body: { branch?: string } }>(
    '/tasks/:id/git/rebase', async (req, reply) => {
      const wt = getWorktree(req.params.id, reply);
      if (!wt) return;
      return gitRebase(wt, req.body?.branch);
    }
  );

  fastify.post<{ Params: { id: string }; Body: { hard?: boolean } }>(
    '/tasks/:id/git/reset', async (req, reply) => {
      const wt = getWorktree(req.params.id, reply);
      if (!wt) return;
      return gitReset(wt, req.body?.hard);
    }
  );

  fastify.post<{ Params: { id: string } }>('/tasks/:id/git/stash', async (req, reply) => {
    const wt = getWorktree(req.params.id, reply);
    if (!wt) return;
    return gitStash(wt);
  });

  fastify.post<{ Params: { id: string } }>('/tasks/:id/git/stash/pop', async (req, reply) => {
    const wt = getWorktree(req.params.id, reply);
    if (!wt) return;
    return gitStashPop(wt);
  });
}
```

- [ ] **Step 4: Register routes in `index.ts`**

In `packages/orchestrator/src/index.ts`, look at how existing routes are registered — they are called directly as `registerXRoutes(fastify)`, **not** via `fastify.register()`. Add the same pattern:

```typescript
import { registerGitRoutes } from './routes/git.js';
// inside the server setup block alongside other route registrations:
registerGitRoutes(fastify);
```

- [ ] **Step 5: Run test to verify it passes**
```bash
cd packages/orchestrator && npx vitest run tests/api/git.test.ts
```
Expected: PASS

- [ ] **Step 6: Run all tests**
```bash
cd packages/orchestrator && npx vitest run
```

- [ ] **Step 7: Commit**
```bash
git add packages/orchestrator/src/routes/git.ts packages/orchestrator/src/index.ts packages/orchestrator/tests/api/git.test.ts
git commit -m "feat(routes): add git operation routes (pull, push, rebase, reset, stash)"
```

---

### Task 13: Memory snapshot generation

**Files:**
- Create: `packages/orchestrator/src/memory/snapshot.ts`
- Modify: `packages/orchestrator/src/routes/tasks.ts`
- Create: `packages/orchestrator/tests/api/memory.test.ts`

- [ ] **Step 1: Create `packages/orchestrator/src/memory/snapshot.ts`**

```typescript
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Task } from '@lacc/shared';
import { getDiff } from '../git/worktree.js';
import { getDb } from '../db/init.js';
import { getTaskStoragePath } from '../storage/lacc.js';

function readIfExists(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

function extractAssistantText(output: string): string {
  // Extract text content from stream-json output
  const lines = output.split('\n').filter(Boolean);
  const parts: string[] = [];
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
        for (const block of msg.message.content) {
          if (block.type === 'text') parts.push(block.text);
        }
      }
    } catch { /* skip non-JSON lines */ }
  }
  return parts.join('') || output;
}

function getUserMessages(taskId: string): string {
  const db = getDb();
  try {
    const rows = db.prepare(
      `SELECT content FROM logs WHERE task_id = ? ORDER BY created_at ASC`
    ).all(taskId) as Array<{ content: string }>;
    // Extract user messages from the log chunks
    return rows
      .map(r => {
        try {
          const parsed = JSON.parse(r.content);
          if (parsed.type === 'user') return parsed.message?.content?.[0]?.text ?? '';
          return '';
        } catch { return ''; }
      })
      .filter(Boolean)
      .join('\n\n');
  } catch { return ''; }
}

export async function generateMemorySnapshot(task: Task): Promise<string> {
  const storagePath = getTaskStoragePath(task.repoPath, task.id);

  let diffSummary = 'No diff available.';
  if (task.worktreePath && task.baseBranch) {
    try {
      const diff = await getDiff(task.worktreePath, task.baseBranch);
      diffSummary = diff.files.map(f => `${f.path} (+${f.additions}/-${f.deletions})`).join('\n');
    } catch { /* ignore */ }
  }

  const contextParts: string[] = [
    `Original prompt:\n${task.prompt}`,
  ];

  if (storagePath) {
    for (const file of ['.spec.md', '.plan.md', '.review.md']) {
      const content = readIfExists(path.join(storagePath, file));
      if (content) contextParts.push(`${file}:\n${content}`);
    }
  }

  contextParts.push(`Files changed:\n${diffSummary}`);

  const userMessages = getUserMessages(task.id);
  if (userMessages) contextParts.push(`User feedback during task:\n${userMessages}`);

  const context = contextParts.join('\n\n---\n\n');

  const prompt = `Summarise this completed development task for future reference.
Produce a concise memory.md covering:
- What was built (2-3 sentences)
- Key decisions made and why
- Files changed (from diff summary)
- Review findings and how addressed (if any)
- Deferred work or known issues
- Context a future developer needs to continue

Be concise. This is a reference document, not a report. Use markdown headers.

Context:
${context}`;

  return new Promise<string>((resolve) => {
    let output = '';
    const proc = spawn('claude', [
      '-p',
      '--output-format', 'stream-json',
      '--model', 'claude-haiku-4-5-20251001',
      '--dangerously-skip-permissions',
      prompt,
    ], { env: { ...process.env } });

    proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    proc.on('close', () => resolve(extractAssistantText(output) || output));
    proc.on('error', () => resolve(''));
  });
}

export async function saveMemorySnapshot(task: Task): Promise<string> {
  const content = await generateMemorySnapshot(task);
  if (!content) return '';

  const storagePath = getTaskStoragePath(task.repoPath, task.id);
  if (storagePath) {
    fs.writeFileSync(path.join(storagePath, 'memory.md'), content, 'utf-8');
  }

  return content;
}

export function readMemorySnapshot(repoPath: string, taskId: string): string | null {
  const storagePath = getTaskStoragePath(repoPath, taskId);
  if (!storagePath) return null;
  return readIfExists(path.join(storagePath, 'memory.md'));
}
```

- [ ] **Step 2: Write API test**

Create `packages/orchestrator/tests/api/memory.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildApp } from '../helpers/app.js';
import { createTestTask } from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

vi.mock('../../src/memory/snapshot.js', () => ({
  saveMemorySnapshot: vi.fn().mockResolvedValue('# Memory\n\nTest memory content.'),
  readMemorySnapshot: vi.fn().mockReturnValue('# Memory\n\nTest memory content.'),
}));

let app: FastifyInstance;
let taskId: string;

beforeEach(async () => {
  app = await buildApp();
  const task = createTestTask({ status: 'DONE' });
  taskId = task.id;
});

describe('Memory routes', () => {
  it('POST /tasks/:id/memory-snapshot returns content', async () => {
    const res = await app.inject({ method: 'POST', url: `/tasks/${taskId}/memory-snapshot` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).content).toContain('Memory');
  });

  it('GET /tasks/:id/memory returns memory content', async () => {
    const res = await app.inject({ method: 'GET', url: `/tasks/${taskId}/memory` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).content).toContain('Memory');
  });

  it('GET /tasks/:id/memory returns 404 when no memory', async () => {
    const { readMemorySnapshot } = await import('../../src/memory/snapshot.js');
    vi.mocked(readMemorySnapshot).mockReturnValueOnce(null);
    const res = await app.inject({ method: 'GET', url: `/tasks/${taskId}/memory` });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**
```bash
cd packages/orchestrator && npx vitest run tests/api/memory.test.ts
```
Expected: FAIL

- [ ] **Step 4: Add memory routes to `routes/tasks.ts`**

```typescript
  // Generate memory snapshot
  fastify.post<{ Params: { id: string } }>('/tasks/:id/memory-snapshot', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.code(404).send({ error: 'Task not found' });
    const { saveMemorySnapshot } = await import('../memory/snapshot.js');
    const content = await saveMemorySnapshot(task);
    return { content };
  });

  // Read memory snapshot
  fastify.get<{ Params: { id: string } }>('/tasks/:id/memory', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.code(404).send({ error: 'Task not found' });
    const { readMemorySnapshot } = await import('../memory/snapshot.js');
    const content = readMemorySnapshot(task.repoPath, task.id);
    if (!content) return reply.code(404).send({ error: 'No memory snapshot found' });
    return { content };
  });
```

- [ ] **Step 5: Run test to verify it passes**
```bash
cd packages/orchestrator && npx vitest run tests/api/memory.test.ts
```
Expected: PASS

- [ ] **Step 6: Run all tests**
```bash
cd packages/orchestrator && npx vitest run
```

- [ ] **Step 7: Commit**
```bash
git add packages/orchestrator/src/memory/snapshot.ts packages/orchestrator/src/routes/tasks.ts packages/orchestrator/tests/api/memory.test.ts
git commit -m "feat(memory): add snapshot generation and memory routes"
```

---

## Phase 3 — UI

### Task 14: Update UI `Task` type usage

**Files:**
- Modify: `packages/ui/src/` — any files referencing `flaggedForDelete` or `worktreeAutoDeleteHours`

- [ ] **Step 1: Find all UI references to removed fields**
```bash
cd packages/ui && grep -r "flaggedForDelete\|worktreeAutoDeleteHours" src/
```

- [ ] **Step 2: Replace with `archiveState` equivalents**

For each reference:
- `task.flaggedForDelete` → `task.archiveState !== 'alive'`
- Any delete-related UI logic → use `archiveState` check instead
- Settings field for `worktreeAutoDeleteHours` → replace with `globalLaccPath` field (Task 17)

- [ ] **Step 3: Type-check UI**
```bash
cd packages/ui && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Run UI tests**
```bash
cd packages/ui && npx vitest run
```

- [ ] **Step 5: Commit**
```bash
git add packages/ui/src/
git commit -m "fix(ui): update Task type usage for archiveState"
```

---

### Task 15: `ArchiveModal` component

**Files:**
- Create: `packages/ui/src/modals/ArchiveModal.tsx`

- [ ] **Step 1: Create `packages/ui/src/modals/ArchiveModal.tsx`**

```typescript
import { useState } from 'react';
import type { Task } from '@lacc/shared';
import { ModalOverlay } from '../components/ui/ModalOverlay.js';
import { ModalHeader } from '../components/ui/ModalHeader.js';
import { ModalFooter } from '../components/ui/ModalFooter.js';

type ArchiveLevel = 'archived' | 'summary' | 'deleted';

interface Props {
  task: Task;
  onConfirm: (level: ArchiveLevel) => void;
  onClose: () => void;
}

const LEVELS: Array<{ value: ArchiveLevel; label: string; description: string }> = [
  { value: 'archived', label: 'Archive', description: 'Keep memory + all artifacts, remove worktree' },
  { value: 'summary', label: 'Summary only', description: 'Keep memory.md only, remove everything else' },
  { value: 'deleted', label: 'Delete all', description: 'Remove everything including memory' },
];

export function ArchiveModal({ task, onConfirm, onClose }: Props) {
  const [selected, setSelected] = useState<ArchiveLevel>('archived');

  return (
    <ModalOverlay onClose={onClose}>
      <ModalHeader title="Archive task?" onClose={onClose} />

      <div className="px-4 py-3 space-y-3">
        <p className="text-text-secondary text-sm">
          Branch <span className="text-text-primary font-mono">{task.branchName}</span> will
          not be deleted — push first if needed.
        </p>

        <div className="space-y-2">
          {LEVELS.map(({ value, label, description }) => (
            <label
              key={value}
              className="flex items-start gap-3 p-3 rounded cursor-pointer bg-surface-raised hover:bg-surface-hover duration-100"
            >
              <input
                type="radio"
                name="archiveLevel"
                value={value}
                checked={selected === value}
                onChange={() => setSelected(value)}
                className="mt-0.5"
              />
              <div>
                <div className="text-text-primary text-sm font-medium">{label}</div>
                <div className="text-text-secondary text-xs">{description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <ModalFooter
        onCancel={onClose}
        onConfirm={() => onConfirm(selected)}
        confirmLabel="Confirm"
        confirmVariant={selected === 'deleted' ? 'danger' : 'primary'}
      />
    </ModalOverlay>
  );
}
```

- [ ] **Step 2: Type-check**
```bash
cd packages/ui && npx tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add packages/ui/src/modals/ArchiveModal.tsx
git commit -m "feat(ui): add ArchiveModal component"
```

---

### Task 16: ActionBar restructure — three zones

**Files:**
- Modify: `packages/ui/src/components/ActionBar.tsx`

- [ ] **Step 1: Add new props to ActionBar interface**

The current `Props` interface has: `task, onComplete, onDiscard, onFeedback, onOpenEditor, onOpenBrowser, onKill, onPause, onResume, onRestart, onMemory, onCommit, onMerge, onWorkflowContinue, onWorkflowSkip, onWorkflowRerun`.

**Keep all existing props.** Add these new ones:
```typescript
  onSaveMemory: () => void;
  onArchive: (level: 'archived' | 'summary' | 'deleted') => void;
  onGitPull: () => void;
  onGitPush: () => void;
  onGitRebase: () => void;
  onGitStash: () => void;
```

- [ ] **Step 2: Add Git operations zone**

Git ops are shown whenever `task.worktreePath` is not null, across all status branches. Add this block **inside every status branch** (WORKING, PAUSED, READY, DONE/KILLED/FAILED), immediately before the closing `</div>`:

```typescript
{task.worktreePath && (
  <>
    <span style={{ width: 1, height: 16, background: '#2a2a2a', margin: '0 4px' }} />
    <Button variant="ghost" size="sm" onClick={onGitRebase}>Rebase</Button>
    <Button variant="ghost" size="sm" onClick={onGitPull}>Pull</Button>
    <Button variant="ghost" size="sm" onClick={onGitPush}>Push</Button>
    <Button variant="ghost" size="sm" onClick={onGitStash}>Stash</Button>
  </>
)}
```

- [ ] **Step 3: Add lifecycle zone to terminal states**

In the final `return` block (DONE / KILLED / FAILED), add after the existing Commit/Merge buttons:
```typescript
<span style={{ width: 1, height: 16, background: '#2a2a2a', margin: '0 4px' }} />
<Button variant="ghost" size="sm" onClick={onSaveMemory}>Save memory</Button>
<Button variant="ghost" size="sm" onClick={() => setShowArchive(true)}>Archive ▾</Button>
```

Add state for the archive modal:
```typescript
const [showArchive, setShowArchive] = useState(false);
```

And at the bottom of the component render, before the closing tag:
```typescript
{showArchive && (
  <ArchiveModal
    task={task}
    onConfirm={(level) => { onArchive(level); setShowArchive(false); }}
    onClose={() => setShowArchive(false)}
  />
)}
```

- [ ] **Step 4: Update `DetailPanel.tsx` to pass the new props**

`DetailPanel` owns the `ActionBar` call. Add the new callbacks:
- `onSaveMemory`: call `POST /tasks/${task.id}/memory-snapshot`, then re-fetch memory to update the memory tab
- `onArchive`: call `POST /tasks/${task.id}/archive` with the level
- `onGitPull/Push/Rebase/Stash`: call the respective `POST /tasks/${task.id}/git/*` endpoints and show a notification on result

Also thread the new props down from `App.tsx` → `DetailPanel` → `ActionBar` as needed.

- [ ] **Step 4: Type-check**
```bash
cd packages/ui && npx tsc --noEmit
```

- [ ] **Step 5: Commit**
```bash
git add packages/ui/src/components/ActionBar.tsx
git commit -m "feat(ui): restructure ActionBar into agent/git/lifecycle zones"
```

---

### Task 17: Memory tab in `DetailPanel`

**Files:**
- Modify: `packages/ui/src/components/DetailPanel.tsx`

- [ ] **Step 1: Add memory tab logic**

In `DetailPanel.tsx`:

1. Add `'memory'` to the `TabId` type:
```typescript
type TabId = 'feed' | 'diff' | 'preview' | 'workflow' | 'memory';
```

2. Add state for memory content:
```typescript
const [memoryContent, setMemoryContent] = useState<string | null>(null);
```

3. Fetch memory when task changes (add to `useEffect`):
```typescript
useEffect(() => {
  if (!task) { setMemoryContent(null); return; }
  fetch(`/api/tasks/${task.id}/memory`)
    .then(r => r.ok ? r.json() : null)
    .then(data => setMemoryContent(data?.content ?? null))
    .catch(() => setMemoryContent(null));
}, [task?.id]);
```

4. Add memory tab to the tabs array when `memoryContent` is not null:
```typescript
if (memoryContent) {
  result.push({ id: 'memory', label: 'memory' });
}
```

5. Render memory tab content in the tab body section:
```typescript
{tab === 'memory' && memoryContent && (
  <div className="p-4 overflow-y-auto h-full">
    <div className="flex justify-end mb-2">
      <button
        onClick={() => handleRegenerateMemory()}
        className="text-xs text-text-secondary hover:text-text-primary duration-100"
      >
        Regenerate
      </button>
    </div>
    <ReactMarkdown className="prose prose-invert prose-sm max-w-none">
      {memoryContent}
    </ReactMarkdown>
  </div>
)}
```

6. Add `handleRegenerateMemory` — calls `POST /tasks/:id/memory-snapshot`, then updates `memoryContent`.

- [ ] **Step 2: Install react-markdown if not present**
```bash
cd packages/ui && npm ls react-markdown 2>/dev/null || npm install react-markdown
```

- [ ] **Step 3: Type-check**
```bash
cd packages/ui && npx tsc --noEmit
```

- [ ] **Step 4: Run UI tests**
```bash
cd packages/ui && npx vitest run
```

- [ ] **Step 5: Commit**
```bash
git add packages/ui/src/components/DetailPanel.tsx packages/ui/package.json package-lock.json
git commit -m "feat(ui): add memory tab to DetailPanel"
```

---

### Task 18: Task list archive state indicator + `globalLaccPath` setting

**Files:**
- Modify: `packages/ui/src/components/TaskList.tsx` (or wherever task items render)
- Modify: `packages/ui/src/modals/SettingsModal.tsx`

- [ ] **Step 1: Add archive state indicator to task list items**

Find where task items render their status. Add a small secondary label alongside the status dot when `task.archiveState !== 'alive'`:

```typescript
{task.archiveState !== 'alive' && (
  <span className="text-xs text-text-muted ml-1">
    {task.archiveState === 'archived' ? 'archived' : task.archiveState === 'summary' ? 'summary' : ''}
  </span>
)}
```

- [ ] **Step 2: Add `globalLaccPath` to Settings modal**

In `SettingsModal.tsx`, find the settings form. Remove the `worktreeAutoDeleteHours` field. Add a `globalLaccPath` field:

```typescript
<FormField
  label="Global .lacc path"
  description="Where LACC stores config and artifacts for non-local repos"
  value={config.globalLaccPath ?? '~/.lacc-data'}
  onChange={v => patchConfig({ globalLaccPath: v })}
/>
```

- [ ] **Step 3: Type-check**
```bash
cd packages/ui && npx tsc --noEmit
```

- [ ] **Step 4: Run all tests**
```bash
cd packages/ui && npx vitest run
cd packages/orchestrator && npx vitest run
```

- [ ] **Step 5: Commit**
```bash
git add packages/ui/src/
git commit -m "feat(ui): archive state indicator, globalLaccPath setting, remove worktreeAutoDeleteHours"
```

---

## Final verification

- [ ] **Build both packages**
```bash
npm run build --workspace=packages/ui
npm run build --workspace=packages/orchestrator
```

- [ ] **Type-check everything**
```bash
npx tsc --noEmit --project packages/shared/tsconfig.json
npx tsc --noEmit --project packages/orchestrator/tsconfig.json
npx tsc --noEmit --project packages/ui/tsconfig.json
```

- [ ] **Run all tests**
```bash
cd packages/orchestrator && npx vitest run
cd packages/ui && npx vitest run
```

- [ ] **Final commit**
```bash
git add -A
git commit -m "feat: task continuity — archive, memory snapshots, git ops, .lacc storage"
```
