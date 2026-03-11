import { z } from 'zod';

export const SpawnTaskInputSchema = z.object({
  repoPath: z.string().min(1),
  prompt: z.string().min(1),
  taskType: z.enum(['feature', 'fix', 'refactor', 'test', 'chore', 'docs']).optional(),
  oversightMode: z.enum(['GATE_ON_COMPLETION', 'GATE_ALWAYS', 'NOTIFY_ONLY']).optional(),
  model: z.string().optional(),
  agentName: z.string().optional(),
  skillNames: z.array(z.string()).optional(),
  planFirst: z.boolean().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  anthropicBaseUrl: z.string().url().optional().or(z.literal('')),
  ticket: z.string().optional(),
  branchName: z.string().optional(),
});

export const FeedbackInputSchema = z.object({
  feedback: z.string().min(1),
});

export const SaveMemoryInputSchema = z.object({
  content: z.string().min(1),
  target: z.enum(['auto', 'project']),
});

export const ConfigPatchSchema = z.object({
  poolSize: z.number().int().min(0).max(20).optional(),
  costAlertThreshold: z.number().min(0).optional(),
  spinDetectionWindowMin: z.number().min(1).optional(),
  worktreeAutoDeleteHours: z.number().min(0).optional(),
  editorCommand: z.string().optional(),
  defaultModel: z.string().optional(),
  defaultOversightMode: z.enum(['GATE_ON_COMPLETION', 'GATE_ALWAYS', 'NOTIFY_ONLY']).optional(),
  anthropicApiKey: z.string().optional(),
  anthropicBaseUrl: z.string().url().optional().or(z.literal('')),
  metaModel: z.string().optional(),
  repoPaths: z.array(z.string()).optional(),
  autoResumeRateLimited: z.boolean().optional(),
});
