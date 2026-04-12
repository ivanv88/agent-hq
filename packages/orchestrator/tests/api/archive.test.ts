import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { registerTaskRoutes } from '../../src/routes/tasks.js';
import { createTestTask } from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(import('@fastify/websocket'));
  registerTaskRoutes(app);
  await app.ready();
});

afterAll(() => app.close());

describe('POST /tasks/:id/archive', () => {
  it('returns 400 for invalid level', async () => {
    const task = createTestTask({ status: 'DONE', archiveState: 'alive' });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/archive`,
      payload: { level: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('archives a task (level: archived)', async () => {
    const task = createTestTask({ status: 'DONE', archiveState: 'alive' });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/archive`,
      payload: { level: 'archived' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.archiveState).toBe('archived');
  });

  it('returns 404 for unknown task', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/nonexistent/archive',
      payload: { level: 'archived' },
    });
    expect(res.statusCode).toBe(404);
  });
});
