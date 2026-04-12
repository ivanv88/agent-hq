import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP_DATA = path.join(os.tmpdir(), `lacc-registry-test-${Date.now()}`);

// Override DATA_DIR before importing
process.env.LACC_DATA_DIR_OVERRIDE = TMP_DATA;

const { getRepoName, registerRepo, resolveRepoName, updateRemoteUrl } = await import('../../../src/config/registry.js');

beforeEach(() => fs.mkdirSync(TMP_DATA, { recursive: true }));
afterEach(() => fs.rmSync(TMP_DATA, { recursive: true, force: true }));

describe('registry', () => {
  it('returns null for unknown repo', () => {
    expect(getRepoName('/some/path')).toBeNull();
  });

  it('registers a repo with a name', () => {
    registerRepo('/Users/ivan/code/frontend', 'acme-frontend', null);
    expect(getRepoName('/Users/ivan/code/frontend')).toBe('acme-frontend');
  });

  it('resolveRepoName: returns existing name or suggests folder name', () => {
    const result = resolveRepoName('/Users/ivan/code/my-app');
    expect(result.suggested).toBe('my-app');
    expect(result.conflict).toBe(false);
  });

  it('resolveRepoName: detects name conflict', () => {
    registerRepo('/Users/ivan/code/other', 'my-app', null);
    const result = resolveRepoName('/Users/ivan/code/my-app');
    expect(result.conflict).toBe(true);
  });
});
