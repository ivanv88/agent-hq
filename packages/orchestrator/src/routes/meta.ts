import type { FastifyInstance } from 'fastify';
import { insertMessage, listMessages, clearMessages } from '../db/meta.js';
import { getGlobalConfig } from '../config/global.js';
import { loadSystemPrompt } from '../meta/systemPrompts.js';
import { subprocess } from '../meta/subprocess.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

interface MetaBody {
  message: string;
  repoPath?: string;
  context?: string;
}

export function registerMetaRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: MetaBody }>('/meta', async (req, reply) => {
    const { message, repoPath, context } = req.body ?? {};
    if (!message) {
      reply.status(400).send({ error: 'message required' });
      return;
    }

    insertMessage('user', message);

    try {
      const response = await runMetaClaude(message, repoPath, context);
      insertMessage('assistant', response);
      return { response };
    } catch (err) {
      fastify.log.error(err, 'Meta-Claude error');
      reply.status(500).send({ error: 'Meta-Claude failed' });
    }
  });

  fastify.get('/meta/history', async () => {
    return listMessages();
  });

  fastify.delete('/meta/history', async (_, reply) => {
    clearMessages();
    reply.status(204).send();
  });
}

async function runMetaClaude(
  message: string,
  repoPath?: string,
  context?: string,
): Promise<string> {
  const config = getGlobalConfig();
  const laccDataDir = path.join(os.homedir(), '.lacc-data');

  const args = [
    '-p',
    '--output-format', 'text',
    '--model', config.metaModel,
    '--dangerously-skip-permissions',
    '--add-dir', laccDataDir,
  ];

  // Add repo context when a repo is active
  if (repoPath) {
    args.push('--add-dir', repoPath);

    const repoLaccDir = path.join(repoPath, '.lacc');
    if (fs.existsSync(repoLaccDir)) {
      args.push('--add-dir', repoLaccDir);
    }

    const repoClaudeDir = path.join(repoPath, '.claude');
    if (fs.existsSync(repoClaudeDir)) {
      args.push('--add-dir', repoClaudeDir);
    }
  }

  // Load and prepend system prompt
  const systemPrompt = loadSystemPrompt(
    context ?? 'library-workbench',
    {
      lacc_data_dir: laccDataDir,
      repo_path: repoPath ?? 'none',
      has_repo: repoPath ? 'true' : 'false',
    },
  );

  const fullMessage = systemPrompt ? `${systemPrompt}\n\n---\n\n${message}` : message;

  return new Promise((resolve, reject) => {
    const child = subprocess.spawn('claude', args, {
      cwd: laccDataDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(config.anthropicApiKey ? { ANTHROPIC_API_KEY: config.anthropicApiKey } : {}),
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdin.write(fullMessage);
    child.stdin.end();

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Meta-Claude exited ${code}: ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}
