import { beforeAll, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { initDb } from '../src/db/init.js';

// ── In-memory SQLite ──────────────────────────────────────────────────────────
let testDb: Database.Database;

beforeAll(() => {
  testDb = new Database(':memory:');
  initDb(testDb);
});

afterAll(() => {
  testDb.close();
});

// ── Global mocks — external boundaries only ───────────────────────────────────

vi.mock('../src/containers/lifecycle.js', () => ({
  claim: vi.fn().mockResolvedValue({
    containerId: 'test-container-id',
    id: 'test-pool-entry-id',
  }),
  configure: vi.fn().mockResolvedValue('test-container-id'),
  startClaude: vi.fn().mockResolvedValue({
    stream: createMockStream(),
    exec: createMockExec(),
  }),
  killContainer: vi.fn().mockResolvedValue(undefined),
  killImmediate: vi.fn().mockResolvedValue(undefined),
  killTaskContainerIfExists: vi.fn().mockResolvedValue(undefined),
  pauseContainer: vi.fn().mockResolvedValue(undefined),
  resumeContainer: vi.fn().mockResolvedValue(undefined),
  maintain: vi.fn().mockResolvedValue(undefined),
  resumeClaudeAfterRateLimit: vi.fn().mockResolvedValue({
    stream: createMockStream(),
    exec: createMockExec(),
  }),
  runPostCreate: vi.fn().mockResolvedValue(undefined),
  watchExecUntilDone: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/git/worktree.js', () => ({
  createWorktree: vi.fn().mockResolvedValue('/tmp/test-worktree'),
  getDiff: vi.fn().mockResolvedValue({
    files: [
      {
        path: 'src/auth.ts',
        additions: 10,
        deletions: 3,
        patch: '--- a/src/auth.ts\n+++ b/src/auth.ts',
      },
    ],
    totalAdditions: 10,
    totalDeletions: 3,
  }),
  cleanupWorktree: vi.fn().mockResolvedValue(undefined),
  generateBranchName: vi.fn().mockReturnValue('feat/test-branch-0319'),
  isGitRepo: vi.fn().mockResolvedValue(true),
}));

vi.mock('../src/config/global.js', () => ({
  getGlobalConfig: vi.fn().mockReturnValue({
    editorCommand: 'cursor',
    worktreePath: '/tmp/test-worktrees',
    poolSize: 2,
    defaultModel: 'claude-sonnet-4-6',
    defaultOversightMode: 'GATE_ON_COMPLETION',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
    costAlertThreshold: 5.00,
    spinDetectionWindowMin: 5,
    worktreeAutoDeleteHours: 24,
    branchTemplate: '{type}/{ticket}-{slug}-{date}',
    devPortRangeStart: 4000,
    anthropicApiKey: '',
    anthropicBaseUrl: '',
    metaModel: 'claude-haiku-4-5-20251001',
    repoPaths: [],
    autoResumeRateLimited: true,
    dockerProvider: 'auto',
    sessionTokenLimit: 100_000,
    weeklyTokenLimit: 1_000_000,
  }),
  saveGlobalConfig: vi.fn(),
}));

vi.mock('../src/containers/ports.js', () => ({
  assignPort: vi.fn().mockReturnValue(4001),
  releasePort: vi.fn(),
  reclaimPort: vi.fn().mockReturnValue(true),
}));

vi.mock('../src/workers/spin.js', () => ({
  startSpinDetector: vi.fn(),
  stopSpinDetector: vi.fn(),
}));

vi.mock('../src/streaming/ratelimit.js', () => ({
  startRateLimitWatcher: vi.fn(),
  stopRateLimitWatcher: vi.fn(),
}));

vi.mock('../src/streaming/completion.js', () => ({
  startCompletionDetector: vi.fn(),
}));

vi.mock('../src/streaming/devserver.js', () => ({
  startDevServerDetector: vi.fn(),
}));

vi.mock('../src/streaming/logs.js', () => ({
  startLogPipe: vi.fn(),
  preloadFromDb: vi.fn(),
  getRingBuffer: vi.fn().mockReturnValue([]),
  hasActiveStream: vi.fn().mockReturnValue(false),
  logEmitter: { on: vi.fn(), once: vi.fn(), off: vi.fn(), emit: vi.fn() },
  RING_SIZE: 500,
  initRingBuffer: vi.fn(),
  injectLogLine: vi.fn(),
}));

vi.mock('../src/streaming/cost.js', () => ({
  startCostParser: vi.fn(),
  stopCostParser: vi.fn(),
}));

vi.mock('../src/index.js', () => ({
  broadcastWsEvent: vi.fn(),
}));

vi.mock('../src/workflows/checkpoints.js', () => ({
  createCheckpoint: vi.fn().mockResolvedValue(undefined),
  restoreCheckpoint: vi.fn().mockResolvedValue(undefined),
  cleanupCheckpointRefs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/db/workflows.js', () => ({
  getWorkflow: vi.fn().mockReturnValue({
    name: 'test-workflow',
    version: 1,
    description: 'Test workflow',
    docsDir: 'ai-docs',
    stages: [
      { id: 'stage-1', name: 'Stage 1', step: { command: 'stage-1-step' }, gate: 'auto', optional: false, canLoop: false },
      { id: 'stage-2', name: 'Stage 2', step: { command: 'stage-2-step' }, gate: 'manual', optional: true, canLoop: false },
      { id: 'stage-3', name: 'Stage 3', step: { command: 'stage-3-step' }, gate: 'auto', optional: false, canLoop: false },
    ],
  }),
  getCommand: vi.fn().mockReturnValue({
    name: 'test-command',
    filename: 'test-command',
    description: 'Test command',
    reads: [],
    writes: [],
    promptUser: false,
    prompt: 'Test stage prompt for {{branch}}',
  }),
  listWorkflows: vi.fn().mockReturnValue([]),
  listCommands: vi.fn().mockReturnValue([]),
}));

// ── Mock helpers ──────────────────────────────────────────────────────────────

function createMockStream() {
  const stream = new EventEmitter();
  (stream as any).readable = true;
  return stream;
}

function createMockExec() {
  return { inspect: vi.fn().mockResolvedValue({ ExitCode: 0 }) };
}
