import { getDb } from './init.js';
import type { PoolContainer, PoolContainerStatus, PoolStatus } from '@lacc/shared';

function rowToPool(row: Record<string, unknown>): PoolContainer {
  return {
    id: row.id as string,
    containerId: row.container_id as string,
    status: row.status as PoolContainerStatus,
    imageTag: row.image_tag as string,
    devPort: row.dev_port as number | null,
    createdAt: new Date(row.created_at as number),
  };
}

export function insertPooled(entry: PoolContainer): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO pool_containers (id, container_id, status, image_tag, dev_port, created_at)
    VALUES (@id, @containerId, @status, @imageTag, @devPort, @createdAt)
  `).run({
    id: entry.id,
    containerId: entry.containerId,
    status: entry.status,
    imageTag: entry.imageTag,
    devPort: entry.devPort,
    createdAt: entry.createdAt.getTime(),
  });
}

export function updatePoolStatus(id: string, status: PoolContainerStatus): void {
  const db = getDb();
  db.prepare('UPDATE pool_containers SET status = ? WHERE id = ?').run(status, id);
}

export function claimOne(): PoolContainer | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM pool_containers WHERE status = 'READY' LIMIT 1"
  ).get() as Record<string, unknown> | undefined;

  if (!row) return null;

  db.prepare("UPDATE pool_containers SET status = 'CLAIMED' WHERE id = ?").run(row.id as string);
  return rowToPool({ ...row, status: 'CLAIMED' });
}

export function removePooled(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM pool_containers WHERE id = ?').run(id);
}

export function getPoolStatus(targetSize: number): PoolStatus {
  const db = getDb();
  const counts = db.prepare(
    "SELECT status, COUNT(*) as count FROM pool_containers GROUP BY status"
  ).all() as Array<{ status: string; count: number }>;

  const byStatus: Record<string, number> = {};
  for (const { status, count } of counts) {
    byStatus[status] = count;
  }

  return {
    ready: byStatus['READY'] ?? 0,
    warming: byStatus['WARMING'] ?? 0,
    claimed: byStatus['CLAIMED'] ?? 0,
    target: targetSize,
  };
}

export function listAllPooled(): PoolContainer[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM pool_containers').all() as Record<string, unknown>[];
  return rows.map(rowToPool);
}

export function getPooledByContainerId(containerId: string): PoolContainer | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM pool_containers WHERE container_id = ?').get(containerId) as Record<string, unknown> | undefined;
  return row ? rowToPool(row) : null;
}
