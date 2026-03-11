import { getDb } from './init.js';
import type { PromptEntry } from '@lacc/shared';
import { randomUUID } from 'crypto';

function rowToPrompt(row: Record<string, unknown>): PromptEntry {
  return {
    id: row.id as string,
    text: row.text as string,
    useCount: row.use_count as number,
    lastUsedAt: new Date(row.last_used_at as number),
  };
}

export function upsertPrompt(text: string): void {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO prompts (id, text, use_count, last_used_at) VALUES (?, ?, 1, ?)
    ON CONFLICT(text) DO UPDATE SET
      use_count = use_count + 1,
      last_used_at = excluded.last_used_at
  `).run(randomUUID(), text, now);
}

export function listPrompts(limit?: number, offset?: number): PromptEntry[] {
  const db = getDb();
  const lim = limit ?? 50;
  const off = offset ?? 0;
  const rows = db.prepare(
    'SELECT * FROM prompts ORDER BY last_used_at DESC LIMIT ? OFFSET ?'
  ).all(lim, off) as Record<string, unknown>[];
  return rows.map(rowToPrompt);
}
