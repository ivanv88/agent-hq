import chokidar from 'chokidar';
import { updateTask, getTask } from '../db/tasks.js';
import { broadcastWsEvent } from '../index.js';
import { getGlobalConfig } from '../config/global.js';
import { logEmitter } from '../streaming/logs.js';
import { killImmediate } from '../containers/lifecycle.js';
import { releasePort } from '../containers/ports.js';
import { stopRateLimitWatcher } from '../streaming/ratelimit.js';
import { stopCostParser } from '../streaming/cost.js';

interface SpinState {
  watcher: ReturnType<typeof chokidar.watch>;
  interval: ReturnType<typeof setInterval> | null;
  lastChangeAt: number;
  // Window-scoped: cleared after each evaluation so checks don't use stale history
  windowFiles: string[];
  windowLogs: string[];
  // Stored ref so stopSpinDetector can remove it even if end:taskId never fires
  onLog: (line: string) => void;
}

const spinStates = new Map<string, SpinState>();

const TEST_PATTERNS = /jest|vitest|pytest|cargo test|go test|mocha|jasmine/i;

export function startSpinDetector(taskId: string, worktreePath: string, execId: string): void {
  const watcher = chokidar.watch(worktreePath, {
    ignored: /(node_modules|\.git|dist|\.next)/,
    ignoreInitial: true,
    persistent: true,
  });

  const onLog = (line: string) => {
    state.windowLogs.push(line);
  };

  const state: SpinState = {
    watcher,
    interval: null,
    lastChangeAt: Date.now(),
    windowFiles: [],
    windowLogs: [],
    onLog,
  };

  watcher.on('all', (_, filePath) => {
    state.lastChangeAt = Date.now();
    state.windowFiles.push(filePath);

    // If task was SPINNING and activity resumed → WORKING
    const task = getTask(taskId);
    if (task?.status === 'SPINNING') {
      updateTask(taskId, { status: 'WORKING', lastFileChanged: filePath });
      broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(taskId)! });
    } else {
      updateTask(taskId, { lastFileChanged: filePath });
    }
  });

  logEmitter.on(`log:${taskId}`, onLog);

  const interval = setInterval(() => { checkSpin(taskId, state).catch(console.error); }, 60_000);
  state.interval = interval;

  spinStates.set(taskId, state);

  logEmitter.once(`end:${taskId}:${execId}`, () => stopSpinDetector(taskId));
}

async function checkSpin(taskId: string, state: SpinState): Promise<void> {
  const config = getGlobalConfig();
  const task = getTask(taskId);
  if (!task || !['WORKING', 'SPINNING'].includes(task.status)) return;

  const windowMs = config.spinDetectionWindowMin * 60_000;
  const idleMs = Date.now() - state.lastChangeAt;

  if (idleMs < windowMs) return;

  // Evaluate using only what was observed in this window
  const hasTestRun = state.windowLogs.some(l => TEST_PATTERNS.test(l));
  const hasFileActivity = state.windowFiles.length > 0;

  // Reset window state so the next check window starts clean
  state.windowFiles = [];
  state.windowLogs = [];

  if (task.status === 'WORKING' && !hasTestRun && !hasFileActivity) {
    updateTask(taskId, { status: 'SPINNING' });
    broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(taskId)! });
    broadcastWsEvent({
      type: 'NOTIFICATION',
      notification: {
        message: `Task appears stuck: ${task.branchName}`,
        taskId,
        level: 'warning',
      },
    });
    return;
  }

  // Second window elapsed while still SPINNING → auto-fail
  if (task.status === 'SPINNING') {
    stopCostParser(taskId);
    stopRateLimitWatcher(taskId);
    if (task.containerId) await killImmediate(task.containerId).catch(() => {});
    if (task.devPort) releasePort(task.devPort);
    const windowMin = config.spinDetectionWindowMin;
    const now = new Date();
    updateTask(taskId, {
      status: 'FAILED',
      failureReason: `Spin detected: no file changes for ${windowMin * 2} minutes`,
      containerId: undefined,
      archiveState: 'deleted',
    });
    broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(taskId)! });
    broadcastWsEvent({
      type: 'NOTIFICATION',
      notification: {
        message: `Task auto-failed after spin: ${task.branchName}`,
        taskId,
        level: 'error',
      },
    });
    stopSpinDetector(taskId);
  }
}

export function stopSpinDetector(taskId: string): void {
  const state = spinStates.get(taskId);
  if (!state) return;

  if (state.interval) clearInterval(state.interval);
  state.watcher.close().catch(() => {});
  logEmitter.off(`log:${taskId}`, state.onLog);
  spinStates.delete(taskId);
}
