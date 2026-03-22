import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { insertCheckpoint, getCheckpoint, deleteCheckpointsAfter, deleteCheckpointsByTask } from '../db/checkpoints.js';
import { updateTask } from '../db/tasks.js';
import { broadcastWsEvent } from '../index.js';

const execFileAsync = promisify(execFile);

/**
 * Create a checkpoint (git snapshot) of the worktree state before a stage runs.
 * Non-fatal: logs errors but does not throw, so stage execution is never blocked.
 */
export async function createCheckpoint(
  taskId: string,
  stageId: string,
  worktreePath: string
): Promise<void> {
  const refName = `refs/lacc/checkpoints/${taskId}/${stageId}`;

  try {
    // Stage all untracked + modified files so they're included in the snapshot
    await execFileAsync('git', ['add', '-A'], { cwd: worktreePath });

    // If there are staged changes, commit them to capture full state
    const { stdout: statusOutput } = await execFileAsync(
      'git', ['status', '--porcelain'], { cwd: worktreePath }
    );

    if (statusOutput.trim()) {
      await execFileAsync('git', [
        'commit', '--no-verify', '-m',
        `lacc-checkpoint: before ${stageId}`,
      ], { cwd: worktreePath });
    }

    // Write current HEAD to private ref
    await execFileAsync('git', ['update-ref', refName, 'HEAD'], { cwd: worktreePath });

    // Record in SQLite
    insertCheckpoint({
      id: randomUUID(),
      taskId,
      stageId,
      gitRef: refName,
      worktreePath,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error(`[checkpoint] Failed to create checkpoint for task=${taskId} stage=${stageId}:`, err);
    broadcastWsEvent({
      type: 'NOTIFICATION',
      notification: {
        message: `Checkpoint creation failed for stage ${stageId}`,
        taskId,
        level: 'warning',
      },
    });
  }
}

/**
 * Restore worktree to a checkpoint state (hard reset + clean).
 */
export async function restoreCheckpoint(
  taskId: string,
  stageId: string
): Promise<void> {
  const checkpoint = getCheckpoint(taskId, stageId);
  if (!checkpoint) throw new Error(`No checkpoint for stage ${stageId}`);

  // Hard reset worktree to checkpoint state
  await execFileAsync('git', ['reset', '--hard', checkpoint.gitRef], {
    cwd: checkpoint.worktreePath,
  });

  // Clean untracked files created after the checkpoint
  await execFileAsync('git', ['clean', '-fd'], {
    cwd: checkpoint.worktreePath,
  });

  // Remove checkpoint records for stages after this one
  deleteCheckpointsAfter(taskId, stageId);

  // Reset workflow state in SQLite
  updateTask(taskId, {
    workflowStage: stageId,
    workflowStatus: 'waiting_gate',
    status: 'READY',
    completedAt: new Date(),
  });
}

/**
 * Clean up all private git refs for a task. Called when worktree is being deleted.
 */
export async function cleanupCheckpointRefs(
  taskId: string,
  worktreePath: string
): Promise<void> {
  try {
    const { stdout: refs } = await execFileAsync('git', [
      'for-each-ref', '--format=%(refname)',
      `refs/lacc/checkpoints/${taskId}/`,
    ], { cwd: worktreePath });

    for (const ref of refs.split('\n').filter(Boolean)) {
      await execFileAsync('git', ['update-ref', '-d', ref], { cwd: worktreePath });
    }
  } catch (err) {
    console.error(`[checkpoint] Failed to clean refs for task=${taskId}:`, err);
  }

  deleteCheckpointsByTask(taskId);
}
