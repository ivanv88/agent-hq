import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const DATA_DIR = path.join(os.homedir(), '.lacc-data');
const DB_PATH = path.join(DATA_DIR, 'lacc.db');

let db: Database.Database;

export function getDb(): Database.Database {
  return db;
}

export function initDb(instance?: Database.Database): Database.Database {
  if (instance) {
    db = instance;
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(path.join(DATA_DIR, 'worktrees'), { recursive: true });
    fs.mkdirSync(path.join(DATA_DIR, 'certs'), { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }

  createTables();
  runMigrations();

  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      repo_path TEXT NOT NULL,
      prompt TEXT NOT NULL,
      branch_name TEXT NOT NULL,
      base_branch TEXT NOT NULL DEFAULT 'main',
      worktree_path TEXT,
      container_id TEXT,
      status TEXT NOT NULL DEFAULT 'SPAWNING',
      oversight_mode TEXT NOT NULL DEFAULT 'GATE_ON_COMPLETION',
      task_type TEXT NOT NULL DEFAULT 'feature',
      dev_server_mode TEXT NOT NULL DEFAULT 'port',
      dev_port INTEGER,
      dev_server_url TEXT,
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      agent_name TEXT,
      skill_names TEXT NOT NULL DEFAULT '[]',
      plan_first INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      retry_count INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      context_tokens_used INTEGER,
      last_file_changed TEXT,
      rate_limit_retry_after INTEGER,
      flagged_for_delete INTEGER NOT NULL DEFAULT 0,
      flagged_for_delete_at INTEGER,
      pr_title TEXT,
      pr_body TEXT,
      failure_reason TEXT,
      anthropic_base_url TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_repo_path ON tasks(repo_path);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

    CREATE TABLE IF NOT EXISTS pool_containers (
      id TEXT PRIMARY KEY,
      container_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'WARMING',
      image_tag TEXT NOT NULL,
      dev_port INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      chunk TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_logs_task_id ON logs(task_id);

    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL UNIQUE,
      use_count INTEGER NOT NULL DEFAULT 1,
      last_used_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta_messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    PRAGMA user_version = 1;
  `);
}

function runMigrations() {
  const version = (db.pragma('user_version', { simple: true }) as number) || 0;

  if (version < 1) {
    // Already handled in createTables for fresh installs
    // For existing DBs, add missing columns
    const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
    const colNames = taskColumns.map(c => c.name);

    const migrations: [string, string][] = [
      ['pr_title', 'ALTER TABLE tasks ADD COLUMN pr_title TEXT'],
      ['pr_body', 'ALTER TABLE tasks ADD COLUMN pr_body TEXT'],
      ['base_branch', "ALTER TABLE tasks ADD COLUMN base_branch TEXT NOT NULL DEFAULT 'main'"],
      ['flagged_for_delete_at', 'ALTER TABLE tasks ADD COLUMN flagged_for_delete_at INTEGER'],
      ['context_tokens_used', 'ALTER TABLE tasks ADD COLUMN context_tokens_used INTEGER'],
      ['failure_reason', 'ALTER TABLE tasks ADD COLUMN failure_reason TEXT'],
    ];

    for (const [col, sql] of migrations) {
      if (!colNames.includes(col)) {
        db.exec(sql);
      }
    }

    db.pragma('user_version = 1');
  }

  if (version < 2) {
    // Rename AWAITING_REVIEW status to READY for existing rows
    db.exec("UPDATE tasks SET status = 'READY' WHERE status = 'AWAITING_REVIEW'");
    db.pragma('user_version = 2');
  }

  if (version < 3) {
    const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
    const colNames = taskColumns.map(c => c.name);

    const migrations: [string, string][] = [
      ['workflow_name',            'ALTER TABLE tasks ADD COLUMN workflow_name TEXT'],
      ['workflow_stage',           'ALTER TABLE tasks ADD COLUMN workflow_stage TEXT'],
      ['workflow_status',          'ALTER TABLE tasks ADD COLUMN workflow_status TEXT'],
      ['workflow_skipped_stages',  "ALTER TABLE tasks ADD COLUMN workflow_skipped_stages TEXT NOT NULL DEFAULT '[]'"],
    ];

    for (const [col, sql] of migrations) {
      if (!colNames.includes(col)) {
        db.exec(sql);
      }
    }

    db.pragma('user_version = 3');
  }

  if (version < 4) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_checkpoints (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        stage_id TEXT NOT NULL,
        git_ref TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON workflow_checkpoints(task_id);
    `);
    db.pragma('user_version = 4');
  }
}

export { DATA_DIR, DB_PATH };
