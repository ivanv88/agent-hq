import type { FastifyInstance } from 'fastify';
import { getTask } from '../db/tasks.js';
import { gitPull, gitPush, gitRebase, gitReset, gitStash, gitStashPop } from '../git/operations.js';

export async function registerGitRoutes(fastify: FastifyInstance): Promise<void> {
  function getWorktree(id: string, reply: any): string | null {
    const task = getTask(id);
    if (!task) { reply.code(404).send({ error: 'Task not found' }); return null; }
    if (!task.worktreePath) { reply.code(409).send({ error: 'Task has no worktree' }); return null; }
    return task.worktreePath;
  }

  fastify.post<{ Params: { id: string } }>('/tasks/:id/git/pull', async (req, reply) => {
    const wt = getWorktree(req.params.id, reply);
    if (!wt) return;
    return gitPull(wt);
  });

  fastify.post<{ Params: { id: string } }>('/tasks/:id/git/push', async (req, reply) => {
    const wt = getWorktree(req.params.id, reply);
    if (!wt) return;
    return gitPush(wt);
  });

  fastify.post<{ Params: { id: string }; Body: { branch?: string } }>(
    '/tasks/:id/git/rebase',
    async (req, reply) => {
      const wt = getWorktree(req.params.id, reply);
      if (!wt) return;
      return gitRebase(wt, req.body?.branch);
    }
  );

  fastify.post<{ Params: { id: string }; Body: { hard?: boolean } }>(
    '/tasks/:id/git/reset',
    async (req, reply) => {
      const wt = getWorktree(req.params.id, reply);
      if (!wt) return;
      return gitReset(wt, req.body?.hard);
    }
  );

  fastify.post<{ Params: { id: string } }>('/tasks/:id/git/stash', async (req, reply) => {
    const wt = getWorktree(req.params.id, reply);
    if (!wt) return;
    return gitStash(wt);
  });

  fastify.post<{ Params: { id: string } }>('/tasks/:id/git/stash/pop', async (req, reply) => {
    const wt = getWorktree(req.params.id, reply);
    if (!wt) return;
    return gitStashPop(wt);
  });
}
