import { logEmitter } from './logs.js';
import { updateTask } from '../db/tasks.js';
import { broadcastWsEvent } from '../index.js';

// Issue 34: scoped regex to avoid matching DB connections, redis, etc.
const DEV_SERVER_PATTERN =
  /(?:Local|listening|running at|started at|available at|Server running).*?(?:https?:\/\/)(?:localhost|0\.0\.0\.0):(\d{4,5})/i;

export function startDevServerDetector(taskId: string, devPort: number | null, execId: string): void {
  if (!devPort) return;

  let detected = false;

  const onLine = (line: string) => {
    if (detected) return;

    const match = line.match(DEV_SERVER_PATTERN);
    if (!match) return;

    const port = parseInt(match[1], 10);
    if (port !== devPort) return; // guard: only if matches expected port

    detected = true;
    const url = `http://localhost:${devPort}`;
    updateTask(taskId, { devServerUrl: url });

    import('../db/tasks.js').then(({ getTask }) => {
      const task = getTask(taskId);
      if (task) {
        broadcastWsEvent({ type: 'TASK_UPDATED', task });
      }
    });
  };

  logEmitter.on(`log:${taskId}`, onLine);

  logEmitter.once(`end:${taskId}:${execId}`, () => {
    logEmitter.off(`log:${taskId}`, onLine);
  });
}
