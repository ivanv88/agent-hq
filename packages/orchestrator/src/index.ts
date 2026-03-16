import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import type { WebSocket } from 'ws';
import type { WsEvent } from '@lacc/shared';
import { initDb } from './db/init.js';
import { loadGlobalConfig } from './config/global.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const emitter = new EventEmitter();
emitter.setMaxListeners(200);

const wsClients = new Set<WebSocket>();

export function broadcastWsEvent(event: WsEvent): void {
  const payload = JSON.stringify(event);
  for (const ws of wsClients) {
    if (ws.readyState === 1) { // OPEN
      ws.send(payload);
    }
  }
}

async function start() {
  // Initialize DB and config first
  initDb();
  loadGlobalConfig();

  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  await fastify.register(fastifyWebsocket);

  // Serve UI build
  const publicDir = path.join(__dirname, '..', 'public');
  await fastify.register(fastifyStatic, {
    root: publicDir,
    wildcard: false,
  });

  // Health endpoint
  fastify.get('/health', async () => {
    const { getPoolStatus } = await import('./db/pool.js');
    const { getGlobalConfig } = await import('./config/global.js');
    const config = getGlobalConfig();
    const pool = getPoolStatus(config.poolSize);
    return { status: 'ok', pool, version: '1.0.0' };
  });

  // WebSocket events endpoint
  fastify.register(async (instance) => {
    instance.get('/events', { websocket: true }, (socket) => {
      wsClients.add(socket);

      // Send initial ping
      socket.send(JSON.stringify({ type: 'PING' } satisfies WsEvent));

      // 30s heartbeat
      const pingInterval = setInterval(() => {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'PING' } satisfies WsEvent));
        }
      }, 30_000);

      socket.on('close', () => {
        wsClients.delete(socket);
        clearInterval(pingInterval);
      });

      socket.on('error', () => {
        wsClients.delete(socket);
        clearInterval(pingInterval);
      });
    });
  });

  // Register routes (imported dynamically to avoid circular deps)
  const { registerTaskRoutes } = await import('./routes/tasks.js');
  const { registerReviewRoutes } = await import('./routes/review.js');
  const { registerConfigRoutes } = await import('./routes/config.js');
  const { registerMetaRoutes } = await import('./routes/meta.js');
  const { registerPoolRoutes } = await import('./routes/pool.js');

  registerTaskRoutes(fastify);
  registerReviewRoutes(fastify);
  registerConfigRoutes(fastify);
  registerMetaRoutes(fastify);
  registerPoolRoutes(fastify);
  const { registerWorkflowRoutes } = await import('./routes/workflows.js');
  registerWorkflowRoutes(fastify);

  // SPA fallback for non-API routes
  fastify.setNotFoundHandler(async (req, reply) => {
    if (!req.url.startsWith('/api') && !req.url.startsWith('/events') && !req.url.startsWith('/health')) {
      try {
        return reply.sendFile('index.html');
      } catch {
        // public dir might not exist in dev mode
      }
    }
    reply.status(404).send({ error: 'Not found' });
  });

  // Restart recovery
  const { adoptExisting } = await import('./containers/lifecycle.js');
  const { listActiveNonTerminalTasks } = await import('./db/tasks.js');
  const { updateTask } = await import('./db/tasks.js');
  const { getGlobalConfig } = await import('./config/global.js');
  const { maintain } = await import('./containers/lifecycle.js');

  await adoptExisting();

  const { preloadFromDb } = await import('./streaming/logs.js');
  const { appendChunk } = await import('./db/logs.js');
  const allActiveTasks = listActiveNonTerminalTasks();

  // Pre-populate ring buffers for all non-terminal tasks so SSE works on reconnect
  for (const task of allActiveTasks) {
    preloadFromDb(task.id);
  }

  // Only recover tasks that were genuinely mid-flight.
  // READY/PAUSED are stable waiting states that survive a restart without intervention.
  // RATE_LIMITED containers that are still paused are preserved — the auto-resume worker
  // will reconnect via claude --continue when the rate limit window expires.
  const { getLastNChunks } = await import('./db/logs.js');
  const { killImmediate, isContainerPaused } = await import('./containers/lifecycle.js');

  const activeTasks = allActiveTasks.filter(t =>
    ['SPAWNING', 'WORKING', 'SPINNING', 'RATE_LIMITED'].includes(t.status)
  );

  for (const task of activeTasks) {

    // RATE_LIMITED: if the container is still paused, leave it for the auto-resume worker.
    // It will use claude --continue to reconnect when the window expires.
    if (task.status === 'RATE_LIMITED' && task.containerId) {
      if (await isContainerPaused(task.containerId)) {
        fastify.log.info(`Recovery: RATE_LIMITED task ${task.id} container is paused — preserving for auto-resume`);
        continue;
      }
      // Container is running or gone — fall through to normal handling
    }

    // Check if the task already completed (result event in logs) before marking FAILED.
    // Use a large window so the result event isn't missed in verbose logs.
    const recentChunks = getLastNChunks(task.id, 500);
    const alreadyDone = recentChunks.some(chunk => {
      try { return (JSON.parse(chunk) as { type: string }).type === 'result'; } catch { return false; }
    });

    if (alreadyDone) {
      // Task completed before the restart — honour its oversightMode
      const { loadRepoConfig, mergeConfigs } = await import('./config/repo.js');
      const { getGlobalConfig: getGC } = await import('./config/global.js');
      const merged = mergeConfigs(getGC(), loadRepoConfig(task.repoPath));
      const finalStatus = (merged.oversightMode === 'GATE_ON_COMPLETION' || merged.oversightMode === 'GATE_ALWAYS')
        ? 'READY' : 'DONE';
      fastify.log.info(`Recovery: task ${task.id} already completed — marking ${finalStatus}`);
      updateTask(task.id, { status: finalStatus, completedAt: new Date() });
    } else if (task.containerId) {
      // Container exists — kill it immediately so it doesn't keep running orphaned,
      // then mark FAILED so the user can restart cleanly.
      fastify.log.info(`Recovery: killing orphaned container for task ${task.id} (status was ${task.status})`);
      await killImmediate(task.containerId).catch(() => {});
      appendChunk(task.id, JSON.stringify({ type: 'error', message: 'Orchestrator restarted while task was running. Please restart the task.' }));
      updateTask(task.id, { status: 'FAILED', completedAt: new Date(), containerId: undefined });
    } else {
      updateTask(task.id, { status: 'FAILED', completedAt: new Date() });
    }
  }

  const config = getGlobalConfig();
  maintain(config.poolSize).catch(err => fastify.log.error(err, 'Pool maintain error'));

  // Start cleanup worker
  const { startCleanupWorker } = await import('./workers/cleanup.js');
  startCleanupWorker();

  // Graceful shutdown
  const shutdown = async () => {
    fastify.log.info('Shutting down...');
    for (const ws of wsClients) {
      ws.close();
    }
    // Force exit after 1s — SSE streams / open handles can keep fastify.close() hanging
    setTimeout(() => process.exit(0), 1000);
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  const PORT = 7842;
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      fastify.log.warn(`Port ${PORT} in use — killing existing process and retrying...`);
      const { execSync } = await import('child_process');
      try { execSync(`lsof -ti tcp:${PORT} | xargs kill -9`, { stdio: 'pipe' }); } catch { /* nothing listening */ }
      await new Promise(r => setTimeout(r, 500));
      await fastify.listen({ port: PORT, host: '0.0.0.0' });
    } else {
      throw err;
    }
  }
  fastify.log.info('LACC orchestrator listening on http://localhost:7842');
}

start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
