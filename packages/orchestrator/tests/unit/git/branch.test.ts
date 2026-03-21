import { describe, it, expect, vi } from 'vitest';

// Unmock for this file — we're testing the real implementation
vi.unmock('../../../src/git/worktree.js');

import { generateBranchName } from '../../../src/git/worktree.js';

describe('generateBranchName', () => {
  it('produces correct format with ticket', () => {
    const result = generateBranchName({
      type: 'feat',
      ticket: 'ENG-421',
      prompt: 'add jwt refresh token flow',
      template: '{type}/{ticket}-{slug}-{date}',
    });
    expect(result).toMatch(/^feat\/eng-421-add-jwt-refresh/);
  });

  it('no leading dash when ticket is empty', () => {
    const result = generateBranchName({
      type: 'feat',
      ticket: '',
      prompt: 'add jwt refresh token',
      template: '{type}/{ticket}-{slug}-{date}',
    });
    expect(result).not.toContain('feat/-');
    expect(result).toMatch(/^feat\/add-jwt/);
  });

  it('no leading dash when ticket is undefined', () => {
    const result = generateBranchName({
      type: 'fix',
      ticket: undefined,
      prompt: 'fix login bug',
      template: '{type}/{ticket}-{slug}-{date}',
    });
    expect(result).toMatch(/^fix\/fix-login/);
    expect(result).not.toContain('fix/-');
  });

  it('sanitises special characters from prompt', () => {
    const result = generateBranchName({
      type: 'feat',
      ticket: '',
      prompt: 'fix the "login" page & auth flow',
      template: '{type}/{slug}',
    });
    expect(result).not.toMatch(/["&]/);
    expect(result).toMatch(/^feat\//);
  });

  it('truncates long prompts to reasonable length', () => {
    const result = generateBranchName({
      type: 'feat',
      ticket: '',
      prompt: 'a very long prompt that goes on and on with many words that should be truncated',
      template: '{type}/{slug}-{date}',
    });
    expect(result.length).toBeLessThan(100);
  });

  it('lowercases the result', () => {
    const result = generateBranchName({
      type: 'feat',
      ticket: 'ENG-421',
      prompt: 'Add JWT Token',
      template: '{type}/{ticket}-{slug}',
    });
    expect(result).toBe(result.toLowerCase());
  });

  it('replaces spaces with hyphens', () => {
    const result = generateBranchName({
      type: 'feat',
      ticket: '',
      prompt: 'add user authentication',
      template: '{type}/{slug}',
    });
    expect(result).not.toContain(' ');
  });

  it('no double hyphens', () => {
    const result = generateBranchName({
      type: 'feat',
      ticket: '',
      prompt: 'fix  double  spaces',
      template: '{type}/{slug}',
    });
    expect(result).not.toContain('--');
  });
});
