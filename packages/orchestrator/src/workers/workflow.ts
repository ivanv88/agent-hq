import { getTask, updateTask } from '../db/tasks.js';
import { broadcastWsEvent } from '../index.js';
import { getWorkflow, getStep } from '../db/workflows.js';
import { launchClaude } from './agent.js';
import { resolvePrompt } from '../workflows/variables.js';
import { createCheckpoint } from '../workflows/checkpoints.js';
import type { Task, WorkflowDefinition, WorkflowStageConfig } from '@lacc/shared';

// ── Template variable resolution ─────────────────────────────────────────────

export function resolveTemplateVars(template: string, task: Task, workflow: WorkflowDefinition): string {
  return resolvePrompt(template, task, workflow);
}

// ── Stage lookup helpers ──────────────────────────────────────────────────────

function getActiveStages(workflow: WorkflowDefinition, skipped: string[]): WorkflowStageConfig[] {
  return workflow.stages.filter(s => !skipped.includes(s.id));
}

function getNextStage(
  workflow: WorkflowDefinition,
  currentStageId: string,
  skipped: string[]
): WorkflowStageConfig | null {
  const active = getActiveStages(workflow, skipped);
  const idx = active.findIndex(s => s.id === currentStageId);
  return idx >= 0 && idx < active.length - 1 ? active[idx + 1] : null;
}

// ── Stage advancement ─────────────────────────────────────────────────────────

/**
 * Called by completion.ts when a stage's Claude exec finishes successfully.
 *
 * Returns true  → caller should proceed with normal READY/DONE transition.
 * Returns false → this function handled the transition (next stage or waiting_gate).
 */
export async function advanceWorkflowStage(taskId: string): Promise<boolean> {
  const task = getTask(taskId);
  if (!task?.workflowName) return true; // no workflow — let caller handle

  const workflow = getWorkflow(task.workflowName);
  if (!workflow) return true; // workflow file missing — fall back to normal

  const skipped = task.workflowSkippedStages ?? [];
  const currentStageId = task.workflowStage;
  const active = getActiveStages(workflow, skipped);

  // Determine current stage (first stage if workflowStage is null)
  const effectiveCurrentId = currentStageId ?? active[0]?.id;
  const nextStage = effectiveCurrentId
    ? getNextStage(workflow, effectiveCurrentId, skipped)
    : null;

  if (!nextStage) {
    // Last stage complete — update workflow_status to 'complete' then let caller do READY/DONE
    updateTask(taskId, { workflowStatus: 'complete' });
    return true;
  }

  // Advance to next stage
  await startStage(task, nextStage, workflow);
  return false;
}

/**
 * Start a specific stage (new stage prompt → update task → launch Claude).
 * Used both by advanceWorkflowStage (auto) and by the continue/rerun endpoints (manual).
 */
export async function startStage(
  task: Task,
  stage: WorkflowStageConfig,
  workflow?: WorkflowDefinition,
  extraContext?: string,
  bypassGate = false,
): Promise<void> {
  const wf = workflow ?? getWorkflow(task.workflowName!)!;
  if (!wf) throw new Error(`Workflow '${task.workflowName}' not found`);

  // Create checkpoint before launching stage (non-fatal on failure)
  if (task.worktreePath) {
    await createCheckpoint(task.id, stage.id, task.worktreePath);
  }

  const step = getStep(stage.step);
  if (!step) throw new Error(`Step '${stage.step}' not found`);

  const freshTask = getTask(task.id)!;
  let prompt = resolveTemplateVars(step.prompt, freshTask, wf);
  if (extraContext) prompt = `${prompt}\n\n---\nAdditional context:\n${extraContext}`;

  updateTask(task.id, {
    prompt,
    workflowStage: stage.id,
    workflowStatus: 'running',
  });

  broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(task.id)! });

  if (bypassGate || stage.gate === 'auto' || stage.gate === undefined) {
    // Launch immediately in the still-running container
    await launchClaude(task.id, task.containerId!, task.worktreePath!);
  } else {
    // gate: manual — set status READY (keeps container alive) + waiting_gate, then pause
    const now = new Date();
    updateTask(task.id, {
      status: 'READY',
      completedAt: now,
      workflowStatus: 'waiting_gate',
    });
    broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(task.id)! });
    broadcastWsEvent({
      type: 'NOTIFICATION',
      notification: { message: `Gate: ${stage.name} — ready to continue`, taskId: task.id, level: 'info' },
    });
  }
}
