import { logEmitter } from './logs.js';
import { updateTask, getTask } from '../db/tasks.js';
import { broadcastWsEvent } from '../index.js';
import { releasePort } from '../containers/ports.js';
import { stopSpinDetector } from '../workers/spin.js';
import { stopCostParser } from './cost.js';
import { killImmediate } from '../containers/lifecycle.js';


export function startCompletionDetector(taskId: string, execId: string): void {
  const endEvent = `end:${taskId}:${execId}`;
  const onEnd = () => {
    logEmitter.off(`log:${taskId}`, onLine);
    handleCompletion(taskId, 'error', 'Stream ended without a result event');
  };
  const onLine = (line: string) => checkLine(taskId, line, onLine, onEnd, endEvent);
  logEmitter.on(`log:${taskId}`, onLine);

  // Stream ended without a result event — treat as an error so the task
  // does not silently appear as successful.
  logEmitter.once(endEvent, onEnd);
}

async function checkLine(taskId: string, line: string, onLine: (line: string) => void, onEnd: () => void, endEvent: string): Promise<void> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }

  if (parsed.type === 'result') {
    const exitCode = parsed.exit_code ?? parsed.subtype;
    const isSuccess = exitCode === 'success' || exitCode === 0;
    // Remove both listeners before any await so neither fires again for this stage
    logEmitter.off(`log:${taskId}`, onLine);
    logEmitter.off(endEvent, onEnd);

    let failureReason: string | null = null;
    if (!isSuccess) {
      // Claude's result event carries subtype (e.g. "error_during_run") and a human-readable result string
      const subtype = parsed.subtype as string | undefined;
      const resultText = parsed.result as string | undefined;
      failureReason = [subtype, resultText].filter(Boolean).join(': ') || 'Unknown error';
    }

    await handleCompletion(taskId, isSuccess ? 'success' : 'error', failureReason);
  }
}

async function handleCompletion(taskId: string, outcome: string | 'end', failureReason: string | null = null): Promise<void> {
  const task = getTask(taskId);
  if (!task) return;

  // Already in terminal state
  if (['DONE', 'FAILED', 'KILLED', 'DISCARDED', 'READY'].includes(task.status)) return;

  stopSpinDetector(taskId);
  stopCostParser(taskId);

  const now = new Date();

  if (outcome === 'error') {
    // Kill container and release port immediately on failure
    let containerKilled = false;
    if (task.containerId) {
      try {
        await killImmediate(task.containerId);
        containerKilled = true;
      } catch {
        // ignore — GC will retry via cleanupTerminalContainers
      }
    }
    const containerPatch = containerKilled ? { containerId: undefined as undefined } : {};
    if (task.devPort) releasePort(task.devPort);

    const reason = failureReason ?? 'Unknown error';
    updateTask(taskId, { status: 'FAILED', completedAt: now, ...containerPatch, failureReason: reason, archiveState: 'deleted' });
    broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(taskId)! });
    broadcastWsEvent({
      type: 'NOTIFICATION',
      notification: { message: `Task failed: ${task.branchName}`, taskId, level: 'error' },
    });
    return;
  }

  // ── Workflow stage advancement ──────────────────────────────────────────
  // If task has a workflow, try to advance to the next stage.
  // Returns false if it handled the transition (next stage or waiting_gate).
  // Returns true if this was the final stage → fall through to normal READY/DONE.
  if (task.workflowName) {
    const { advanceWorkflowStage } = await import('../workers/workflow.js');
    const shouldContinue = await advanceWorkflowStage(taskId);
    if (!shouldContinue) return; // workflow worker took over
  }
  // ── End workflow advancement ────────────────────────────────────────────

  if (task.oversightMode === 'GATE_ON_COMPLETION' || task.oversightMode === 'GATE_ALWAYS') {
    // → READY: keep container alive so dev server stays accessible, hold the port
    updateTask(taskId, { status: 'READY', completedAt: now });
    broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(taskId)! });
    broadcastWsEvent({
      type: 'NOTIFICATION',
      notification: { message: `Ready: ${task.branchName}`, taskId, level: 'info' },
    });
  } else {
    // NOTIFY_ONLY → DONE: kill container and release port
    let containerKilled = false;
    if (task.containerId) {
      try {
        await killImmediate(task.containerId);
        containerKilled = true;
      } catch {
        // ignore — GC will retry via cleanupTerminalContainers
      }
    }
    const containerPatch = containerKilled ? { containerId: undefined as undefined } : {};
    if (task.devPort) releasePort(task.devPort);

    updateTask(taskId, {
      status: 'DONE',
      completedAt: now,
      ...containerPatch,
      archiveState: 'deleted',
    });
    broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(taskId)! });
    broadcastWsEvent({
      type: 'NOTIFICATION',
      notification: { message: `Task complete: ${task.branchName}`, taskId, level: 'info' },
    });
  }
}
