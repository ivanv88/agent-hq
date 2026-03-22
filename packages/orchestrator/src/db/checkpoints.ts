import { getDb } from './init.js';
import type { WorkflowCheckpoint } from '@lacc/shared';

function rowToCheckpoint(row: Record<string, unknown>): WorkflowCheckpoint {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    stageId: row.stage_id as string,
    gitRef: row.git_ref as string,
    worktreePath: row.worktree_path as string,
    createdAt: new Date(row.created_at as number),
  };
}

export function insertCheckpoint(checkpoint: WorkflowCheckpoint): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO workflow_checkpoints (id, task_id, stage_id, git_ref, worktree_path, created_at)
    VALUES (@id, @taskId, @stageId, @gitRef, @worktreePath, @createdAt)
  `).run({
    id: checkpoint.id,
    taskId: checkpoint.taskId,
    stageId: checkpoint.stageId,
    gitRef: checkpoint.gitRef,
    worktreePath: checkpoint.worktreePath,
    createdAt: checkpoint.createdAt.getTime(),
  });
}

export function getCheckpoint(taskId: string, stageId: string): WorkflowCheckpoint | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM workflow_checkpoints WHERE task_id = ? AND stage_id = ?'
  ).get(taskId, stageId) as Record<string, unknown> | undefined;
  return row ? rowToCheckpoint(row) : null;
}

export function listCheckpoints(taskId: string): WorkflowCheckpoint[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM workflow_checkpoints WHERE task_id = ? ORDER BY created_at ASC'
  ).all(taskId) as Record<string, unknown>[];
  return rows.map(rowToCheckpoint);
}

export function deleteCheckpointsAfter(taskId: string, stageId: string): void {
  const db = getDb();
  const checkpoint = getCheckpoint(taskId, stageId);
  if (!checkpoint) return;
  db.prepare(
    'DELETE FROM workflow_checkpoints WHERE task_id = ? AND created_at > ?'
  ).run(taskId, checkpoint.createdAt.getTime());
}

export function deleteCheckpointsByTask(taskId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM workflow_checkpoints WHERE task_id = ?').run(taskId);
}
