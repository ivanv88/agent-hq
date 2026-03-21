import { getTask, updateTask } from '../db/tasks.js';
import { broadcastWsEvent } from '../index.js';
import { launchClaude } from '../workers/agent.js';
import type { WorkflowDefinition } from '@lacc/shared';

// Prevents concurrent double-advancement of the same task
const advancingTasks = new Set<string>();

/**
 * Advance a workflow task to its next stage after the current stage completes.
 *
 * Idempotent: concurrent calls for the same taskId are de-duplicated via an
 * in-memory guard (safe within a single process / single-threaded JS runtime).
 *
 * Gate logic:
 *   - If the CURRENT or NEXT stage has gate='manual' → pause at waiting_gate
 *   - If BOTH are gate='auto' → launch Claude immediately
 */
export async function advanceWorkflow(taskId: string, workflow: WorkflowDefinition): Promise<void> {
  if (advancingTasks.has(taskId)) return;
  advancingTasks.add(taskId);

  try {
    const task = getTask(taskId);
    if (!task) return;

    const skipped = task.workflowSkippedStages ?? [];
    const active = workflow.stages.filter(s => !skipped.includes(s.id));

    const currentIdx = active.findIndex(s => s.id === task.workflowStage);
    const currentStage = currentIdx >= 0 ? active[currentIdx] : null;
    const nextStage = currentIdx >= 0 && currentIdx < active.length - 1
      ? active[currentIdx + 1]
      : null;

    if (!nextStage) {
      // Last stage complete
      const status = task.oversightMode === 'NOTIFY_ONLY' ? 'DONE' : 'READY';
      updateTask(taskId, {
        workflowStatus: 'complete',
        status,
        completedAt: new Date(),
      });
      broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(taskId)! });
      return;
    }

    // Advance to next stage
    updateTask(taskId, { workflowStage: nextStage.id });

    const pause = currentStage?.gate === 'manual' || nextStage.gate === 'manual';

    if (pause) {
      updateTask(taskId, {
        status: 'READY',
        workflowStatus: 'waiting_gate',
        completedAt: new Date(),
      });
      broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(taskId)! });
      broadcastWsEvent({
        type: 'NOTIFICATION',
        notification: { message: `Gate: ${nextStage.name} — ready to continue`, taskId, level: 'info' },
      });
    } else {
      updateTask(taskId, { workflowStatus: 'running' });
      broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(taskId)! });
      await launchClaude(taskId, task.containerId!, task.worktreePath!);
    }
  } finally {
    advancingTasks.delete(taskId);
  }
}
