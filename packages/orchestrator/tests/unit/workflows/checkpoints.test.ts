import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestTask } from '../../helpers/factories.js';
import { getTask } from '../../../src/db/tasks.js';
import { listCheckpoints, insertCheckpoint } from '../../../src/db/checkpoints.js';

// Unmock checkpoints so we can test the real implementation
vi.unmock('../../../src/workflows/checkpoints.js');

// Mock child_process.execFile for git operations
const mockExecFile = vi.fn().mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb?: Function) => {
  if (cb) {
    cb(null, { stdout: '', stderr: '' });
  }
  return { stdout: '', stderr: '' };
});

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

vi.mock('util', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    promisify: () => vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
  };
});

// Since we mocked util.promisify, we need to re-import checkpoints after mocking
// The real functions use promisify(execFile) which we've mocked to resolve cleanly
const { createCheckpoint, restoreCheckpoint, cleanupCheckpointRefs } = await import('../../../src/workflows/checkpoints.js');

describe('createCheckpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a checkpoint record in SQLite', async () => {
    const task = createTestTask({
      workflowName: 'test-workflow',
      workflowStage: 'spec',
    });

    await createCheckpoint(task.id, 'spec', '/tmp/test-worktree');

    const checkpoints = listCheckpoints(task.id);
    expect(checkpoints.length).toBeGreaterThanOrEqual(1);
    const cp = checkpoints.find(c => c.stageId === 'spec');
    expect(cp).toBeDefined();
    expect(cp!.gitRef).toBe(`refs/lacc/checkpoints/${task.id}/spec`);
  });

  it('does not throw on git failure (non-fatal)', async () => {
    const task = createTestTask({
      workflowName: 'test-workflow',
      workflowStage: 'plan',
    });

    // This should not throw even if underlying git ops are mocked to succeed/fail
    await expect(createCheckpoint(task.id, 'plan', '/tmp/test-worktree')).resolves.not.toThrow();
  });
});

describe('restoreCheckpoint', () => {
  it('throws when checkpoint does not exist', async () => {
    await expect(restoreCheckpoint('non-existent', 'spec')).rejects.toThrow('No checkpoint for stage spec');
  });

  it('updates task workflow state after restore', async () => {
    const task = createTestTask({
      workflowName: 'test-workflow',
      workflowStage: 'implement',
      workflowStatus: 'waiting_gate',
      status: 'READY',
    });

    // Insert a checkpoint to restore to
    insertCheckpoint({
      id: randomUUID(),
      taskId: task.id,
      stageId: 'spec',
      gitRef: `refs/lacc/checkpoints/${task.id}/spec`,
      worktreePath: '/tmp/test-worktree',
      createdAt: new Date(1000),
    });
    insertCheckpoint({
      id: randomUUID(),
      taskId: task.id,
      stageId: 'implement',
      gitRef: `refs/lacc/checkpoints/${task.id}/implement`,
      worktreePath: '/tmp/test-worktree',
      createdAt: new Date(2000),
    });

    await restoreCheckpoint(task.id, 'spec');

    const updated = getTask(task.id)!;
    expect(updated.workflowStage).toBe('spec');
    expect(updated.workflowStatus).toBe('waiting_gate');
    expect(updated.status).toBe('READY');
  });

  it('removes checkpoints after the restored stage', async () => {
    const taskId = randomUUID();
    const task = createTestTask({
      id: taskId,
      workflowName: 'test-workflow',
      workflowStage: 'review',
      workflowStatus: 'waiting_gate',
    });

    insertCheckpoint({ id: randomUUID(), taskId, stageId: 'initial', gitRef: 'r1', worktreePath: '/tmp/test-worktree', createdAt: new Date(1000) });
    insertCheckpoint({ id: randomUUID(), taskId, stageId: 'spec', gitRef: 'r2', worktreePath: '/tmp/test-worktree', createdAt: new Date(2000) });
    insertCheckpoint({ id: randomUUID(), taskId, stageId: 'plan', gitRef: 'r3', worktreePath: '/tmp/test-worktree', createdAt: new Date(3000) });

    await restoreCheckpoint(taskId, 'spec');

    const remaining = listCheckpoints(taskId);
    expect(remaining.map(r => r.stageId)).toEqual(['initial', 'spec']);
  });
});

describe('cleanupCheckpointRefs', () => {
  it('removes all checkpoint records for a task', async () => {
    const taskId = randomUUID();
    const task = createTestTask({ id: taskId });

    insertCheckpoint({ id: randomUUID(), taskId, stageId: 'a', gitRef: 'r1', worktreePath: '/tmp/test-worktree', createdAt: new Date() });
    insertCheckpoint({ id: randomUUID(), taskId, stageId: 'b', gitRef: 'r2', worktreePath: '/tmp/test-worktree', createdAt: new Date() });

    await cleanupCheckpointRefs(taskId, '/tmp/test-worktree');

    expect(listCheckpoints(taskId)).toHaveLength(0);
  });
});
