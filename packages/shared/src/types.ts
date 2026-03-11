// Task lifecycle statuses
export type TaskStatus =
  | 'SPAWNING'
  | 'WORKING'
  | 'SPINNING'
  | 'RATE_LIMITED'
  | 'PAUSED'
  | 'READY'
  | 'DONE'
  | 'FAILED'
  | 'KILLED'
  | 'DISCARDED';

export type OversightMode = 'GATE_ON_COMPLETION' | 'GATE_ALWAYS' | 'NOTIFY_ONLY';
export type TaskType = 'feature' | 'fix' | 'refactor' | 'test' | 'chore' | 'docs';
export type DevServerMode = 'port' | 'proxy' | 'none';
export type PoolContainerStatus = 'WARMING' | 'READY' | 'CLAIMED';

export interface Task {
  id: string;
  repoPath: string;
  prompt: string;
  branchName: string;
  baseBranch: string;
  worktreePath: string | null;
  containerId?: string;
  status: TaskStatus;
  oversightMode: OversightMode;
  taskType: TaskType;
  devServerMode: DevServerMode;
  devPort: number | null;
  devServerUrl: string | null;
  model: string;
  agentName: string | null;
  skillNames: string[];
  planFirst: boolean;
  maxRetries: number;
  retryCount: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  contextTokensUsed: number | null;
  lastFileChanged: string | null;
  rateLimitRetryAfter: number | null;
  flaggedForDelete: boolean;
  flaggedForDeleteAt: Date | null;
  prTitle: string | null;
  prBody: string | null;
  failureReason: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface PoolContainer {
  id: string;
  containerId: string;
  status: PoolContainerStatus;
  imageTag: string;
  devPort: number | null;
  createdAt: Date;
}

export interface PoolStatus {
  ready: number;
  warming: number;
  claimed: number;
  target: number;
}

export interface Notification {
  message: string;
  taskId?: string;
  level: 'info' | 'warning' | 'error';
}

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface DiffResult {
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface DevcontainerConfig {
  image?: string;
  build?: {
    dockerfile?: string;
    context?: string;
    args?: Record<string, string>;
  };
  forwardPorts?: number[];
  postCreateCommand?: string | string[];
  remoteEnv?: Record<string, string>;
  mounts?: string[];
}

export interface MetaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

export interface PromptEntry {
  id: string;
  text: string;
  useCount: number;
  lastUsedAt: Date;
}

// WebSocket events
export type WsEvent =
  | { type: 'TASK_CREATED'; task: Task }
  | { type: 'TASK_UPDATED'; task: Task }
  | { type: 'TASKS_CLEARED' }
  | { type: 'COST_UPDATED'; taskId: string; costUsd: number; inputTokens: number; outputTokens: number; contextTokensUsed: number | null }
  | { type: 'POOL_UPDATED'; pool: PoolStatus }
  | { type: 'NOTIFICATION'; notification: Notification }
  | { type: 'PING' };

// Input types
export interface SpawnTaskInput {
  repoPath: string;
  prompt: string;
  taskType?: TaskType;
  oversightMode?: OversightMode;
  model?: string;
  agentName?: string;
  skillNames?: string[];
  planFirst?: boolean;
  maxRetries?: number;
  anthropicBaseUrl?: string;
  ticket?: string;
  branchName?: string;
}

export interface FeedbackInput {
  feedback: string;
}

export interface SaveMemoryInput {
  content: string;
  target: 'auto' | 'project';
}

export type DockerProvider = 'auto' | 'desktop' | 'colima';

export interface ConfigPatch {
  poolSize?: number;
  costAlertThreshold?: number;
  spinDetectionWindowMin?: number;
  worktreeAutoDeleteHours?: number;
  editorCommand?: string;
  defaultModel?: string;
  defaultOversightMode?: OversightMode;
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
  metaModel?: string;
  autoResumeRateLimited?: boolean;
  dockerProvider?: DockerProvider;
}
