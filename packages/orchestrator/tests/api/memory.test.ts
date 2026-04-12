import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { registerTaskRoutes } from '../../src/routes/tasks.js';
import { createTestTask } from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

vi.mock('../../src/memory/snapshot.js', () => ({
  saveMemorySnapshot: vi.fn().mockResolvedValue('# Memory\n\nTest memory content.'),
  readMemorySnapshot: vi.fn().mockReturnValue('# Memory\n\nTest memory content.'),
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(import('@fastify/websocket'));
  registerTaskRoutes(app);
  await app.ready();
});

afterAll(() => app.close());

describe('POST /tasks/:id/memory-snapshot', () => {
  it('returns 200 with content for existing task', async () => {
    const task = createTestTask({ status: 'DONE' });
    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/memory-snapshot`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('content');
    expect(body.content).toContain('Memory');
  });

  it('returns 404 for unknown task', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/nonexistent-id/memory-snapshot',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /tasks/:id/memory', () => {
  it('returns 200 with content when snapshot exists', async () => {
    const task = createTestTask({ status: 'DONE' });
    const res = await app.inject({
      method: 'GET',
      url: `/tasks/${task.id}/memory`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('content');
    expect(body.content).toContain('Memory');
  });

  it('returns 404 for unknown task', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tasks/nonexistent-id/memory',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when readMemorySnapshot returns null', async () => {
    const { readMemorySnapshot } = await import('../../src/memory/snapshot.js');
    vi.mocked(readMemorySnapshot).mockReturnValueOnce(null);

    const task = createTestTask({ status: 'DONE' });
    const res = await app.inject({
      method: 'GET',
      url: `/tasks/${task.id}/memory`,
    });
    expect(res.statusCode).toBe(404);
  });
});
