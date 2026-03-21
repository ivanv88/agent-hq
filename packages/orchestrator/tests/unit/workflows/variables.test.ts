import { describe, it, expect } from 'vitest';
import { resolvePrompt } from '../../../src/workflows/variables.js';
import type { Task } from '@lacc/shared';

const baseTask = {
  branchName: 'feat/auth-jwt',
  worktreePath: '/tmp/test-worktree',
} as Task;

const baseWorkflow = { docsDir: 'ai-docs' };

describe('resolvePrompt', () => {
  it('resolves {{docs_dir}}', () => {
    const result = resolvePrompt('Read {{docs_dir}}/spec.md', baseTask, baseWorkflow);
    expect(result).toBe('Read /workspace/ai-docs/spec.md');
  });

  it('resolves {{workspace}}', () => {
    const result = resolvePrompt('cd {{workspace}}', baseTask, baseWorkflow);
    expect(result).toBe('cd /workspace');
  });

  it('resolves {{branch}}', () => {
    const result = resolvePrompt('Branch: {{branch}}', baseTask, baseWorkflow);
    expect(result).toBe('Branch: feat/auth-jwt');
  });

  it('resolves shorthand variables', () => {
    const result = resolvePrompt('Read {{spec}} and {{jira}}', baseTask, baseWorkflow);
    expect(result).toBe('Read /workspace/ai-docs/.spec.md and /workspace/ai-docs/.jira.md');
  });

  it('uses default ai-docs when docsDir not set', () => {
    const result = resolvePrompt('{{docs_dir}}', baseTask, {});
    expect(result).toBe('/workspace/ai-docs');
  });

  it('uses custom docsDir', () => {
    const result = resolvePrompt('{{docs_dir}}', baseTask, { docsDir: 'custom-docs' });
    expect(result).toBe('/workspace/custom-docs');
  });

  it('leaves unknown variables as-is', () => {
    const result = resolvePrompt('Hello {{unknown}}', baseTask, baseWorkflow);
    expect(result).toBe('Hello {{unknown}}');
  });

  it('resolves multiple variables in one prompt', () => {
    const result = resolvePrompt(
      'Read {{jira}} and write to {{spec}} in {{workspace}}',
      baseTask,
      baseWorkflow,
    );
    expect(result).toBe(
      'Read /workspace/ai-docs/.jira.md and write to /workspace/ai-docs/.spec.md in /workspace',
    );
  });
});
