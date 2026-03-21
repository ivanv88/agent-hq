import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { registerTaskRoutes } from '../../src/routes/tasks.js';
import { createTestTask } from '../helpers/factories.js';

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(import('@fastify/websocket'));
  registerTaskRoutes(app);
  await app.ready();
});

afterAll(() => app.close());

describe('POST /tasks/:id/stage/continue', () => {
  it('returns 409 when task not at gate', async () => {
    const task = createTestTask({
      workflowName: 'test-workflow',
      workflowStage: 'stage-1',
      workflowStatus: 'running',   // not waiting_gate
    });

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/stage/continue`,
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 404 for unknown task', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/non-existent/stage/continue',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 200 and advances stage when at gate', async () => {
    const task = createTestTask({
      workflowName: 'test-workflow',
      workflowStage: 'stage-2',
      workflowStatus: 'waiting_gate',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/stage/continue`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});

describe('POST /tasks/:id/stage/skip', () => {
  it('returns 409 for task without workflow', async () => {
    const task = createTestTask({
      workflowName: null,
      workflowStage: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/stage/skip`,
    });
    expect(res.statusCode).toBe(400);
  });
});
