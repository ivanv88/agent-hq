import type { FastifyInstance } from 'fastify';
import { listSteps, getStep, saveStep, deleteStep, listWorkflows, getWorkflow, saveWorkflow, deleteWorkflow } from '../db/workflows.js';

export function registerWorkflowRoutes(fastify: FastifyInstance) {

  // ── Steps ────────────────────────────────────────────────────────────────

  fastify.get('/steps', async () => listSteps());

  fastify.get<{ Params: { name: string } }>('/steps/:name', async (req, reply) => {
    const step = getStep(req.params.name);
    if (!step) return reply.status(404).send({ error: 'Step not found' });
    return step;
  });

  fastify.post<{ Body: unknown }>('/steps', async (req, reply) => {
    const step = req.body as import('@lacc/shared').StepDefinition;
    if (!step?.filename) return reply.status(400).send({ error: 'filename required' });
    saveStep(step.filename, step);
    return { ok: true };
  });

  fastify.put<{ Params: { name: string }; Body: unknown }>('/steps/:name', async (req, reply) => {
    const step = req.body as import('@lacc/shared').StepDefinition;
    saveStep(req.params.name, step);
    return { ok: true };
  });

  fastify.delete<{ Params: { name: string } }>('/steps/:name', async (req, reply) => {
    const deleted = deleteStep(req.params.name);
    if (!deleted) return reply.status(404).send({ error: 'Step not found' });
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
