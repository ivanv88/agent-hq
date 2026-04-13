import type { FastifyInstance } from 'fastify';
import { getGlobalConfig, saveGlobalConfig } from '../config/global.js';
import { loadRepoConfig, mergeConfigs } from '../config/repo.js';
import { ConfigPatchSchema } from '@lacc/shared';
import { OK } from './utils.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const CLAUDE_DIR = path.join(os.homedir(), '.lacc-data', '.claude');
const isMarkdownOrText = (f: string) => f.endsWith('.md') || f.endsWith('.txt');

export function registerConfigRoutes(fastify: FastifyInstance) {
  fastify.get('/config', async () => {
    const cfg = getGlobalConfig();
    return { ...cfg, hasApiKey: cfg.anthropicApiKey.length > 0 };
  });

  fastify.patch('/config', async (req, reply) => {
    const result = ConfigPatchSchema.safeParse(req.body);
    if (!result.success) {
      reply.status(400).send({ error: 'Invalid config', details: result.error.flatten() });
      return;
    }
    return saveGlobalConfig(result.data);
  });

  fastify.get<{ Querystring: { path?: string } }>('/config/repo', async (req, reply) => {
    const repoPath = req.query.path;
    if (!repoPath) {
      reply.status(400).send({ error: 'path query param required' });
      return;
    }
    const global = getGlobalConfig();
    const repo = loadRepoConfig(repoPath);
    return mergeConfigs(global, repo);
  });

  fastify.get('/config/skills', async () => {
    const skillsDir = path.join(CLAUDE_DIR, 'skills');
    if (!fs.existsSync(skillsDir)) return [];
    return fs.readdirSync(skillsDir)
      .filter(isMarkdownOrText)
      .map(f => ({
        name: path.basename(f, path.extname(f)),
        filename: f,
        content: fs.readFileSync(path.join(skillsDir, f), 'utf-8'),
      }));
  });

  fastify.get('/config/agents', async () => {
    const agentsDir = path.join(CLAUDE_DIR, 'agents');
    if (!fs.existsSync(agentsDir)) return [];
    return fs.readdirSync(agentsDir)
      .filter(isMarkdownOrText)
      .map(f => ({
        name: path.basename(f, path.extname(f)),
        filename: f,
        content: fs.readFileSync(path.join(agentsDir, f), 'utf-8'),
      }));
  });

  fastify.post<{ Body: { path: string } }>('/fs/git-init', async (req, reply) => {
    const dirPath = req.body?.path;
    if (!dirPath) return reply.status(400).send({ error: 'path required' });
    try {
      await execFileAsync('git', ['init'], { cwd: dirPath });
      await execFileAsync('git', ['add', '-A'], { cwd: dirPath });
      await execFileAsync('git', ['commit', '--allow-empty', '-m', 'chore: init repository'], { cwd: dirPath });
      return OK;
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.get<{ Querystring: { path?: string } }>('/fs/browse', async (req, reply) => {
    const dirPath = req.query.path ?? os.homedir();
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const dirs = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => ({
          name: e.name,
          path: path.join(dirPath, e.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const parent = path.dirname(dirPath);
      return {
        current: dirPath,
        parent: parent !== dirPath ? parent : null,
        dirs,
      };
    } catch {
      return reply.status(400).send({ error: 'Cannot read directory' });
    }
  });

  // Session cost aggregate
  fastify.get('/session/cost', async () => {
    const { getDb } = await import('../db/init.js');
    const db = getDb();
    const now = Date.now();

    const sessionRow = db.prepare(
      'SELECT SUM(cost_usd) as total, SUM(input_tokens) as inputTokens, SUM(output_tokens) as outputTokens FROM tasks WHERE created_at > ?'
    ).get(now - 24 * 60 * 60 * 1000) as { total: number | null; inputTokens: number | null; outputTokens: number | null };

    const weekRow = db.prepare(
      'SELECT SUM(input_tokens) as inputTokens, SUM(output_tokens) as outputTokens FROM tasks WHERE created_at > ?'
    ).get(now - 7 * 24 * 60 * 60 * 1000) as { inputTokens: number | null; outputTokens: number | null };

    const cfg = getGlobalConfig();
    return {
      totalCostUsd: sessionRow.total ?? 0,
      sessionTokens: (sessionRow.inputTokens ?? 0) + (sessionRow.outputTokens ?? 0),
      weeklyTokens: (weekRow.inputTokens ?? 0) + (weekRow.outputTokens ?? 0),
      sessionTokenLimit: cfg.sessionTokenLimit,
      weeklyTokenLimit: cfg.weeklyTokenLimit,
    };
  });
}
