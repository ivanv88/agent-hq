import { logEmitter } from './logs.js';
import { updateTask, getTask } from '../db/tasks.js';
import { broadcastWsEvent } from '../index.js';
import { getGlobalConfig } from '../config/global.js';

const DEFAULT_CONTEXT_WINDOW = 200_000;
const CONTEXT_WARN_THRESHOLD = 0.85;

// Context window sizes by model prefix
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4':   DEFAULT_CONTEXT_WINDOW,
  'claude-sonnet-4': DEFAULT_CONTEXT_WINDOW,
  'claude-haiku-4':  DEFAULT_CONTEXT_WINDOW,
  'claude-3-5':      DEFAULT_CONTEXT_WINDOW,
  'claude-3':        DEFAULT_CONTEXT_WINDOW,
};

function getContextWindowSize(model: string): number {
  for (const [prefix, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (model.startsWith(prefix)) return size;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

interface CostState {
  costUsd: number;
  costOffset: number;  // accumulated from previous workflow stages
  inputTokens: number;
  outputTokens: number;
  contextTokensUsed: number | null;
  dirty: boolean;
  context85Notified: boolean;
}

const costStates = new Map<string, CostState>();
const flushIntervals = new Map<string, ReturnType<typeof setInterval>>();

export function startCostParser(taskId: string, execId: string): void {
  const prev = getTask(taskId);
  const costOffset = prev?.costUsd ?? 0;
  costStates.set(taskId, {
    costUsd: costOffset,
    costOffset,
    inputTokens: 0,
    outputTokens: 0,
    contextTokensUsed: null,
    dirty: false,
    context85Notified: false,
  });

  const onLine = (line: string) => parseLine(taskId, line);
  logEmitter.on(`log:${taskId}`, onLine);

  // Flush every 10 seconds
  const interval = setInterval(() => flushCost(taskId), 10_000);
  flushIntervals.set(taskId, interval);

  logEmitter.once(`end:${taskId}:${execId}`, () => {
    logEmitter.off(`log:${taskId}`, onLine);
    flushCost(taskId);
    stopCostParser(taskId);
  });
}

export function stopCostParser(taskId: string): void {
  const interval = flushIntervals.get(taskId);
  if (interval) {
    clearInterval(interval);
    flushIntervals.delete(taskId);
  }
}

function parseLine(taskId: string, line: string): void {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }

  const state = costStates.get(taskId);
  if (!state) return;

  // stream-json result event
  if (parsed.type === 'result') {
    const usage = parsed.usage as Record<string, number> | undefined;
    if (usage) {
      state.inputTokens = usage.input_tokens ?? state.inputTokens;
      state.outputTokens = usage.output_tokens ?? state.outputTokens;
    }
    if (typeof parsed.total_cost_usd === 'number') {
      state.costUsd = state.costOffset + parsed.total_cost_usd;
    }
    state.dirty = true;
  }

  // Usage events during streaming
  if (parsed.type === 'usage' || parsed.type === 'message_delta') {
    const usage = (parsed.usage ?? parsed.delta) as Record<string, number> | undefined;
    if (usage) {
      if (usage.input_tokens) state.inputTokens = usage.input_tokens;
      if (usage.output_tokens) state.outputTokens += usage.output_tokens;
      state.dirty = true;
    }
  }

  // Context window tokens
  if (typeof parsed.context_tokens_used === 'number') {
    state.contextTokensUsed = parsed.context_tokens_used;
    state.dirty = true;

    if (!state.context85Notified) {
      const task = getTask(taskId);
      if (task) {
        const windowSize = getContextWindowSize(task.model);
        if (state.contextTokensUsed >= windowSize * CONTEXT_WARN_THRESHOLD) {
          state.context85Notified = true;
          broadcastWsEvent({
            type: 'NOTIFICATION',
            notification: {
              message: `Agent ${task.branchName} context window ${Math.round(CONTEXT_WARN_THRESHOLD * 100)}% full — consider restarting with summary`,
              taskId,
              level: 'warning',
            },
          });
        }
      }
    }
  }
}

function flushCost(taskId: string): void {
  const state = costStates.get(taskId);
  if (!state?.dirty) return;

  updateTask(taskId, {
    costUsd: state.costUsd,
    inputTokens: state.inputTokens,
    outputTokens: state.outputTokens,
    contextTokensUsed: state.contextTokensUsed,
  });

  broadcastWsEvent({
    type: 'COST_UPDATED',
    taskId,
    costUsd: state.costUsd,
    inputTokens: state.inputTokens,
    outputTokens: state.outputTokens,
    contextTokensUsed: state.contextTokensUsed,
  });

  const config = getGlobalConfig();
  if (state.costUsd > config.costAlertThreshold) {
    broadcastWsEvent({
      type: 'NOTIFICATION',
      notification: {
        message: `Task cost alert: $${state.costUsd.toFixed(4)}`,
        taskId,
        level: 'warning',
      },
    });
  }

  state.dirty = false;
}
