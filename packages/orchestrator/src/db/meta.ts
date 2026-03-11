import { getDb } from './init.js';
import type { MetaMessage } from '@lacc/shared';
import { randomUUID } from 'crypto';

function rowToMessage(row: Record<string, unknown>): MetaMessage {
  return {
    id: row.id as string,
    role: row.role as 'user' | 'assistant',
    content: row.content as string,
    createdAt: new Date(row.created_at as number),
  };
}

export function insertMessage(role: 'user' | 'assistant', content: string): MetaMessage {
  const db = getDb();
  const msg: MetaMessage = {
    id: randomUUID(),
    role,
    content,
    createdAt: new Date(),
  };
  db.prepare(
    'INSERT INTO meta_messages (id, role, content, created_at) VALUES (?, ?, ?, ?)'
  ).run(msg.id, msg.role, msg.content, msg.createdAt.getTime());
  return msg;
}

export function listMessages(): MetaMessage[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM meta_messages ORDER BY created_at ASC').all() as Record<string, unknown>[];
  return rows.map(rowToMessage);
}

export function clearMessages(): void {
  const db = getDb();
  db.prepare('DELETE FROM meta_messages').run();
}
