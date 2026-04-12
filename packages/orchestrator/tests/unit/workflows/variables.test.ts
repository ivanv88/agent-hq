import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolvePrompt, resolveIncludes, resolveStagePrompt, resolveHostPath } from '../../../src/workflows/variables.js';
import type { Task, WorkflowDefinition } from '@lacc/shared';

vi.mock('../../../src/git/worktree.js', () => ({
  getDiff: vi.fn(),
}));

import { getDiff } from '../../../src/git/worktree.js';
const mockGetDiff = vi.mocked(getDiff);

const baseTask = {
  id: 'task-abc-123',
  branchName: 'feat/auth-jwt',
  worktreePath: '/tmp/test-worktree',
  baseBranch: 'main',
  repoPath: '/tmp/test-repo',
} as Task;

const baseWorkflow = { docsDir: 'ai-docs' } as WorkflowDefinition;

// ── resolvePrompt ─────────────────────────────────────────────────────────────

describe('resolvePrompt', () => {
  it('resolves {{docs_dir}}', () => {
    const result = resolvePrompt('Read {{docs_dir}}/spec.md', baseTask, baseWorkflow);
    expect(result).toBe('Read /workspace/ai-docs/spec.md');
  });

  it('resolves {{user_docs}} (primary spec alias)', () => {
    const result = resolvePrompt('Read {{user_docs}}/spec.md', baseTask, baseWorkflow);
    expect(result).toBe('Read /workspace/ai-docs/spec.md');
  });

  it('{{user_docs}} and {{docs_dir}} resolve to the same path', () => {
    const a = resolvePrompt('{{user_docs}}', baseTask, baseWorkflow);
    const b = resolvePrompt('{{docs_dir}}', baseTask, baseWorkflow);
    expect(a).toBe(b);
  });

  it('resolves {{workspace}}', () => {
    const result = resolvePrompt('cd {{workspace}}', baseTask, baseWorkflow);
    expect(result).toBe('cd /workspace');
  });

  it('resolves {{branch}}', () => {
    const result = resolvePrompt('Branch: {{branch}}', baseTask, baseWorkflow);
    expect(result).toBe('Branch: feat/auth-jwt');
  });

  it('resolves {{repo}}', () => {
    const result = resolvePrompt('Repo: {{repo}}', baseTask, baseWorkflow);
    expect(result).toBe('Repo: /original-repo');
  });

  it('resolves shorthand variables', () => {
    const result = resolvePrompt('Read {{spec}} and {{jira}}', baseTask, baseWorkflow);
    expect(result).toBe('Read /workspace/ai-docs/.spec.md and /workspace/ai-docs/.jira.md');
  });

  it('uses default ai-docs when docsDir not set', () => {
    const result = resolvePrompt('{{docs_dir}}', baseTask, {});
    expect(result).toBe('/workspace/ai-docs');
  });

  it('uses custom docsDir', () => {
    const result = resolvePrompt('{{docs_dir}}', baseTask, { docsDir: 'custom-docs' });
    expect(result).toBe('/workspace/custom-docs');
  });

  it('leaves unknown variables as-is', () => {
    const result = resolvePrompt('Hello {{unknown}}', baseTask, baseWorkflow);
    expect(result).toBe('Hello {{unknown}}');
  });

  it('resolves multiple variables in one prompt', () => {
    const result = resolvePrompt(
      'Read {{jira}} and write to {{spec}} in {{workspace}}',
      baseTask,
      baseWorkflow,
    );
    expect(result).toBe(
      'Read /workspace/ai-docs/.jira.md and write to /workspace/ai-docs/.spec.md in /workspace',
    );
  });

  // New task-related variables
  it('resolves {{task_dir}}', () => {
    const result = resolvePrompt('dir: {{task_dir}}', baseTask, baseWorkflow);
    expect(result).toBe('dir: /workspace/.lacc/tasks/task-abc-123/');
  });

  it('resolves {{task_spec}}', () => {
    const result = resolvePrompt('{{task_spec}}', baseTask, baseWorkflow);
    expect(result).toBe('/workspace/.lacc/tasks/task-abc-123/.spec.md');
  });

  it('resolves {{task_plan}}', () => {
    const result = resolvePrompt('{{task_plan}}', baseTask, baseWorkflow);
    expect(result).toBe('/workspace/.lacc/tasks/task-abc-123/.plan.md');
  });

  it('resolves {{task_review}}', () => {
    const result = resolvePrompt('{{task_review}}', baseTask, baseWorkflow);
    expect(result).toBe('/workspace/.lacc/tasks/task-abc-123/.review.md');
  });

  it('resolves {{memory}}', () => {
    const result = resolvePrompt('{{memory}}', baseTask, baseWorkflow);
    expect(result).toBe('/workspace/.lacc/tasks/task-abc-123/memory.md');
  });

  it('does not change existing {{spec}} behaviour', () => {
    const result = resolvePrompt('{{spec}}', baseTask, baseWorkflow);
    expect(result).toBe('/workspace/ai-docs/.spec.md');
  });
});

// ── resolveIncludes ───────────────────────────────────────────────────────────

describe('resolveIncludes', () => {
  let tmpRepo: string;
  let tmpGlobal: string;

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-repo-'));
    tmpGlobal = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-home-'));
    fs.mkdirSync(path.join(tmpRepo, '.lacc', 'templates'), { recursive: true });
    fs.mkdirSync(path.join(tmpGlobal, '.lacc-data', 'templates'), { recursive: true });
    vi.spyOn(os, 'homedir').mockReturnValue(tmpGlobal);
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
    fs.rmSync(tmpGlobal, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns prompt unchanged when no includes', async () => {
    const result = await resolveIncludes('No includes here', tmpRepo);
    expect(result).toBe('No includes here');
  });

  it('expands include from repo templates (with .md extension in directive)', async () => {
    fs.writeFileSync(path.join(tmpRepo, '.lacc', 'templates', 'ctx.md'), 'repo context');
    const result = await resolveIncludes('Before {{include:templates/ctx.md}} after', tmpRepo);
    expect(result).toBe('Before repo context after');
  });

  it('auto-appends .md extension', async () => {
    fs.writeFileSync(path.join(tmpRepo, '.lacc', 'templates', 'ctx.md'), 'auto md');
    const result = await resolveIncludes('{{include:templates/ctx}}', tmpRepo);
    expect(result).toBe('auto md');
  });

  it('leaves unknown include token as-is', async () => {
    const result = await resolveIncludes('{{include:templates/nonexistent}}', tmpRepo);
    expect(result).toBe('{{include:templates/nonexistent}}');
  });

  it('does not recursively expand includes inside included files', async () => {
    fs.writeFileSync(
      path.join(tmpRepo, '.lacc', 'templates', 'outer.md'),
      'outer {{include:templates/inner}}',
    );
    fs.writeFileSync(path.join(tmpRepo, '.lacc', 'templates', 'inner.md'), 'inner content');
    const result = await resolveIncludes('{{include:templates/outer}}', tmpRepo);
    // outer is expanded, but the {{include:templates/inner}} inside it is NOT
    expect(result).toBe('outer {{include:templates/inner}}');
  });
});

// ── resolveStagePrompt ────────────────────────────────────────────────────────

describe('resolveStagePrompt', () => {
  beforeEach(() => {
    mockGetDiff.mockReset();
  });

  it('does not call getDiff when {{diff}} is absent', async () => {
    const result = await resolveStagePrompt('Hello {{branch}}', baseTask, baseWorkflow);
    expect(mockGetDiff).not.toHaveBeenCalled();
    expect(result).toBe('Hello feat/auth-jwt');
  });

  it('calls getDiff and formats result when {{diff}} is present', async () => {
    mockGetDiff.mockResolvedValue({
      files: [{ path: 'src/foo.ts', additions: 10, deletions: 2, patch: '' }],
      totalAdditions: 10,
      totalDeletions: 2,
    });
    const result = await resolveStagePrompt('Changes: {{diff}}', baseTask, baseWorkflow);
    expect(mockGetDiff).toHaveBeenCalledWith('/tmp/test-worktree', 'main');
    expect(result).toContain('src/foo.ts');
    expect(result).toContain('+10');
  });

  it('substitutes (diff unavailable) when worktreePath is null', async () => {
    const taskNoWorktree = { ...baseTask, worktreePath: null } as Task;
    const result = await resolveStagePrompt('{{diff}}', taskNoWorktree, baseWorkflow);
    expect(result).toBe('(diff unavailable)');
    expect(mockGetDiff).not.toHaveBeenCalled();
  });

  it('resolves {{user_docs}} through the full pipeline', async () => {
    const result = await resolveStagePrompt('Docs: {{user_docs}}', baseTask, baseWorkflow);
    expect(result).toBe('Docs: /workspace/ai-docs');
  });
});

// ── resolveStagePrompt — {{archive:}} variables ───────────────────────────────

describe('resolveStagePrompt — {{archive:}} variables', () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-archive-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it('resolves {{archive:task-myid}} to memory.md content when file exists', async () => {
    // Create a local .lacc dir with a task memory file
    const taskDir = path.join(tmpRepo, '.lacc', 'tasks', 'task-myid');
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, 'memory.md'), '# Memory content');

    const testTask = { ...baseTask, repoPath: tmpRepo };
    const result = await resolveStagePrompt('Context: {{archive:task-myid}}', testTask, baseWorkflow);
    expect(result).toContain('# Memory content');
    expect(result).not.toContain('{{archive:');
  });

  it('resolves {{archive:task-abc}} to empty string when memory.md missing', async () => {
    // No .lacc dir at all in tmpRepo
    const testTask = { ...baseTask, repoPath: tmpRepo };
    const result = await resolveStagePrompt('Context: {{archive:nonexistent-task}}', testTask, baseWorkflow);
    expect(result).toBe('Context: ');
  });

  it('replaces {{archive:*}} with empty string when no .lacc storage configured', async () => {
    const testTask = { ...baseTask, repoPath: '/nonexistent/path/that/does/not/exist' };
    const result = await resolveStagePrompt('Context: {{archive:some-task}}', testTask, baseWorkflow);
    expect(result).toBe('Context: ');
    expect(result).not.toContain('{{archive:');
  });

  it('resolves multiple {{archive:}} tokens in one prompt', async () => {
    const taskDir1 = path.join(tmpRepo, '.lacc', 'tasks', 'task-1');
    const taskDir2 = path.join(tmpRepo, '.lacc', 'tasks', 'task-2');
    fs.mkdirSync(taskDir1, { recursive: true });
    fs.mkdirSync(taskDir2, { recursive: true });
    fs.writeFileSync(path.join(taskDir1, 'memory.md'), 'Memory A');
    fs.writeFileSync(path.join(taskDir2, 'memory.md'), 'Memory B');

    const testTask = { ...baseTask, repoPath: tmpRepo };
    const result = await resolveStagePrompt(
      'A: {{archive:task-1}} B: {{archive:task-2}}',
      testTask,
      baseWorkflow,
    );
    expect(result).toContain('Memory A');
    expect(result).toContain('Memory B');
    expect(result).not.toContain('{{archive:');
  });
});

// ── resolveHostPath ───────────────────────────────────────────────────────────

describe('resolveHostPath', () => {
  it('maps {{workspace}} to worktreePath', () => {
    const result = resolveHostPath('{{workspace}}/file.md', '/wt', 'ai-docs');
    expect(result).toBe('/wt/file.md');
  });

  it('maps {{user_docs}} to worktreePath/docsDir', () => {
    const result = resolveHostPath('{{user_docs}}/spec.md', '/wt', 'ai-docs');
    expect(result).toBe('/wt/ai-docs/spec.md');
  });

  it('maps {{docs_dir}} to worktreePath/docsDir', () => {
    const result = resolveHostPath('{{docs_dir}}/spec.md', '/wt', 'docs');
    expect(result).toBe('/wt/docs/spec.md');
  });

  it('resolves relative path relative to worktreePath', () => {
    const result = resolveHostPath('some/file.md', '/wt', 'ai-docs');
    expect(result).toBe('/wt/some/file.md');
  });

  it('passes through absolute path unchanged', () => {
    const result = resolveHostPath('/absolute/path.md', '/wt', 'ai-docs');
    expect(result).toBe('/absolute/path.md');
  });

  it('resolves tilde to home dir', () => {
    const result = resolveHostPath('~/.lacc-data/templates/foo.md', '/wt', 'ai-docs');
    expect(result).toBe(path.join(os.homedir(), '.lacc-data/templates/foo.md'));
  });
});
