import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { initDb } from '../../../src/db/init.js';

describe('DB migration v5 — archive_state', () => {
  it('adds archive_state column with default alive', () => {
    const db = new Database(':memory:');
    initDb(db);
    const cols = (db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string; dflt_value: string | null }>);
    const col = cols.find(c => c.name === 'archive_state');
    expect(col).toBeDefined();
    expect(col!.dflt_value).toBe("'alive'");
  });

  it('new schemas do not have flagged_for_delete columns', () => {
    const db = new Database(':memory:');
    initDb(db);
    const cols = (db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>);
    expect(cols.find(c => c.name === 'flagged_for_delete')).toBeUndefined();
    expect(cols.find(c => c.name === 'flagged_for_delete_at')).toBeUndefined();
  });
});
