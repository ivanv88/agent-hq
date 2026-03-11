import { getDb } from './init.js';

// Write queue: accumulate rows and flush in a single transaction every 150 ms.
// This turns N synchronous better-sqlite3 writes per second into one batched
// transaction, keeping the event loop free during high-frequency log output.
interface QueuedRow { taskId: string; chunk: string; createdAt: number }
let writeQueue: QueuedRow[] = [];
let drainTimer: ReturnType<typeof setInterval> | null = null;

function ensureDrainTimer(): void {
  if (drainTimer !== null) return;
  drainTimer = setInterval(drainQueue, 150);
  // Don't keep the process alive just for the drain timer
  drainTimer.unref?.();
}

function drainQueue(): void {
  if (writeQueue.length === 0) return;
  const rows = writeQueue;
  writeQueue = [];
  const db = getDb();
  const insert = db.prepare('INSERT INTO logs (task_id, chunk, created_at) VALUES (?, ?, ?)');
  const insertMany = db.transaction((items: QueuedRow[]) => {
    for (const r of items) insert.run(r.taskId, r.chunk, r.createdAt);
  });
  insertMany(rows);
}

/** Enqueue a log chunk for batched write. */
export function appendChunk(taskId: string, chunk: string): void {
  writeQueue.push({ taskId, chunk, createdAt: Date.now() });
  ensureDrainTimer();
}

/** Flush any pending writes for a task immediately (call on stream end). */
export function flushLogs(): void {
  drainQueue();
}

export function getLastNChunks(taskId: string, n: number): string[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT chunk FROM (SELECT chunk, id FROM logs WHERE task_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id ASC'
  ).all(taskId, n) as Array<{ chunk: string }>;
  return rows.map(r => r.chunk);
}
