import { describe, it, expect } from 'vitest';
import { getTask, updateTask, listTasks } from '../../../src/db/tasks.js';
import { createTestTask } from '../../helpers/factories.js';

describe('tasks db', () => {
  it('inserts and retrieves a task', () => {
    const task = createTestTask({ prompt: 'test insert' });
    const retrieved = getTask(task.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.prompt).toBe('test insert');
  });

  it('updates task status', () => {
    const task = createTestTask({ status: 'WORKING' });
    updateTask(task.id, { status: 'DONE' });
    expect(getTask(task.id)!.status).toBe('DONE');
  });

  it('converts dates correctly (Date ↔ integer)', () => {
    const now = new Date();
    const task = createTestTask({ startedAt: now });
    const retrieved = getTask(task.id)!;
    expect(retrieved.startedAt).toBeInstanceOf(Date);
    expect(retrieved.startedAt!.getTime()).toBeCloseTo(now.getTime(), -2);
  });

  it('returns null for unknown taskId', () => {
    expect(getTask('non-existent-id')).toBeNull();
  });

  it('listTasks returns all tasks', () => {
    const before = listTasks().length;
    createTestTask();
    createTestTask();
    expect(listTasks().length).toBe(before + 2);
  });

  it('partial update does not overwrite other fields', () => {
    const task = createTestTask({ prompt: 'original', costUsd: 1.5 });
    updateTask(task.id, { status: 'DONE' });
    const updated = getTask(task.id)!;
    expect(updated.prompt).toBe('original');
    expect(updated.costUsd).toBe(1.5);
    expect(updated.status).toBe('DONE');
  });
});
