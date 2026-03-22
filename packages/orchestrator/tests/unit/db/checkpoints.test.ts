import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import {
  insertCheckpoint,
  getCheckpoint,
  listCheckpoints,
  deleteCheckpointsAfter,
  deleteCheckpointsByTask,
} from '../../../src/db/checkpoints.js';
import { createTestTask } from '../../helpers/factories.js';

describe('checkpoints db', () => {
  let taskId: string;

  function makeCheckpoint(stageId: string, ownerTaskId?: string, createdAt = new Date()) {
    const tid = ownerTaskId ?? taskId;
    const cp = {
      id: randomUUID(),
      taskId: tid,
      stageId,
      gitRef: `refs/lacc/checkpoints/${tid}/${stageId}`,
      worktreePath: '/tmp/test-worktree',
      createdAt,
    };
    insertCheckpoint(cp);
    return cp;
  }

  beforeEach(() => {
    const task = createTestTask();
    taskId = task.id;
  });

  it('inserts and retrieves a checkpoint', () => {
    const cp = makeCheckpoint('spec');
    const retrieved = getCheckpoint(taskId, 'spec');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.stageId).toBe('spec');
    expect(retrieved!.gitRef).toBe(cp.gitRef);
  });

  it('returns null for non-existent checkpoint', () => {
    expect(getCheckpoint(taskId, 'non-existent')).toBeNull();
  });

  it('converts dates correctly', () => {
    const now = new Date();
    makeCheckpoint('dates-test');
    const retrieved = getCheckpoint(taskId, 'dates-test')!;
    expect(retrieved.createdAt).toBeInstanceOf(Date);
    expect(retrieved.createdAt.getTime()).toBeCloseTo(now.getTime(), -2);
  });

  it('lists checkpoints in creation order', () => {
    const listTask = createTestTask();
    const t1 = new Date(1000);
    const t2 = new Date(2000);
    const t3 = new Date(3000);

    insertCheckpoint({ id: randomUUID(), taskId: listTask.id, stageId: 'initial', gitRef: 'ref1', worktreePath: '/tmp/wt', createdAt: t1 });
    insertCheckpoint({ id: randomUUID(), taskId: listTask.id, stageId: 'spec', gitRef: 'ref2', worktreePath: '/tmp/wt', createdAt: t2 });
    insertCheckpoint({ id: randomUUID(), taskId: listTask.id, stageId: 'plan', gitRef: 'ref3', worktreePath: '/tmp/wt', createdAt: t3 });

    const list = listCheckpoints(listTask.id);
    expect(list).toHaveLength(3);
    expect(list[0].stageId).toBe('initial');
    expect(list[1].stageId).toBe('spec');
    expect(list[2].stageId).toBe('plan');
  });

  it('deleteCheckpointsAfter removes only later checkpoints', () => {
    const delTask = createTestTask();
    insertCheckpoint({ id: randomUUID(), taskId: delTask.id, stageId: 'initial', gitRef: 'r1', worktreePath: '/tmp/wt', createdAt: new Date(1000) });
    insertCheckpoint({ id: randomUUID(), taskId: delTask.id, stageId: 'spec', gitRef: 'r2', worktreePath: '/tmp/wt', createdAt: new Date(2000) });
    insertCheckpoint({ id: randomUUID(), taskId: delTask.id, stageId: 'plan', gitRef: 'r3', worktreePath: '/tmp/wt', createdAt: new Date(3000) });
    insertCheckpoint({ id: randomUUID(), taskId: delTask.id, stageId: 'implement', gitRef: 'r4', worktreePath: '/tmp/wt', createdAt: new Date(4000) });

    deleteCheckpointsAfter(delTask.id, 'spec');

    const remaining = listCheckpoints(delTask.id);
    expect(remaining).toHaveLength(2);
    expect(remaining.map(r => r.stageId)).toEqual(['initial', 'spec']);
  });

  it('deleteCheckpointsByTask removes all for a task', () => {
    const cleanTask = createTestTask();
    insertCheckpoint({ id: randomUUID(), taskId: cleanTask.id, stageId: 'a', gitRef: 'r1', worktreePath: '/tmp/wt', createdAt: new Date() });
    insertCheckpoint({ id: randomUUID(), taskId: cleanTask.id, stageId: 'b', gitRef: 'r2', worktreePath: '/tmp/wt', createdAt: new Date() });

    deleteCheckpointsByTask(cleanTask.id);

    expect(listCheckpoints(cleanTask.id)).toHaveLength(0);
  });

  it('does not affect other tasks when deleting', () => {
    const taskA = createTestTask();
    const taskB = createTestTask();
    insertCheckpoint({ id: randomUUID(), taskId: taskA.id, stageId: 'x', gitRef: 'r1', worktreePath: '/tmp/wt', createdAt: new Date() });
    insertCheckpoint({ id: randomUUID(), taskId: taskB.id, stageId: 'x', gitRef: 'r2', worktreePath: '/tmp/wt', createdAt: new Date() });

    deleteCheckpointsByTask(taskA.id);

    expect(listCheckpoints(taskA.id)).toHaveLength(0);
    expect(listCheckpoints(taskB.id)).toHaveLength(1);
  });
});
