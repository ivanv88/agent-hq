import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP = path.join(os.tmpdir(), `lacc-storage-test-${Date.now()}`);
const TMP_REPO = path.join(TMP, 'my-repo');
const TMP_DATA = path.join(TMP, 'lacc-data');

process.env.LACC_DATA_DIR_OVERRIDE = TMP_DATA;

const { getLaccRoot, getTaskStoragePath } = await import('../../../src/storage/lacc.js');

beforeEach(() => {
  fs.mkdirSync(TMP_REPO, { recursive: true });
  fs.mkdirSync(TMP_DATA, { recursive: true });
});

afterEach(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe('getLaccRoot', () => {
  it('returns local mode when .lacc/ dir exists in repo', () => {
    fs.mkdirSync(path.join(TMP_REPO, '.lacc'));
    const result = getLaccRoot(TMP_REPO);
    expect(result.mode).toBe('local');
    expect(result.root).toBe(path.join(TMP_REPO, '.lacc'));
  });

  it('returns global mode when repo is registered', () => {
    // register the repo manually in registry
    fs.writeFileSync(
      path.join(TMP_DATA, 'registry.json'),
      JSON.stringify({ [TMP_REPO]: { name: 'my-repo', remoteUrl: null } })
    );
    const result = getLaccRoot(TMP_REPO);
    expect(result.mode).toBe('global');
    expect(result.root).toBe(path.join(TMP_DATA, 'repos', 'my-repo'));
  });

  it('returns null mode when repo is not configured', () => {
    const result = getLaccRoot(TMP_REPO);
    expect(result.mode).toBe('none');
    expect(result.root).toBeNull();
  });
});

describe('getTaskStoragePath', () => {
  it('returns path inside local .lacc/ for local mode', () => {
    fs.mkdirSync(path.join(TMP_REPO, '.lacc', 'tasks', 'task-123'), { recursive: true });
    const p = getTaskStoragePath(TMP_REPO, 'task-123');
    expect(p).toBe(path.join(TMP_REPO, '.lacc', 'tasks', 'task-123'));
  });
});
