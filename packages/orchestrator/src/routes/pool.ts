import type { FastifyInstance } from 'fastify';
import { getPoolStatus } from '../db/pool.js';
import { getGlobalConfig } from '../config/global.js';
import { maintain } from '../containers/lifecycle.js';

export function registerPoolRoutes(fastify: FastifyInstance) {
  fastify.get('/pool', async () => {
    const config = getGlobalConfig();
    return getPoolStatus(config.poolSize);
  });

  fastify.post('/pool/refill', async () => {
    const config = getGlobalConfig();
    maintain(config.poolSize).catch(err => fastify.log.error(err));
    return { triggered: true };
  });
}
