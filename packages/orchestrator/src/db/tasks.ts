import { getDb } from './init.js';
import type { Task, TaskStatus, WorkflowStatus } from '@lacc/shared';

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    repoPath: row.repo_path as string,
    prompt: row.prompt as string,
    branchName: row.branch_name as string,
    baseBranch: (row.base_branch as string) ?? 'main',
    worktreePath: row.worktree_path as string | null,
    containerId: (row.container_id as string | null) ?? undefined,
    status: row.status as TaskStatus,
    oversightMode: row.oversight_mode as Task['oversightMode'],
    taskType: row.task_type as Task['taskType'],
    devServerMode: row.dev_server_mode as Task['devServerMode'],
    devPort: row.dev_port as number | null,
    devServerUrl: row.dev_server_url as string | null,
    model: row.model as string,
    agentName: row.agent_name as string | null,
    skillNames: JSON.parse((row.skill_names as string) ?? '[]'),
    planFirst: Boolean(row.plan_first),
    maxRetries: row.max_retries as number,
    retryCount: row.retry_count as number,
    costUsd: row.cost_usd as number,
    inputTokens: row.input_tokens as number,
    outputTokens: row.output_tokens as number,
    contextTokensUsed: row.context_tokens_used as number | null,
    lastFileChanged: row.last_file_changed as string | null,
    rateLimitRetryAfter: row.rate_limit_retry_after as number | null,
    archiveState: (row.archive_state as 'alive' | 'archived' | 'summary' | 'deleted') ?? 'alive',
    prTitle: row.pr_title as string | null,
    prBody: row.pr_body as string | null,
    failureReason: row.failure_reason as string | null,
    createdAt: new Date(row.created_at as number),
    startedAt: row.started_at ? new Date(row.started_at as number) : null,
    completedAt: row.completed_at ? new Date(row.completed_at as number) : null,
    workflowName: (row.workflow_name as string | null) ?? null,
    workflowStage: (row.workflow_stage as string | null) ?? null,
    workflowStatus: (row.workflow_status as WorkflowStatus | null) ?? null,
    workflowSkippedStages: JSON.parse((row.workflow_skipped_stages as string) ?? '[]'),
  };
}

export function insertTask(task: Task): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO tasks (
      id, repo_path, prompt, branch_name, base_branch, worktree_path, container_id,
      status, oversight_mode, task_type, dev_server_mode, dev_port, dev_server_url,
      model, agent_name, skill_names, plan_first, max_retries, retry_count,
      cost_usd, input_tokens, output_tokens, context_tokens_used, last_file_changed,
      rate_limit_retry_after, archive_state,
      pr_title, pr_body, failure_reason, created_at, started_at, completed_at,
      workflow_name, workflow_stage, workflow_status, workflow_skipped_stages
    ) VALUES (
      @id, @repoPath, @prompt, @branchName, @baseBranch, @worktreePath, @containerId,
      @status, @oversightMode, @taskType, @devServerMode, @devPort, @devServerUrl,
      @model, @agentName, @skillNames, @planFirst, @maxRetries, @retryCount,
      @costUsd, @inputTokens, @outputTokens, @contextTokensUsed, @lastFileChanged,
      @rateLimitRetryAfter, @archiveState,
      @prTitle, @prBody, @failureReason, @createdAt, @startedAt, @completedAt,
      @workflowName, @workflowStage, @workflowStatus, @workflowSkippedStages
    )
  `).run({
    id: task.id,
    repoPath: task.repoPath,
    prompt: task.prompt,
    branchName: task.branchName,
    baseBranch: task.baseBranch,
    worktreePath: task.worktreePath,
    containerId: task.containerId ?? null,
    status: task.status,
    oversightMode: task.oversightMode,
    taskType: task.taskType,
    devServerMode: task.devServerMode,
    devPort: task.devPort,
    devServerUrl: task.devServerUrl,
    model: task.model,
    agentName: task.agentName ?? null,
    skillNames: JSON.stringify(task.skillNames),
    planFirst: task.planFirst ? 1 : 0,
    maxRetries: task.maxRetries,
    retryCount: task.retryCount,
    costUsd: task.costUsd,
    inputTokens: task.inputTokens,
    outputTokens: task.outputTokens,
    contextTokensUsed: task.contextTokensUsed,
    lastFileChanged: task.lastFileChanged,
    rateLimitRetryAfter: task.rateLimitRetryAfter,
    archiveState: task.archiveState,
    prTitle: task.prTitle,
    prBody: task.prBody,
    failureReason: task.failureReason,
    createdAt: task.createdAt.getTime(),
    startedAt: task.startedAt?.getTime() ?? null,
    completedAt: task.completedAt?.getTime() ?? null,
    workflowName: task.workflowName ?? null,
    workflowStage: task.workflowStage ?? null,
    workflowStatus: task.workflowStatus ?? null,
    workflowSkippedStages: JSON.stringify(task.workflowSkippedStages ?? []),
  });
}

export function updateTask(id: string, patch: Partial<Task>): void {
  const db = getDb();
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  const fieldMap: Record<keyof Partial<Task>, string> = {
    repoPath: 'repo_path',
    prompt: 'prompt',
    branchName: 'branch_name',
    baseBranch: 'base_branch',
    worktreePath: 'worktree_path',
    containerId: 'container_id',
    status: 'status',
    oversightMode: 'oversight_mode',
    taskType: 'task_type',
    devServerMode: 'dev_server_mode',
    devPort: 'dev_port',
    devServerUrl: 'dev_server_url',
    model: 'model',
    agentName: 'agent_name',
    skillNames: 'skill_names',
    planFirst: 'plan_first',
    maxRetries: 'max_retries',
    retryCount: 'retry_count',
    costUsd: 'cost_usd',
    inputTokens: 'input_tokens',
    outputTokens: 'output_tokens',
    contextTokensUsed: 'context_tokens_used',
    lastFileChanged: 'last_file_changed',
    rateLimitRetryAfter: 'rate_limit_retry_after',
    archiveState: 'archive_state',
    prTitle: 'pr_title',
    prBody: 'pr_body',
    failureReason: 'failure_reason',
    createdAt: 'created_at',
    startedAt: 'started_at',
    completedAt: 'completed_at',
    workflowName: 'workflow_name',
    workflowStage: 'workflow_stage',
    workflowStatus: 'workflow_status',
    workflowSkippedStages: 'workflow_skipped_stages',
    id: 'id',
  };

  for (const [key, col] of Object.entries(fieldMap) as [keyof Task, string][]) {
    if (key === 'id' || !(key in patch)) continue;
    const val = patch[key];
    sets.push(`${col} = @${key}`);

    if (key === 'skillNames' || key === 'workflowSkippedStages') {
      params[key] = JSON.stringify(val);
    } else if (key === 'planFirst') {
      params[key] = val ? 1 : 0;
    } else if (val instanceof Date) {
      params[key] = val.getTime();
    } else {
      params[key] = val as unknown;
    }
  }

  if (sets.length === 0) return;
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

export function getTask(id: string): Task | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToTask(row) : null;
}

export function listTasks(): Task[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return rows.map(rowToTask);
}

export function listTasksByRepo(repoPath: string): Task[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM tasks WHERE repo_path = ? ORDER BY created_at DESC').all(repoPath) as Record<string, unknown>[];
  return rows.map(rowToTask);
}

const TERMINAL_STATUSES: TaskStatus[] = ['DONE', 'FAILED', 'KILLED', 'DISCARDED'];

export function deleteFinishedTasks(): number {
  const db = getDb();
  const placeholders = TERMINAL_STATUSES.map(() => '?').join(', ');
  // Delete logs first (FK constraint), then tasks
  db.prepare(
    `DELETE FROM logs WHERE task_id IN (SELECT id FROM tasks WHERE status IN (${placeholders}))`
  ).run(...TERMINAL_STATUSES);
  const result = db.prepare(
    `DELETE FROM tasks WHERE status IN (${placeholders})`
  ).run(...TERMINAL_STATUSES);
  return result.changes;
}

export function listActiveNonTerminalTasks(): Task[] {
  const db = getDb();
  const placeholders = TERMINAL_STATUSES.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT * FROM tasks WHERE status NOT IN (${placeholders}) ORDER BY created_at DESC`
  ).all(...TERMINAL_STATUSES) as Record<string, unknown>[];
  return rows.map(rowToTask);
}
