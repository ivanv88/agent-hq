import { describe, it, expect, vi, beforeEach } from 'vitest';
import { advanceWorkflow } from '../../../src/workflows/engine.js';
import { getTask } from '../../../src/db/tasks.js';
import { createTestTask, createTestWorkflow } from '../../helpers/factories.js';
import { startClaude } from '../../../src/containers/lifecycle.js';

describe('advanceWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('advances to next stage on auto gate', async () => {
    const task = createTestTask({
      workflowStage: 'stage-1',
      workflowStatus: 'running',
    });
    const workflow = createTestWorkflow([
      { id: 'stage-1', gate: 'auto' },
      { id: 'stage-2', gate: 'manual' },
    ]);

    await advanceWorkflow(task.id, workflow);

    const updated = getTask(task.id)!;
    expect(updated.workflowStage).toBe('stage-2');
    expect(updated.workflowStatus).toBe('waiting_gate');
  });

  it('pauses at manual gate without launching Claude', async () => {
    const task = createTestTask({
      workflowStage: 'stage-1',
      workflowStatus: 'running',
    });
    const workflow = createTestWorkflow([
      { id: 'stage-1', gate: 'manual' },
      { id: 'stage-2', gate: 'auto' },
    ]);

    await advanceWorkflow(task.id, workflow);

    expect(startClaude).not.toHaveBeenCalled();
    const updated = getTask(task.id)!;
    expect(updated.workflowStatus).toBe('waiting_gate');
  });

  it('launches Claude immediately on auto gate', async () => {
    const task = createTestTask({
      workflowStage: 'stage-1',
      workflowStatus: 'running',
    });
    const workflow = createTestWorkflow([
      { id: 'stage-1', gate: 'auto' },
      { id: 'stage-2', gate: 'auto' },
    ]);

    await advanceWorkflow(task.id, workflow);

    expect(startClaude).toHaveBeenCalledOnce();
  });

  it('completes task after final stage with GATE_ON_COMPLETION oversight', async () => {
    const task = createTestTask({
      workflowStage: 'stage-2',
      workflowStatus: 'running',
      oversightMode: 'GATE_ON_COMPLETION',
    });
    const workflow = createTestWorkflow([
      { id: 'stage-1', gate: 'auto' },
      { id: 'stage-2', gate: 'auto' },
    ]);

    await advanceWorkflow(task.id, workflow);

    const updated = getTask(task.id)!;
    expect(updated.status).toBe('READY');
    expect(updated.workflowStatus).toBe('complete');
  });

  it('completes task as DONE with NOTIFY_ONLY oversight', async () => {
    const task = createTestTask({
      workflowStage: 'stage-2',
      workflowStatus: 'running',
      oversightMode: 'NOTIFY_ONLY',
    });
    const workflow = createTestWorkflow([
      { id: 'stage-1', gate: 'auto' },
      { id: 'stage-2', gate: 'auto' },
    ]);

    await advanceWorkflow(task.id, workflow);

    const updated = getTask(task.id)!;
    expect(updated.status).toBe('DONE');
  });

  it('is idempotent — does not double-advance on concurrent calls', async () => {
    const task = createTestTask({
      workflowStage: 'stage-1',
      workflowStatus: 'running',
    });
    const workflow = createTestWorkflow([
      { id: 'stage-1', gate: 'auto' },
      { id: 'stage-2', gate: 'auto' },
      { id: 'stage-3', gate: 'auto' },
    ]);

    await Promise.all([
      advanceWorkflow(task.id, workflow),
      advanceWorkflow(task.id, workflow),
    ]);

    const updated = getTask(task.id)!;
    expect(updated.workflowStage).toBe('stage-2'); // not stage-3
  });

  it('skips optional stages marked as skipped', async () => {
    const task = createTestTask({
      workflowStage: 'stage-1',
      workflowStatus: 'running',
      workflowSkippedStages: ['stage-2'],
    });
    const workflow = createTestWorkflow([
      { id: 'stage-1', gate: 'auto' },
      { id: 'stage-2', gate: 'auto', optional: true },
      { id: 'stage-3', gate: 'manual' },
    ]);

    await advanceWorkflow(task.id, workflow);

    const updated = getTask(task.id)!;
    expect(updated.workflowStage).toBe('stage-3'); // skipped stage-2
  });
});
