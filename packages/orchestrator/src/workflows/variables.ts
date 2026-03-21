import type { Task } from '@lacc/shared';

export function resolvePrompt(
  prompt: string,
  task: Task,
  workflow: { docsDir?: string },
): string {
  const containerWorkspace = '/workspace';
  const containerDocsDir = `${containerWorkspace}/${workflow.docsDir ?? 'ai-docs'}`;
  const vars: Record<string, string> = {
    '{{docs_dir}}':  containerDocsDir,
    '{{workspace}}': containerWorkspace,
    '{{spec}}':      `${containerDocsDir}/.spec.md`,
    '{{plan}}':      `${containerDocsDir}/.plan.md`,
    '{{review}}':    `${containerDocsDir}/.review.md`,
    '{{jira}}':      `${containerDocsDir}/.jira.md`,
    '{{branch}}':    task.branchName,
    '{{repo}}':      '/original-repo',
  };
  let result = prompt;
  for (const [token, value] of Object.entries(vars)) {
    result = result.replaceAll(token, value);
  }
  return result;
}
