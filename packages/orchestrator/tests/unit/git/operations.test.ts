import { describe, it, expect, vi } from 'vitest';

vi.mock('simple-git', () => ({
  default: vi.fn(() => ({
    pull: vi.fn().mockResolvedValue({}),
    push: vi.fn().mockResolvedValue({}),
    stash: vi.fn().mockResolvedValue(''),
    rebase: vi.fn().mockRejectedValue(Object.assign(new Error('conflict'), { git: { conflicts: ['src/foo.ts'] } })),
    status: vi.fn().mockResolvedValue({ conflicted: ['src/foo.ts'] }),
    raw: vi.fn().mockResolvedValue(''),
    reset: vi.fn().mockResolvedValue(''),
  })),
}));

const { gitPull, gitPush, gitRebase, gitStash } = await import('../../../src/git/operations.js');

describe('git operations', () => {
  it('gitPull returns ok:true on success', async () => {
    const result = await gitPull('/workspace');
    expect(result.ok).toBe(true);
  });

  it('gitPush returns ok:true on success', async () => {
    const result = await gitPush('/workspace');
    expect(result.ok).toBe(true);
  });

  it('gitStash returns ok:true on success', async () => {
    const result = await gitStash('/workspace');
    expect(result.ok).toBe(true);
  });

  it('gitRebase returns conflict info on conflict', async () => {
    const result = await gitRebase('/workspace', 'main');
    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.conflictedFiles).toContain('src/foo.ts');
  });
});
