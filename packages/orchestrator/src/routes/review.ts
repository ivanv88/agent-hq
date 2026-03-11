import type { FastifyInstance } from 'fastify';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getTask, updateTask } from '../db/tasks.js';
import { broadcastWsEvent } from '../index.js';
import { getDiff } from '../git/worktree.js';
import { killImmediate } from '../containers/lifecycle.js';
import { releasePort } from '../containers/ports.js';
import { stopSpinDetector } from '../workers/spin.js';
import { stopRateLimitWatcher } from '../streaming/ratelimit.js';
import { SaveMemoryInputSchema } from '@lacc/shared';

const execFileAsync = promisify(execFile);

export function registerReviewRoutes(fastify: FastifyInstance) {
  // GET diff
  fastify.get<{ Params: { id: string } }>('/tasks/:id/diff', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    if (!['READY', 'DONE'].includes(task.status)) {
      return reply.status(409).send({ error: 'Task not in reviewable state' });
    }

    if (!task.worktreePath) {
      return reply.status(409).send({ error: 'No worktree available' });
    }

    const diff = await getDiff(task.worktreePath, task.baseBranch);
    return diff;
  });

  // Merge & Complete → merge worktree branch into baseBranch, then kill container + remove worktree
  fastify.post<{
    Params: { id: string };
    Body: { squash?: boolean; message?: string; ffOnly?: boolean; stageAll?: boolean };
  }>('/tasks/:id/complete', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    if (task.status !== 'READY') return reply.status(409).send({ error: 'Task not in READY state' });
    if (!task.worktreePath) return reply.status(409).send({ error: 'No worktree for this task' });

    const { squash = false, message, ffOnly = false, stageAll = true } = req.body ?? {};
    if (squash && !message?.trim()) return reply.status(400).send({ error: 'Commit message required for squash merge' });

    const cwd = task.repoPath;
    const worktreeCwd = task.worktreePath;

    // Stage and commit any uncommitted changes in the worktree before merging
    if (stageAll) {
      try {
        await execFileAsync('git', ['add', '-A'], { cwd: worktreeCwd });
        // Only commit if something was staged
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

    // Merge branch into baseBranch
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
    } catch (err) {
      await execFileAsync('git', ['merge', '--abort'], { cwd }).catch(() => {});
      const e = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
      const msg = (e.stderr || e.stdout || e.message || String(err)).trim() || 'Merge failed';
      return reply.status(500).send({ error: msg });
    }

    // Merge succeeded — kill container and release port
    if (task.containerId) {
      await killImmediate(task.containerId).catch(() => {});
    }
    if (task.devPort) releasePort(task.devPort);

    // Remove worktree and branch immediately
    await execFileAsync('git', ['worktree', 'remove', '--force', task.worktreePath], { cwd }).catch(() => {});
    await execFileAsync('git', ['branch', '-D', task.branchName], { cwd }).catch(() => {});

    const now = new Date();
    updateTask(task.id, {
      status: 'DONE',
      completedAt: now,
      containerId: undefined,
      worktreePath: null,
      flaggedForDelete: false,
      flaggedForDeleteAt: null,
    });

    broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(task.id)! });
    return { ok: true };
  });

  // Discard → DISCARDED (kills container, removes worktree, deletes branch immediately)
  fastify.post<{ Params: { id: string } }>('/tasks/:id/discard', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    if (task.containerId) {
      await killImmediate(task.containerId).catch(() => {});
    }
    stopSpinDetector(task.id);
    stopRateLimitWatcher(task.id);
    if (task.devPort) releasePort(task.devPort);

    // Remove worktree and delete branch immediately on discard
    if (task.worktreePath) {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      const cwd = task.repoPath;
      await execFileAsync('git', ['worktree', 'remove', '--force', task.worktreePath], { cwd }).catch(() => {});
      await execFileAsync('git', ['branch', '-D', task.branchName], { cwd }).catch(() => {});
    }

    const now = new Date();
    updateTask(task.id, {
      status: 'DISCARDED',
      completedAt: now,
      containerId: undefined,
      worktreePath: null,
      flaggedForDelete: true,
      flaggedForDeleteAt: now,
    });

    broadcastWsEvent({ type: 'TASK_UPDATED', task: getTask(task.id)! });
    reply.status(204).send();
  });

  // Save memory
  fastify.post<{ Params: { id: string } }>('/tasks/:id/memory', async (req, reply) => {
    const task = getTask(req.params.id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    const result = SaveMemoryInputSchema.safeParse(req.body);
    if (!result.success) {
      return reply.status(400).send({ error: 'Invalid input', details: result.error.flatten() });
    }

    const { content, target } = result.data;

    if (target === 'auto') {
      // Append to ~/.claude/projects/<hash>/memory/lacc-notes.md
      const repoHash = crypto.createHash('md5').update(task.repoPath).digest('hex').slice(0, 8);
      const memDir = path.join(os.homedir(), '.claude', 'projects', repoHash, 'memory');
      fs.mkdirSync(memDir, { recursive: true });
      const memPath = path.join(memDir, 'lacc-notes.md');
      fs.appendFileSync(memPath, `\n${content}\n`);
      const lines = fs.readFileSync(memPath, 'utf-8').split('\n').length;
      return { written: true, path: memPath, lineCount: lines };
    } else {
      // Append to worktree CLAUDE.md
      if (!task.worktreePath) {
        return reply.status(409).send({ error: 'No worktree' });
      }
      const claudePath = path.join(task.worktreePath, 'CLAUDE.md');
      fs.appendFileSync(claudePath, `\n${content}\n`);
      const lines = fs.readFileSync(claudePath, 'utf-8').split('\n').length;
      return { written: true, path: claudePath, lineCount: lines };
    }
  });

}
