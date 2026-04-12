import fs from 'fs';
import { getDb } from '../db/init.js';
import { listActiveNonTerminalTasks, updateTask, listTasks, getTask } from '../db/tasks.js';
import { listAllPooled, removePooled } from '../db/pool.js';
import { cleanupWorktree } from '../git/worktree.js';
import { cleanupCheckpointRefs } from '../workflows/checkpoints.js';
import { docker, killImmediate, resumeContainer, pauseContainer, resumeClaudeAfterRateLimit, watchExecUntilDone } from '../containers/lifecycle.js';
import { hasActiveStream, startLogPipe } from '../streaming/logs.js';
import { startCostParser } from '../streaming/cost.js';
import { startRateLimitWatcher } from '../streaming/ratelimit.js';
import { startCompletionDetector } from '../streaming/completion.js';
import { startDevServerDetector } from '../streaming/devserver.js';
import { startSpinDetector } from './spin.js';
import { getGlobalConfig } from '../config/global.js';
import { loadRepoConfig, mergeConfigs } from '../config/repo.js';
import { teardownProxy } from '../devserver/proxy.js';
import { broadcastWsEvent } from '../index.js';
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_INTERVAL_MS = 30 * 1000; // 30 seconds

export function startCleanupWorker(): void {
  setInterval(runCleanup, INTERVAL_MS).unref();
  setInterval(resumeRateLimited, RATE_LIMIT_INTERVAL_MS).unref();
}

async function resumeRateLimited(): Promise<void> {
  const config = getGlobalConfig();
  if (!config.autoResumeRateLimited) return;

  const db = getDb();
  const now = Date.now();
  const tasks = db.prepare(
    `SELECT id, container_id, worktree_path, dev_port FROM tasks
     WHERE status = 'RATE_LIMITED'
       AND rate_limit_retry_after IS NOT NULL
       AND rate_limit_retry_after <= ?
       AND container_id IS NOT NULL`
  ).all(now) as Array<{ id: string; container_id: string; worktree_path: string | null; dev_port: number | null }>;

  for (const { id, container_id, worktree_path, dev_port } of tasks) {
    try {
      if (hasActiveStream(id)) {
        // Normal case: exec stream is still alive, Claude is frozen — just unpause
        await resumeContainer(container_id);
      } else {
        // Post-restart case: exec stream is gone — kill frozen process and reconnect via --continue
        const task = getTask(id)!;
        let stream: NodeJS.ReadableStream;
        let exec: import('dockerode').Exec;
        try {
          ({ stream, exec } = await resumeClaudeAfterRateLimit(container_id, task));
        } catch (resumeErr) {
          // Unpause succeeded but exec failed — re-pause so the next 30s tick can retry cleanly
          await pauseContainer(container_id).catch(() => {});
          throw resumeErr;
        }
        const { randomUUID } = await import('crypto');
        const execId = randomUUID();
        startLogPipe(id, stream, execId);
        watchExecUntilDone(exec, id, execId).catch(() => {});
        startCostParser(id, execId);
        if (worktree_path) startSpinDetector(id, worktree_path, execId);
        startRateLimitWatcher(id, container_id, execId);
        startCompletionDetector(id, execId);
        startDevServerDetector(id, dev_port, execId);
      }
      updateTask(id, { status: 'WORKING', rateLimitRetryAfter: null });
      broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(id)! });
      console.log(`[cleanup] Auto-resumed rate-limited task ${id}`);
    } catch (err) {
      console.error(`[cleanup] Failed to auto-resume task ${id}:`, err);
    }
  }
}

async function runCleanup(): Promise<void> {
  try {
    await cleanupTerminalContainers();
    await cleanupFlaggedWorktrees();
    await cleanupOrphans();
    await cleanupStaleProxies();
  } catch (err) {
    console.error('Cleanup worker error:', err);
  }
}

async function cleanupTerminalContainers(): Promise<void> {
  const db = getDb();
  const tasks = db.prepare(
    "SELECT id, container_id FROM tasks WHERE status IN ('DONE', 'KILLED', 'FAILED', 'DISCARDED') AND container_id IS NOT NULL"
  ).all() as Array<{ id: string; container_id: string }>;

  for (const { id, container_id } of tasks) {
    try {
      await killImmediate(container_id);
      updateTask(id, { containerId: undefined });
    } catch (err) {
      console.error(`Cleanup: failed to remove container ${container_id}:`, err);
    }
  }
}

async function cleanupFlaggedWorktrees(): Promise<void> {
  const db = getDb();
  const tasks = db.prepare(
    `SELECT id, worktree_path, branch_name
     FROM tasks
     WHERE archive_state IN ('archived', 'summary', 'deleted')
       AND worktree_path IS NOT NULL`
  ).all() as Array<{ id: string; worktree_path: string; branch_name: string }>;

  for (const task of tasks) {
    try {
      if (fs.existsSync(task.worktree_path)) {
        await cleanupCheckpointRefs(task.id, task.worktree_path);
        await cleanupWorktree(task.worktree_path, task.branch_name);
        fs.rmSync(task.worktree_path, { recursive: true, force: true });
      }
      updateTask(task.id, { worktreePath: null });
    } catch (err) {
      console.error(`Cleanup: failed to remove worktree ${task.worktree_path}:`, err);
    }
  }
}

async function cleanupStaleProxies(): Promise<void> {
  const db = getDb();
  const tasks = db.prepare(
    `SELECT id, repo_path FROM tasks
     WHERE status IN ('DONE', 'KILLED', 'FAILED', 'DISCARDED')
       AND dev_server_mode = 'proxy'
       AND dev_server_url IS NOT NULL`
  ).all() as Array<{ id: string; repo_path: string }>;

  for (const row of tasks) {
    const task = getTask(row.id);
    if (!task) continue;
    try {
      const repoConfig = loadRepoConfig(row.repo_path);
      await teardownProxy(task, repoConfig);
      // Clear devServerUrl to prevent re-processing
      updateTask(row.id, { devServerUrl: null });
    } catch (err) {
      console.error(`Cleanup: proxy teardown failed for task ${row.id}:`, err);
    }
  }
}

async function cleanupOrphans(): Promise<void> {
  // Find all containers labeled as lacc
  const containers = await docker.listContainers({
    all: false, // only running
    filters: JSON.stringify({ label: ['lacc=true'] }),
  });

  const db = getDb();
  const knownTaskContainers = new Set(
    (db.prepare("SELECT container_id FROM tasks WHERE container_id IS NOT NULL").all() as Array<{ container_id: string }>)
      .map(r => r.container_id)
  );

  const pooledIds = new Set(
    listAllPooled().map(p => p.containerId)
  );

  for (const c of containers) {
    if (!knownTaskContainers.has(c.Id) && !pooledIds.has(c.Id)) {
      console.log(`Cleanup: removing orphan container ${c.Id}`);
      await killImmediate(c.Id).catch(err => console.error('Orphan removal failed:', err));
    }
  }

  // Clean dead pool entries
  const allPooled = listAllPooled();
  const runningIds = new Set(containers.map(c => c.Id));
  for (const entry of allPooled) {
    if (!runningIds.has(entry.containerId)) {
      removePooled(entry.id);
    }
  }
}
