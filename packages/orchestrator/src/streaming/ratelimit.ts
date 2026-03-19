import { logEmitter } from './logs.js';
import { updateTask, getTask } from '../db/tasks.js';
import { pauseContainer } from '../containers/lifecycle.js';
import { broadcastWsEvent } from '../index.js';

const activeWatchers = new Map<string, (line: string) => void>();

export function startRateLimitWatcher(taskId: string, containerId: string, execId: string): void {
  // Remove any previous watcher for this task before adding a new one
  stopRateLimitWatcher(taskId);

  const onLine = (line: string) => checkLine(taskId, containerId, line);
  activeWatchers.set(taskId, onLine);
  logEmitter.on(`log:${taskId}`, onLine);

  logEmitter.once(`end:${taskId}:${execId}`, () => {
    logEmitter.off(`log:${taskId}`, onLine);
    activeWatchers.delete(taskId);
  });
}

export function stopRateLimitWatcher(taskId: string): void {
  const onLine = activeWatchers.get(taskId);
  if (onLine) {
    logEmitter.off(`log:${taskId}`, onLine);
    activeWatchers.delete(taskId);
  }
}

async function checkLine(taskId: string, containerId: string, line: string): Promise<void> {
  // Only valid signal is a structured rate_limit_event — non-JSON lines are never real rate limits
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }

  if (parsed.type !== 'rate_limit_event') return;

  const info = parsed.rate_limit_info as Record<string, unknown> | undefined;
  if (info?.status !== 'rejected') return;

  // Guard: already handling this rate limit, skip repeated events
  const task = getTask(taskId);
  if (task?.status === 'RATE_LIMITED') return;

  // resetsAt is Unix seconds — convert to ms
  const resetsAt = typeof info?.resetsAt === 'number' ? info.resetsAt * 1000 : Date.now() + 60_000;

  await pauseContainer(containerId).catch(err =>
    console.error(`Failed to pause container ${containerId}:`, err)
  );

  updateTask(taskId, {
    status: 'RATE_LIMITED',
    rateLimitRetryAfter: resetsAt,
  });

  const updatedTask = getTask(taskId)!;
  broadcastWsEvent({ type: 'TASK_UPDATED', task: updatedTask });

  const resetTime = new Date(resetsAt).toLocaleTimeString();
  broadcastWsEvent({
    type: 'NOTIFICATION',
    notification: {
      message: `Rate limited: ${updatedTask.branchName} — resumes at ${resetTime}`,
      taskId,
      level: 'warning',
    },
  });
}
