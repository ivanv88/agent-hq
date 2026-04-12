import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { createTestTask } from '../helpers/factories.js';

vi.mock('../../src/git/operations.js', () => ({
  gitPull: vi.fn().mockResolvedValue({ ok: true }),
  gitPush: vi.fn().mockResolvedValue({ ok: true }),
  gitRebase: vi.fn().mockResolvedValue({ ok: true }),
  gitReset: vi.fn().mockResolvedValue({ ok: true }),
  gitStash: vi.fn().mockResolvedValue({ ok: true }),
  gitStashPop: vi.fn().mockResolvedValue({ ok: true }),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  const { registerGitRoutes } = await import('../../src/routes/git.js');
  registerGitRoutes(app);
  await app.ready();
});

afterAll(() => app.close());

describe('POST /tasks/:id/git/pull', () => {
  it('returns 200 with ok:true for a task with worktreePath', async () => {
    const task = createTestTask({ worktreePath: '/tmp/test-worktree' });
    const res = await app.inject({ method: 'POST', url: `/tasks/${task.id}/git/pull` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true });
  });

  it('returns 404 for unknown task', async () => {
    const res = await app.inject({ method: 'POST', url: '/tasks/nonexistent-id/git/pull' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 for task with no worktree', async () => {
    const task = createTestTask({ worktreePath: undefined });
    const res = await app.inject({ method: 'POST', url: `/tasks/${task.id}/git/pull` });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /tasks/:id/git/push', () => {
  it('returns 200 with ok:true for a task with worktreePath', async () => {
    const task = createTestTask({ worktreePath: '/tmp/test-worktree' });
    const res = await app.inject({ method: 'POST', url: `/tasks/${task.id}/git/push` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true });
  });

  it('returns 404 for unknown task', async () => {
    const res = await app.inject({ method: 'POST', url: '/tasks/nonexistent-id/git/push' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /tasks/:id/git/rebase', () => {
  it('returns 200 with ok:true for a task with worktreePath', async () => {
    const task = createTestTask({ worktreePath: '/tmp/test-worktree' });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/git/rebase`,
      payload: { branch: 'main' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true });
  });
});

describe('POST /tasks/:id/git/stash', () => {
  it('returns 200 with ok:true for a task with worktreePath', async () => {
    const task = createTestTask({ worktreePath: '/tmp/test-worktree' });
    const res = await app.inject({ method: 'POST', url: `/tasks/${task.id}/git/stash` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true });
  });
});

describe('POST /tasks/:id/git/stash/pop', () => {
  it('returns 200 with ok:true for a task with worktreePath', async () => {
    const task = createTestTask({ worktreePath: '/tmp/test-worktree' });
    const res = await app.inject({ method: 'POST', url: `/tasks/${task.id}/git/stash/pop` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true });
  });
});

describe('POST /tasks/:id/git/reset', () => {
  it('returns 200 with ok:true for a task with worktreePath', async () => {
    const task = createTestTask({ worktreePath: '/tmp/test-worktree' });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/git/reset`,
      payload: { hard: false },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true });
  });
});
