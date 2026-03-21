import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'orchestrator',
    root: __dirname,
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts',
        'src/containers/**',
        'src/devserver/**',
        'src/workers/cleanup.ts',
      ],
      thresholds: {
        'src/workflows/**': { lines: 90, functions: 90 },
        'src/git/branch.ts': { lines: 90, functions: 90 },
        'src/streaming/cost.ts': { lines: 80, functions: 80 },
        'src/routes/**': { lines: 70, functions: 70 },
        'src/db/**': { lines: 60, functions: 60 },
      },
    },
  },
});
