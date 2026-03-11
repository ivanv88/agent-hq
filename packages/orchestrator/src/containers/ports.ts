import { getDb } from '../db/init.js';

const usedPorts = new Set<number>();
const PORT_RANGE_START = 38000;
const PORT_RANGE_END = 39999;

export function hydratePorts(): void {
  const db = getDb();

  // Collect ports from active tasks
  const taskPorts = db.prepare(
    "SELECT dev_port FROM tasks WHERE dev_port IS NOT NULL AND status NOT IN ('DONE', 'FAILED', 'KILLED')"
  ).all() as Array<{ dev_port: number }>;

  for (const { dev_port } of taskPorts) {
    usedPorts.add(dev_port);
  }

  // Collect ports from pool containers
  const poolPorts = db.prepare(
    'SELECT dev_port FROM pool_containers WHERE dev_port IS NOT NULL'
  ).all() as Array<{ dev_port: number }>;

  for (const { dev_port } of poolPorts) {
    usedPorts.add(dev_port);
  }
}

export function assignPort(): number {
  for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) {
    if (!usedPorts.has(p)) {
      usedPorts.add(p);
      return p;
    }
  }
  throw new Error('No available ports in range');
}

export function releasePort(port: number): void {
  usedPorts.delete(port);
}

// Re-claims a specific port number. Used when feedback/restart re-uses a port
// that was released at task completion but is still assigned in the DB.
// Returns false if the port was already taken by another task.
export function reclaimPort(port: number): boolean {
  if (usedPorts.has(port)) return false;
  usedPorts.add(port);
  return true;
}
