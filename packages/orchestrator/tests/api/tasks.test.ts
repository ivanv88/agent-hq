import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import { registerTaskRoutes } from '../../src/routes/tasks.js';

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(import('@fastify/websocket'));
  registerTaskRoutes(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const validSpawnInput = {
  prompt: 'add auth',
  repoPath: '/tmp/test-repo',
  oversightMode: 'GATE_ON_COMPLETION',
  taskType: 'feature',
  maxRetries: 3,
};

describe('POST /tasks', () => {
  it('returns 202 with taskId for valid input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: validSpawnInput,
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toHaveProperty('taskId');
    expect(typeof res.json().taskId).toBe('string');
  });

  it('returns 400 for missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { prompt: 'test' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid oversightMode', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { ...validSpawnInput, oversightMode: 'INVALID' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for non-git repo', async () => {
    const { isGitRepo } = await import('../../src/git/worktree.js');
    vi.mocked(isGitRepo).mockResolvedValueOnce(false);

    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: { ...validSpawnInput, repoPath: '/not/a/repo' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('NOT_A_GIT_REPO');
  });
});

describe('GET /tasks', () => {
  it('returns array', async () => {
    const res = await app.inject({ method: 'GET', url: '/tasks' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});

describe('GET /tasks/:id', () => {
  it('returns 404 for unknown task', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tasks/non-existent-id',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns task for known id', async () => {
    const spawn = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: validSpawnInput,
    });
    const { taskId } = spawn.json();

    const res = await app.inject({ method: 'GET', url: `/tasks/${taskId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(taskId);
  });
});

describe('DELETE /tasks/:id', () => {
  it('returns 404 for unknown task', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/tasks/non-existent-id',
    });
    expect(res.statusCode).toBe(404);
  });

  it('sets status to KILLED', async () => {
    const spawn = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: validSpawnInput,
    });
    const { taskId } = spawn.json();

    await app.inject({ method: 'DELETE', url: `/tasks/${taskId}` });

    const res = await app.inject({ method: 'GET', url: `/tasks/${taskId}` });
    expect(res.json().status).toBe('KILLED');
  });
});

describe('POST /tasks/:id/pause', () => {
  it('returns 409 when task has no container', async () => {
    const spawn = await app.inject({
      method: 'POST',
      url: '/tasks',
      payload: validSpawnInput,
    });
    const { taskId } = spawn.json();

    // Remove containerId to simulate no container
    const { updateTask } = await import('../../src/db/tasks.js');
    updateTask(taskId, { containerId: undefined });

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/pause`,
    });
    expect(res.statusCode).toBe(409);
  });
});
