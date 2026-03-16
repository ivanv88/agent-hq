import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import type { Task } from '@lacc/shared';
import { SpawnTaskInputSchema, FeedbackInputSchema } from '@lacc/shared';
import { insertTask, updateTask, getTask, listTasks, deleteFinishedTasks } from '../db/tasks.js';
import { listPrompts, upsertPrompt } from '../db/prompts.js';
import { appendChunk, getLastNChunks } from '../db/logs.js';
import { broadcastWsEvent } from '../index.js';
import { getGlobalConfig } from '../config/global.js';
import { loadRepoConfig, mergeConfigs } from '../config/repo.js';
import { readDevcontainerConfig } from '../containers/devcontainer.js';
import { assignPort, releasePort, reclaimPort } from '../containers/ports.js';
import { claim, configure, watchExecUntilDone, runPostCreate, killContainer, killImmediate, killTaskContainerIfExists, pauseContainer, resumeContainer, resumeClaudeAfterRateLimit } from '../containers/lifecycle.js';
import { createWorktree, generateBranchName, isGitRepo } from '../git/worktree.js';
import { startLogPipe, preloadFromDb, getRingBuffer, hasActiveStream, logEmitter, RING_SIZE } from '../streaming/logs.js';
import { startCostParser } from '../streaming/cost.js';
import { startSpinDetector, stopSpinDetector } from '../workers/spin.js';
import { startRateLimitWatcher, stopRateLimitWatcher } from '../streaming/ratelimit.js';
import { startCompletionDetector } from '../streaming/completion.js';
import { startDevServerDetector } from '../streaming/devserver.js';
import { maintain } from '../containers/lifecycle.js';
import { launchClaude } from '../workers/agent.js';
import { getPoolStatus } from '../db/pool.js';

export function registerTaskRoutes(fastify: FastifyInstance) {
  // List tasks
  fastify.get('/tasks', async () => listTasks());

  // Clear all finished tasks (DONE, FAILED, KILLED) from DB
  fastify.delete('/tasks/finished', async () => {
    const count = deleteFinishedTasks();
    broadcastWsEvent({ type: 'TASKS_CLEARED' });
    return { deleted: count };
  });

  // Get single task
  fastify.get<{ Params: { id: string } }>('/tasks/:id', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    return task;
  });

  // Spawn task
  fastify.post('/tasks', async (req, reply) => {
    const result = SpawnTaskInputSchema.safeParse(req.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Invalid input', details: result.error.flatten() });
    }

    const input = result.data;

    if (!await isGitRepo(input.repoPath)) {
      return reply.status(400).send({ code: 'NOT_A_GIT_REPO', path: input.repoPath });
    }

    const globalConfig = getGlobalConfig();
    const repoConfig = loadRepoConfig(input.repoPath);
    const merged = mergeConfigs(globalConfig, repoConfig);

    const devcontainerConfig = readDevcontainerConfig(input.repoPath);
    const devServerMode = merged.devServerMode;

    let devPort: number | null = null;
    if (devServerMode !== 'none') {
      devPort = devcontainerConfig?.forwardPorts?.[0] ?? assignPort();
    }

    const taskType = input.taskType ?? 'feature';
    const taskId = randomUUID();
    const branchName = input.branchName?.trim() || generateBranchName({
      type: taskType,
      ticket: input.ticket,
      prompt: input.prompt,
      template: merged.branchTemplate,
      suffix: taskId.slice(0, 6),
    });
    const task: Task = {
      id: taskId,
      repoPath: input.repoPath,
      prompt: input.prompt,
      branchName,
      baseBranch: 'main',
      worktreePath: null,
      containerId: undefined,
      status: 'SPAWNING',
      oversightMode: input.oversightMode ?? merged.oversightMode,
      taskType,
      devServerMode,
      devPort,
      devServerUrl: null,
      model: input.model ?? globalConfig.defaultModel,
      agentName: input.agentName ?? null,
      skillNames: input.skillNames ?? [],
      planFirst: input.planFirst ?? false,
      maxRetries: input.maxRetries ?? 3,
      retryCount: 0,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      contextTokensUsed: null,
      lastFileChanged: null,
      rateLimitRetryAfter: null,
      flaggedForDelete: false,
      flaggedForDeleteAt: null,
      prTitle: null,
      prBody: null,
      failureReason: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      workflowName: input.workflowName ?? null,
      workflowStage: null,
      workflowStatus: input.workflowName ? 'running' : null,
      workflowSkippedStages: input.skippedStages ?? [],
    };

    insertTask(task);
    broadcastWsEvent({ type: 'TASK_CREATED', task });
    upsertPrompt(input.prompt);

    // Background spawn
    spawnTask(fastify, task, devcontainerConfig, merged, input.anthropicBaseUrl).catch(async err => {
      fastify.log.error(err, `Spawn failed for task ${taskId}`);
      const errMsg = err instanceof Error ? err.message : String(err);
      const now = new Date();
      appendChunk(taskId, JSON.stringify({ type: 'error', message: errMsg }));
      updateTask(taskId, { status: 'FAILED', completedAt: now, failureReason: errMsg, flaggedForDelete: true, flaggedForDeleteAt: now });
      broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(taskId)! });
      if (devPort) releasePort(devPort);
      // Kill container: try by DB id first, then fall back to label search
      // (covers the case where configure() created a container but start() failed
      // before the id was saved to the DB)
      const failed = getTask(taskId);
      if (failed?.containerId) {
        killImmediate(failed.containerId).catch(() => {});
      }
      await killTaskContainerIfExists(taskId);
    });

    reply.status(202).send({ taskId });
  });

  // Delete/kill task
  fastify.delete<{ Params: { id: string } }>('/tasks/:id', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    if (task.containerId) {
      await killContainer(task.containerId, 5_000).catch(() => {});
    }
    stopSpinDetector(task.id);
    stopRateLimitWatcher(task.id);
    if (task.devPort) releasePort(task.devPort);

    const now = new Date();
    updateTask(task.id, { status: 'KILLED', completedAt: now, flaggedForDelete: true, flaggedForDeleteAt: now });
    broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(task.id)! });
    reply.status(204).send();
  });

  // Pause task
  fastify.post<{ Params: { id: string } }>('/tasks/:id/pause', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    if (!task.containerId) return reply.status(409).send({ error: 'No container' });

    await pauseContainer(task.containerId);
    updateTask(task.id, { status: 'PAUSED' });
    broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(task.id)! });
    return { ok: true };
  });

  // Resume task
  fastify.post<{ Params: { id: string } }>('/tasks/:id/resume', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    if (!task.containerId) return reply.status(409).send({ error: 'No container' });

    if (hasActiveStream(task.id)) {
      // Normal case: exec stream is still alive — just unpause
      await resumeContainer(task.containerId);
    } else {
      // Post-restart case: exec stream is gone — reconnect via claude --continue
      const { stream, exec } = await resumeClaudeAfterRateLimit(task.containerId, task);
      startLogPipe(task.id, stream);
      watchExecUntilDone(exec, task.id).catch(() => {});
      startCostParser(task.id);
      if (task.worktreePath) startSpinDetector(task.id, task.worktreePath);
      startRateLimitWatcher(task.id, task.containerId);
      startCompletionDetector(task.id);
      startDevServerDetector(task.id, task.devPort ?? null);
    }

    updateTask(task.id, { status: 'WORKING', rateLimitRetryAfter: null });
    broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(task.id)! });
    return { ok: true };
  });

  // Restart task
  fastify.post<{ Params: { id: string } }>('/tasks/:id/restart', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    if (!await isGitRepo(task.repoPath)) {
      return reply.status(400).send({ code: 'NOT_A_GIT_REPO', path: task.repoPath });
    }

    if (task.containerId) {
      await killContainer(task.containerId, 5_000).catch(() => {});
    }
    stopSpinDetector(task.id);
    stopRateLimitWatcher(task.id);

    updateTask(task.id, {
      retryCount: task.retryCount + 1,
      status: 'SPAWNING',
      containerId: undefined,
      startedAt: null,
      completedAt: null,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      rateLimitRetryAfter: null,
      failureReason: null,
    });

    const repoConfig = loadRepoConfig(task.repoPath);
    const globalConfig = getGlobalConfig();
    const merged = mergeConfigs(globalConfig, repoConfig);
    const devcontainerConfig = readDevcontainerConfig(task.repoPath);

    broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(task.id)! });

    spawnTask(fastify, getTask(task.id)!, devcontainerConfig, merged, undefined).catch(async err => {
      fastify.log.error(err, `Restart failed for task ${task.id}`);
      const errMsg = err instanceof Error ? err.message : String(err);
      const now = new Date();
      appendChunk(task.id, JSON.stringify({ type: 'error', message: errMsg }));
      updateTask(task.id, { status: 'FAILED', completedAt: now, failureReason: errMsg, flaggedForDelete: true, flaggedForDeleteAt: now });
      broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(task.id)! });
      if (task.devPort) releasePort(task.devPort);
      const failed = getTask(task.id);
      if (failed?.containerId) killImmediate(failed.containerId).catch(() => {});
      await killTaskContainerIfExists(task.id);
    });

    return { ok: true, retryCount: task.retryCount + 1 };
  });

  // Feedback endpoint
  fastify.post<{ Params: { id: string } }>('/tasks/:id/feedback', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    const result = FeedbackInputSchema.safeParse(req.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Invalid input', details: result.error.flatten() });
    }

    const { feedback } = result.data;

    // Issue 45 fix: extract decoded assistant text from stream-json, not raw blobs
    const rawChunks = getLastNChunks(task.id, 200);
    const progressContext = extractAssistantText(rawChunks).slice(-50).join('\n').replace(/\0/g, '');

    const compoundPrompt =
      `${task.prompt}\n\n---\nFeedback from reviewer:\n${feedback}\n\n---\nContext (last agent output):\n${progressContext}`;

    stopSpinDetector(task.id);
    stopRateLimitWatcher(task.id);

    const existingContainerId = task.containerId; // set when task was READY
    const existingWorktreePath = task.worktreePath;

    updateTask(task.id, {
      prompt: compoundPrompt,
      status: 'SPAWNING',
      containerId: existingContainerId, // keep if reusing; cleared below if doing full respawn
      retryCount: task.retryCount + 1,
      startedAt: null,
      completedAt: null,
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      rateLimitRetryAfter: null,
      failureReason: null,
    });

    broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(task.id)! });

    const onError = async (err: unknown) => {
      fastify.log.error(err, `Feedback restart failed for task ${task.id}`);
      const errMsg = err instanceof Error ? err.message : String(err);
      const now = new Date();
      appendChunk(task.id, JSON.stringify({ type: 'error', message: errMsg }));
      updateTask(task.id, { status: 'FAILED', completedAt: now, failureReason: errMsg, flaggedForDelete: true, flaggedForDeleteAt: now });
      broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(task.id)! });
      if (task.devPort) releasePort(task.devPort);
      const failed = getTask(task.id);
      if (failed?.containerId) killImmediate(failed.containerId).catch(() => {});
      await killTaskContainerIfExists(task.id);
    };

    if (existingContainerId && existingWorktreePath) {
      // READY → container is already configured and running; reuse it directly
      launchClaude(task.id, existingContainerId, existingWorktreePath).catch(onError);
    } else {
      // FAILED or no container → full respawn
      updateTask(task.id, { containerId: undefined });
      const repoConfig = loadRepoConfig(task.repoPath);
      const globalConfig = getGlobalConfig();
      const merged = mergeConfigs(globalConfig, repoConfig);
      const devcontainerConfig = readDevcontainerConfig(task.repoPath);
      spawnTask(fastify, getTask(task.id)!, devcontainerConfig, merged, undefined).catch(onError);
    }

    return { ok: true };
  });

  // SSE log stream
  fastify.get<{ Params: { id: string } }>('/tasks/:id/logs', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const terminal = ['DONE', 'FAILED', 'KILLED', 'DISCARDED', 'READY'].includes(task.status);

    if (terminal) {
      // Ended task: replay full archive then send end event so the client
      // knows not to reconnect, then close.
      const chunks = getLastNChunks(task.id, RING_SIZE);
      for (const chunk of chunks) {
        reply.raw.write(`data: ${chunk}\n\n`);
      }
      reply.raw.write('data: {"type":"end"}\n\n');
      reply.raw.end();
      return;
    }

    // Active task: if the ring buffer is cold (server restart, no active stream),
    // populate it from the DB before any client reads it.
    if (!hasActiveStream(task.id)) {
      preloadFromDb(task.id);
    }

    const onLine = (line: string) => {
      reply.raw.write(`data: ${line}\n\n`);
    };
    const onEnd = () => {
      reply.raw.write('data: {"type":"end"}\n\n');
      reply.raw.end();
    };

    // Subscribe before flushing the ring buffer snapshot. JavaScript is
    // single-threaded so no pushLine() can fire mid-flush, but this removes
    // the async gap that existed with the old dynamic import().
    logEmitter.on(`log:${task.id}`, onLine);
    logEmitter.once(`end:${task.id}`, onEnd);

    const buffer = getRingBuffer(task.id);
    for (const line of buffer) {
      reply.raw.write(`data: ${line}\n\n`);
    }

    // Send a comment heartbeat every 25 s to prevent proxies and browsers
    // from silently timing out idle SSE connections.
    const heartbeat = setInterval(() => {
      reply.raw.write(':\n\n');
    }, 25_000);

    // Keep the handler suspended until the client disconnects so Fastify does
    // not finalize the response after the async function returns.
    await new Promise<void>((resolve) => {
      req.raw.on('close', () => {
        clearInterval(heartbeat);
        logEmitter.off(`log:${task.id}`, onLine);
        logEmitter.off(`end:${task.id}`, onEnd);
        resolve();
      });
    });
  });

  // Prompts history
  fastify.get('/prompts', async (req) => {
    const query = (req.query as Record<string, string>);
    const limit = query.limit ? parseInt(query.limit) : 50;
    const offset = query.offset ? parseInt(query.offset) : 0;
    return listPrompts(limit, offset);
  });

  // Commit worktree changes
  fastify.post<{ Params: { id: string }; Body: { message?: string } }>('/tasks/:id/commit', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    if (!task.worktreePath) return reply.status(400).send({ error: 'No worktree for this task' });

    const message = req.body?.message?.trim();
    if (!message) return reply.status(400).send({ error: 'Commit message required' });

    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    try {
      await execFileAsync('git', ['add', '-A'], { cwd: task.worktreePath });
      await execFileAsync('git', ['commit', '-m', message], { cwd: task.worktreePath });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: msg });
    }
  });

  // Merge worktree branch into baseBranch
  fastify.post<{ Params: { id: string }; Body: { squash?: boolean; message?: string; ffOnly?: boolean; stageAll?: boolean } }>('/tasks/:id/merge', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    if (!task.worktreePath) return reply.status(400).send({ error: 'No worktree for this task' });

    const { squash = false, message, ffOnly = false, stageAll = true } = req.body ?? {};
    if (squash && !message?.trim()) return reply.status(400).send({ error: 'Commit message required for squash merge' });

    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    const cwd = task.repoPath;
    const worktreeCwd = task.worktreePath;

    if (stageAll) {
      try {
        await execFileAsync('git', ['add', '-A'], { cwd: worktreeCwd });
        const { stdout: status } = await execFileAsync('git', ['status', '--porcelain'], { cwd: worktreeCwd });
        if (status.trim()) {
          const autoMsg = `auto: stage all changes\n\n${task.prompt.split('\n')[0].slice(0, 72)}`;
          await execFileAsync('git', ['commit', '-m', autoMsg], { cwd: worktreeCwd });
        }
      } catch (err) {
        const e = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
        const msg = (e.stderr || e.stdout || e.message || String(err)).trim() || 'Failed to stage changes';
        return reply.status(500).send({ error: msg });
      }
    }

    try {
      await execFileAsync('git', ['checkout', task.baseBranch], { cwd });

      if (ffOnly) {
        await execFileAsync('git', ['merge', '--ff-only', task.branchName], { cwd });
      } else if (squash) {
        await execFileAsync('git', ['merge', '--squash', task.branchName], { cwd });
        await execFileAsync('git', ['commit', '-m', message!.trim()], { cwd });
      } else {
        await execFileAsync('git', ['merge', '--no-ff', task.branchName, '-m', `Merge branch '${task.branchName}'`], { cwd });
      }

      return { ok: true };
    } catch (err) {
      await execFileAsync('git', ['merge', '--abort'], { cwd }).catch(() => {});
      const e = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
      const msg = (e.stderr || e.stdout || e.message || String(err)).trim() || 'Merge failed';
      return reply.status(500).send({ error: msg });
    }
  });

  // Open in editor
  fastify.post<{ Params: { id: string } }>('/tasks/:id/open-editor', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    const pathToOpen = task.worktreePath ?? task.repoPath;
    const config = getGlobalConfig();
    const { spawn } = await import('child_process');
    spawn(config.editorCommand, [pathToOpen], { detached: true, stdio: 'ignore' }).unref();

    return { ok: true };
  });

  // ── Stage control endpoints ───────────────────────────────────────────────

  // Continue past a manual gate (workflow_status = waiting_gate)
  fastify.post<{ Params: { id: string }; Body: { extraContext?: string } }>('/tasks/:id/stage/continue', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    if (task.workflowStatus !== 'waiting_gate') {
      return reply.status(400).send({ error: 'Task is not at a manual gate' });
    }
    if (!task.workflowName || !task.workflowStage) {
      return reply.status(400).send({ error: 'Task has no active workflow stage' });
    }

    const { getWorkflow } = await import('../db/workflows.js');
    const { startStage } = await import('../workers/workflow.js');
    const wf = getWorkflow(task.workflowName);
    if (!wf) return reply.status(404).send({ error: `Workflow '${task.workflowName}' not found` });

    const stage = wf.stages.find(s => s.id === task.workflowStage);
    if (!stage) return reply.status(404).send({ error: `Stage '${task.workflowStage}' not found in workflow` });

    await startStage(task, stage, wf, req.body?.extraContext);
    return { ok: true };
  });

  // Skip current stage, advance to next
  fastify.post<{ Params: { id: string } }>('/tasks/:id/stage/skip', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    if (!task.workflowName || !task.workflowStage) {
      return reply.status(400).send({ error: 'Task has no active workflow' });
    }

    const { getWorkflow } = await import('../db/workflows.js');
    const { startStage } = await import('../workers/workflow.js');
    const wf = getWorkflow(task.workflowName);
    if (!wf) return reply.status(404).send({ error: `Workflow not found` });

    const skipped = [...(task.workflowSkippedStages ?? []), task.workflowStage];
    updateTask(task.id, { workflowSkippedStages: skipped });

    const currentTask = getTask(task.id)!;
    const remaining = wf.stages.filter(s => !skipped.includes(s.id));
    const afterCurrent = remaining.filter(s => {
      const allIds = wf.stages.map(x => x.id);
      return allIds.indexOf(s.id) > allIds.indexOf(task.workflowStage!);
    });

    if (!afterCurrent.length) {
      // No more stages
      updateTask(task.id, { workflowStatus: 'complete', status: 'READY', completedAt: new Date() });
      broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(task.id)! });
      return { ok: true };
    }

    await startStage(currentTask, afterCurrent[0], wf);
    return { ok: true };
  });

  // Re-run current stage from scratch
  fastify.post<{ Params: { id: string } }>('/tasks/:id/stage/rerun', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    if (!task.workflowName || !task.workflowStage) {
      return reply.status(400).send({ error: 'Task has no active workflow' });
    }

    const { getWorkflow } = await import('../db/workflows.js');
    const { startStage } = await import('../workers/workflow.js');
    const wf = getWorkflow(task.workflowName);
    if (!wf) return reply.status(404).send({ error: `Workflow not found` });

    const stage = wf.stages.find(s => s.id === task.workflowStage);
    if (!stage) return reply.status(404).send({ error: `Stage not found` });

    await startStage(task, stage, wf);
    return { ok: true };
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function extractAssistantText(chunks: string[]): string[] {
  const lines: string[] = [];
  for (const chunk of chunks) {
    try {
      const parsed = JSON.parse(chunk);
      if (parsed.type === 'assistant' && parsed.message?.content) {
        for (const block of parsed.message.content) {
          if (block.type === 'text') {
            lines.push(...(block.text as string).split('\n').filter(Boolean));
          }
        }
      } else if (parsed.type === 'text' && typeof parsed.text === 'string') {
        lines.push(parsed.text);
      }
    } catch {
      // raw text line
      lines.push(chunk);
    }
  }
  return lines;
}

async function spawnTask(
  fastify: { log: { error: (err: unknown, msg: string) => void; info: (msg: string) => void; warn: (msg: string) => void } },
  task: Task,
  devcontainerConfig: import('@lacc/shared').DevcontainerConfig | null,
  merged: import('../config/repo.js').MergedConfig,
  anthropicBaseUrl: string | undefined
): Promise<void> {
  const taskId = task.id;

  // 1. Create worktree (skip if already exists from a previous attempt)
  let worktreePath = task.worktreePath;
  if (!worktreePath) {
    worktreePath = await createWorktree(
      task.repoPath,
      taskId,
      task.branchName,
      task.baseBranch
    );
    updateTask(taskId, { worktreePath });
  }

  // Re-claim devPort if it was released at completion but is still assigned in the DB
  // (feedback/restart re-use the same port; it may no longer be in usedPorts)
  const currentTask = getTask(taskId)!;
  if (currentTask.devPort) {
    const claimed = reclaimPort(currentTask.devPort);
    if (!claimed) {
      // Port was already grabbed by another task in the window between release and re-spawn.
      // Log and continue — the container bind will fail at configure() which is caught by the error handler.
      fastify.log.warn(`Port ${currentTask.devPort} already taken when re-spawning task ${taskId}`);
    }
  }

  // 2. Claim or cold-create container
  const claimed = await claim();
  const claimedContainerId = claimed?.containerId ?? null;
  const poolEntryId = claimed?.id ?? null;

  // 3. Configure container with task mounts (Issue 3: stop+rm+recreate)
  const taskWithUrl = { ...task, anthropicBaseUrl } as Task & { anthropicBaseUrl?: string };
  const containerId = await configure(poolEntryId, claimedContainerId, taskWithUrl, worktreePath);
  updateTask(taskId, { containerId }); // save containerId early so error handlers can kill it

  // 4. Run postCreateCommand if defined
  if (merged.postCreateCommand) {
    await runPostCreate(containerId, merged.postCreateCommand);
  }

  // 5. Refill pool (fire-and-forget)
  const config = getGlobalConfig();
  maintain(config.poolSize).catch(err => fastify.log.error(err, 'Maintain pool error'));

  // 5.5 If a workflow is configured, resolve the first stage prompt and inject it.
  const taskAfterSetup = getTask(taskId)!;
  if (taskAfterSetup.workflowName) {
    const { getWorkflow, getStep } = await import('../db/workflows.js');
    const { resolveTemplateVars } = await import('../workers/workflow.js');
    const wf = getWorkflow(taskAfterSetup.workflowName);
    if (wf) {
      const skipped = taskAfterSetup.workflowSkippedStages ?? [];
      const firstStage = wf.stages.find(s => !skipped.includes(s.id));
      if (firstStage) {
        const step = getStep(firstStage.step);
        if (step) {
          const stagePrompt = resolveTemplateVars(step.prompt, taskAfterSetup, wf);
          const userContext = task.prompt?.trim();
          const combinedPrompt = userContext
            ? `${stagePrompt}\n\n---\nAdditional context from user:\n${userContext}`
            : stagePrompt;
          updateTask(taskId, {
            prompt: combinedPrompt,
            workflowStage: firstStage.id,
            workflowStatus: 'running',
          });
        }
      }
    }
  }

  // 6. Launch Claude and wire monitors
  await launchClaude(taskId, containerId, worktreePath);
}
