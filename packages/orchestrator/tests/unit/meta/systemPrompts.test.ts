import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadSystemPrompt } from '../../../src/meta/systemPrompts.js';

describe('loadSystemPrompt', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-sp-'));
    fs.mkdirSync(path.join(tmpDir, 'system-prompts'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('substitutes {{var}} in template from user dir', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'system-prompts', 'test.md'),
      'Data: {{lacc_data_dir}}, Repo: {{repo_path}}',
    );
    const result = loadSystemPrompt('test', { lacc_data_dir: '/data', repo_path: '/repo' }, tmpDir);
    expect(result).toBe('Data: /data, Repo: /repo');
  });

  it('reads from user laccDataDir when file exists there', () => {
    fs.writeFileSync(path.join(tmpDir, 'system-prompts', 'test.md'), 'user version');
    const result = loadSystemPrompt('test', {}, tmpDir);
    expect(result).toBe('user version');
  });

  it('falls back to inline default for known names when user file absent', () => {
    const result = loadSystemPrompt('library-workbench', {}, tmpDir);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty string for unknown name with no user file', () => {
    const result = loadSystemPrompt('nonexistent-prompt-xyz', {}, tmpDir);
    expect(result).toBe('');
  });

  it('leaves unknown variables as-is', () => {
    fs.writeFileSync(path.join(tmpDir, 'system-prompts', 'test.md'), 'Hello {{unknown}}');
    const result = loadSystemPrompt('test', {}, tmpDir);
    expect(result).toBe('Hello {{unknown}}');
  });

  it('substitutes the same variable multiple times', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'system-prompts', 'test.md'),
      '{{lacc_data_dir}} and again {{lacc_data_dir}}',
    );
    const result = loadSystemPrompt('test', { lacc_data_dir: '/x' }, tmpDir);
    expect(result).toBe('/x and again /x');
  });
});
