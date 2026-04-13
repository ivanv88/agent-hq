import type { FastifyInstance } from 'fastify';
import type { CommandDefinition, WorkflowDefinition } from '@lacc/shared';
import { listCommands, getCommand, saveCommand, deleteCommand, listWorkflows, getWorkflow, saveWorkflow, deleteWorkflow } from '../db/workflows.js';
import { OK } from './utils.js';

export function registerWorkflowRoutes(fastify: FastifyInstance) {

  // ── Commands ──────────────────────────────────────────────────────────────

  fastify.get('/commands', async () => listCommands());

  fastify.get<{ Params: { name: string } }>('/commands/:name', async (req, reply) => {
    const cmd = getCommand(req.params.name);
    if (!cmd) return reply.status(404).send({ error: 'Command not found' });
    return cmd;
  });

  fastify.post<{ Body: CommandDefinition }>('/commands', async (req, reply) => {
    const cmd = req.body;
    if (!cmd?.filename) return reply.status(400).send({ error: 'filename required' });
    saveCommand(cmd.filename, cmd);
    return OK;
  });

  fastify.put<{ Params: { name: string }; Body: CommandDefinition }>('/commands/:name', async (req) => {
    saveCommand(req.params.name, req.body);
    return OK;
  });

  fastify.delete<{ Params: { name: string } }>('/commands/:name', async (req, reply) => {
    const deleted = deleteCommand(req.params.name);
    if (!deleted) return reply.status(404).send({ error: 'Command not found' });
    return OK;
  });

  // ── Workflows ────────────────────────────────────────────────────────────

  fastify.get('/workflows', async () => listWorkflows());

  fastify.get<{ Params: { name: string } }>('/workflows/:name', async (req, reply) => {
    const workflow = getWorkflow(req.params.name);
    if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });
    return workflow;
  });

  fastify.post<{ Body: WorkflowDefinition }>('/workflows', async (req, reply) => {
    const wf = req.body;
    if (!wf?.name) return reply.status(400).send({ error: 'name required' });
    saveWorkflow(wf.name, wf);
    return OK;
  });

  fastify.put<{ Params: { name: string }; Body: WorkflowDefinition }>('/workflows/:name', async (req) => {
    saveWorkflow(req.params.name, req.body);
    return OK;
  });

  fastify.delete<{ Params: { name: string } }>('/workflows/:name', async (req, reply) => {
    const deleted = deleteWorkflow(req.params.name);
    if (!deleted) return reply.status(404).send({ error: 'Workflow not found' });
    return OK;
  });
}
