import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import Fastify from 'fastify';
import { registerTaskRoutes } from '../../src/routes/tasks.js';
import { createTestTask } from '../helpers/factories.js';
import { insertCheckpoint } from '../../src/db/checkpoints.js';

let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await app.register(import('@fastify/websocket'));
  registerTaskRoutes(app);
  await app.ready();
});

afterAll(() => app.close());

describe('GET /tasks/:id/checkpoints', () => {
  it('returns 404 for unknown task', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/tasks/non-existent/checkpoints',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns empty array for task with no checkpoints', async () => {
    const task = createTestTask({ workflowName: 'test-workflow' });
    const res = await app.inject({
      method: 'GET',
      url: `/tasks/${task.id}/checkpoints`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns checkpoints with stage names from workflow', async () => {
    const task = createTestTask({
      workflowName: 'test-workflow',
      workflowStage: 'stage-2',
      workflowStatus: 'running',
    });

    insertCheckpoint({
      id: randomUUID(),
      taskId: task.id,
      stageId: 'initial',
      gitRef: `refs/lacc/checkpoints/${task.id}/initial`,
      worktreePath: '/tmp/test-worktree',
      createdAt: new Date(1000),
    });
    insertCheckpoint({
      id: randomUUID(),
      taskId: task.id,
      stageId: 'stage-1',
      gitRef: `refs/lacc/checkpoints/${task.id}/stage-1`,
      worktreePath: '/tmp/test-worktree',
      createdAt: new Date(2000),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/tasks/${task.id}/checkpoints`,
    });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0].stageId).toBe('initial');
    expect(body[0].stageName).toBe('Initial state');
    expect(body[0].isCurrent).toBe(false);
    expect(body[1].stageId).toBe('stage-1');
    expect(body[1].stageName).toBe('Stage 1'); // resolved from workflow mock
    expect(body[1].isCurrent).toBe(false);
  });

  it('marks current stage checkpoint as isCurrent', async () => {
    const task = createTestTask({
      workflowName: 'test-workflow',
      workflowStage: 'stage-1',
      workflowStatus: 'waiting_gate',
    });

    insertCheckpoint({
      id: randomUUID(),
      taskId: task.id,
      stageId: 'stage-1',
      gitRef: `refs/lacc/checkpoints/${task.id}/stage-1`,
      worktreePath: '/tmp/test-worktree',
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: `/tasks/${task.id}/checkpoints`,
    });
    expect(res.json()[0].isCurrent).toBe(true);
  });
});

describe('POST /tasks/:id/checkpoints/:stageId/restore', () => {
  it('returns 404 for unknown task', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/tasks/non-existent/checkpoints/spec/restore',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when task is actively running', async () => {
    const task = createTestTask({
      workflowName: 'test-workflow',
      workflowStage: 'stage-2',
      workflowStatus: 'running',
    });

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/checkpoints/stage-1/restore`,
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 200 and restores when task is at gate', async () => {
    const task = createTestTask({
      workflowName: 'test-workflow',
      workflowStage: 'stage-2',
      workflowStatus: 'waiting_gate',
      status: 'READY',
    });

    insertCheckpoint({
      id: randomUUID(),
      taskId: task.id,
      stageId: 'stage-1',
      gitRef: `refs/lacc/checkpoints/${task.id}/stage-1`,
      worktreePath: '/tmp/test-worktree',
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/checkpoints/stage-1/restore`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, restoredTo: 'stage-1' });
  });

  it('returns 200 for completed workflow tasks', async () => {
    const task = createTestTask({
      workflowName: 'test-workflow',
      workflowStage: 'stage-3',
      workflowStatus: 'complete',
      status: 'READY',
    });

    insertCheckpoint({
      id: randomUUID(),
      taskId: task.id,
      stageId: 'stage-1',
      gitRef: `refs/lacc/checkpoints/${task.id}/stage-1`,
      worktreePath: '/tmp/test-worktree',
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/tasks/${task.id}/checkpoints/stage-1/restore`,
    });
    expect(res.statusCode).toBe(200);
  });
});
