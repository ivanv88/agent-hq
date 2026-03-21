import { describe, it, expect } from 'vitest';
import { SpawnTaskInputSchema, FeedbackInputSchema, SaveMemoryInputSchema } from '../src/schemas.js';

describe('SpawnTaskInputSchema', () => {
  it('accepts valid input', () => {
    const result = SpawnTaskInputSchema.safeParse({
      prompt: 'add auth',
      repoPath: '/tmp/repo',
      oversightMode: 'GATE_ON_COMPLETION',
      taskType: 'feature',
      maxRetries: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid oversightMode', () => {
    const result = SpawnTaskInputSchema.safeParse({
      prompt: 'add auth',
      repoPath: '/tmp/repo',
      oversightMode: 'INVALID',
      taskType: 'feature',
      maxRetries: 3,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty prompt', () => {
    const result = SpawnTaskInputSchema.safeParse({
      prompt: '',
      repoPath: '/tmp/repo',
      oversightMode: 'NOTIFY_ONLY',
      taskType: 'feature',
      maxRetries: 3,
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields as undefined', () => {
    const result = SpawnTaskInputSchema.safeParse({
      prompt: 'test',
      repoPath: '/tmp/repo',
      oversightMode: 'NOTIFY_ONLY',
      taskType: 'feature',
      maxRetries: 3,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ticket).toBeUndefined();
      expect(result.data.agentName).toBeUndefined();
    }
  });
});

describe('FeedbackInputSchema', () => {
  it('accepts valid feedback', () => {
    const result = FeedbackInputSchema.safeParse({ feedback: 'change the approach' });
    expect(result.success).toBe(true);
  });

  it('rejects empty feedback', () => {
    const result = FeedbackInputSchema.safeParse({ feedback: '' });
    expect(result.success).toBe(false);
  });
});
