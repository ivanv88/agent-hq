import type { FastifyInstance } from 'fastify';
import { insertMessage, listMessages, clearMessages } from '../db/meta.js';
import { getGlobalConfig } from '../config/global.js';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';

export function registerMetaRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { message: string } }>('/meta', async (req, reply) => {
    const { message } = req.body ?? {};
    if (!message) {
      reply.status(400).send({ error: 'message required' });
      return;
    }

    insertMessage('user', message);

    try {
      const response = await runMetaClaude(message);
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

async function runMetaClaude(message: string): Promise<string> {
  const config = getGlobalConfig();
  const claudeHome = path.join(os.homedir(), '.claude');

  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--model', config.metaModel,
      message,
    ];

    const child = spawn('claude', args, {
      cwd: claudeHome,
      env: {
        ...process.env,
        ...(config.anthropicApiKey ? { ANTHROPIC_API_KEY: config.anthropicApiKey } : {}),
      },
    });

    let stdout = '';
    let stderr = '';

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
