import { updateTask, getTask } from '../db/tasks.js';
import { broadcastWsEvent } from '../index.js';
import { startClaude, watchExecUntilDone } from '../containers/lifecycle.js';
import { startLogPipe } from '../streaming/logs.js';
import { startCostParser } from '../streaming/cost.js';
import { startSpinDetector } from '../workers/spin.js';
import { startRateLimitWatcher } from '../streaming/ratelimit.js';
import { startDevServerDetector } from '../streaming/devserver.js';

/**
 * Launch Claude in an already-configured container and wire all monitors.
 * Called by spawnTask (fresh container) and by the workflow stage engine (existing container).
 *
 * Uses dynamic import for startCompletionDetector to avoid a circular
 * dependency: completion.ts → workflow.ts → agent.ts → completion.ts.
 */
export async function launchClaude(taskId: string, containerId: string, worktreePath: string): Promise<void> {
  updateTask(taskId, { status: 'WORKING', startedAt: new Date() });
  broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(taskId)! });

  const task = getTask(taskId)!;
  const { stream, exec } = await startClaude(containerId, task);

  startLogPipe(taskId, stream);
  watchExecUntilDone(exec, taskId).catch(() => {});
  startCostParser(taskId);
  startSpinDetector(taskId, worktreePath);
  startRateLimitWatcher(taskId, containerId);
  startDevServerDetector(taskId, task.devPort);

  // Dynamic import breaks circular dep: completion → workflow → agent → completion
  const { startCompletionDetector } = await import('../streaming/completion.js');
  startCompletionDetector(taskId);
}
