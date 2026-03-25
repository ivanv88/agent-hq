import type { FastifyInstance } from 'fastify';
import { listCommands, getCommand, saveCommand, deleteCommand, listWorkflows, getWorkflow, saveWorkflow, deleteWorkflow } from '../db/workflows.js';

export function registerWorkflowRoutes(fastify: FastifyInstance) {

  // ── Commands ──────────────────────────────────────────────────────────────

  fastify.get('/commands', async () => listCommands());

  fastify.get<{ Params: { name: string } }>('/commands/:name', async (req, reply) => {
    const cmd = getCommand(req.params.name);
    if (!cmd) return reply.status(404).send({ error: 'Command not found' });
    return cmd;
  });

  fastify.post<{ Body: unknown }>('/commands', async (req, reply) => {
    const cmd = req.body as import('@lacc/shared').CommandDefinition;
    if (!cmd?.filename) return reply.status(400).send({ error: 'filename required' });
    saveCommand(cmd.filename, cmd);
    return { ok: true };
  });

  fastify.put<{ Params: { name: string }; Body: unknown }>('/commands/:name', async (req, reply) => {
    const cmd = req.body as import('@lacc/shared').CommandDefinition;
    saveCommand(req.params.name, cmd);
    return { ok: true };
  });

  fastify.delete<{ Params: { name: string } }>('/commands/:name', async (req, reply) => {
    const deleted = deleteCommand(req.params.name);
    if (!deleted) return reply.status(404).send({ error: 'Command not found' });
    return { ok: true };
  });

  // ── Workflows ────────────────────────────────────────────────────────────

  fastify.get('/workflows', async () => listWorkflows());

  fastify.get<{ Params: { name: string } }>('/workflows/:name', async (req, reply) => {
    const workflow = getWorkflow(req.params.name);
    if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });
    return workflow;
  });

  fastify.post<{ Body: unknown }>('/workflows', async (req, reply) => {
    const wf = req.body as import('@lacc/shared').WorkflowDefinition;
    if (!wf?.name) return reply.status(400).send({ error: 'name required' });
    saveWorkflow(wf.name, wf);
    return { ok: true };
  });

  fastify.put<{ Params: { name: string }; Body: unknown }>('/workflows/:name', async (req, reply) => {
    const wf = req.body as import('@lacc/shared').WorkflowDefinition;
    saveWorkflow(req.params.name, wf);
    return { ok: true };
  });

  fastify.delete<{ Params: { name: string } }>('/workflows/:name', async (req, reply) => {
    const deleted = deleteWorkflow(req.params.name);
    if (!deleted) return reply.status(404).send({ error: 'Workflow not found' });
    return { ok: true };
  });
}
