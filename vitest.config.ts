import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/orchestrator/vitest.config.ts',
      'packages/shared/vitest.config.ts',
    ],
  },
});
