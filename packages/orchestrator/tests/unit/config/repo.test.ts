import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadRepoConfig } from '../../../src/config/repo.js';

const TMP = path.join(os.tmpdir(), `lacc-test-${Date.now()}`);

beforeEach(() => fs.mkdirSync(TMP, { recursive: true }));
afterEach(() => fs.rmSync(TMP, { recursive: true, force: true }));

describe('loadRepoConfig', () => {
  it('returns {} when no .lacc exists', () => {
    expect(loadRepoConfig(TMP)).toEqual({});
  });

  it('reads legacy .lacc JSON file', () => {
    fs.writeFileSync(path.join(TMP, '.lacc'), JSON.stringify({ devServerMode: 'proxy' }));
    expect(loadRepoConfig(TMP)).toMatchObject({ devServerMode: 'proxy' });
  });

  it('reads .lacc/config.yml directory (YAML)', () => {
    fs.mkdirSync(path.join(TMP, '.lacc'));
    fs.writeFileSync(
      path.join(TMP, '.lacc', 'config.yml'),
      'commitLacc: true\nbaseBranch: develop\n'
    );
    const cfg = loadRepoConfig(TMP);
    expect(cfg.commitLacc).toBe(true);
    expect(cfg.baseBranch).toBe('develop');
  });

  it('prefers .lacc/ directory over .lacc JSON when both exist', () => {
    fs.mkdirSync(path.join(TMP, '.lacc'));
    fs.writeFileSync(path.join(TMP, '.lacc', 'config.yml'), 'commitLacc: false\n');
    // legacy file should be ignored
    expect(loadRepoConfig(TMP)).toMatchObject({ commitLacc: false });
  });
});
