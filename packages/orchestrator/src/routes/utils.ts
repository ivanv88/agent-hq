/** Standard `{ ok: true }` response used across route handlers. */
export const OK = Object.freeze({ ok: true });

/** Zero-valued cost/token fields for task creation and retry resets. */
export const zeroCost = Object.freeze({ costUsd: 0, inputTokens: 0, outputTokens: 0 });

/** Returns the first line of a prompt, truncated to 72 characters. */
export function promptFirstLine(prompt: string): string {
  return prompt.split('\n')[0].slice(0, 72);
}
