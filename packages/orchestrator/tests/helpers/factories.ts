import { randomUUID } from 'crypto';
import type { Task, WorkflowDefinition } from '@lacc/shared';
import { insertTask } from '../../src/db/tasks.js';

export function createTestTask(overrides: Partial<Task> = {}): Task {
  const task: Task = {
    id: randomUUID(),
    prompt: 'test prompt',
    status: 'WORKING',
    oversightMode: 'GATE_ON_COMPLETION',
    taskType: 'feature',
    repoPath: '/tmp/test-repo',
    branchName: 'feat/test-branch',
    baseBranch: 'main',
    worktreePath: '/tmp/test-worktree',
    containerId: 'test-container-id',
    devPort: 4001,
    devServerMode: 'port',
    devServerUrl: null,
    model: 'claude-sonnet-4-6',
    agentName: null,
    skillNames: [],
    planFirst: false,
    maxRetries: 3,
    retryCount: 0,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    contextTokensUsed: null,
    lastFileChanged: null,
    rateLimitRetryAfter: null,
    archiveState: 'alive',
    prTitle: null,
    prBody: null,
    failureReason: null,
    workflowName: null,
    workflowStage: null,
    workflowStatus: null,
    workflowSkippedStages: [],
    createdAt: new Date(),
    startedAt: new Date(),
    completedAt: null,
    ...overrides,
  };
  insertTask(task);
  return task;
}

export function createTestWorkflow(stageOverrides: Array<{
  id: string;
  gate: 'auto' | 'manual';
  optional?: boolean;
  canLoop?: boolean;
  prompt?: string;
}>): WorkflowDefinition {
  return {
    name: 'test-workflow',
    version: 1,
    description: 'Test workflow',
    docsDir: 'ai-docs',
    tools: { skills: [], agents: [], mcp: [] },
    stages: stageOverrides.map(s => ({
      id: s.id,
      name: s.id,
      step: `${s.id}-step`,
      gate: s.gate,
      optional: s.optional ?? false,
      canLoop: s.canLoop ?? false,
    })),
  };
}
