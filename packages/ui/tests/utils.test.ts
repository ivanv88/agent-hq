import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateBranchPreview, elapsedStr } from '../src/utils.js';

// ── elapsedStr ───────────────────────────────────────────────────────────────

describe('elapsedStr', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for null', () => {
    expect(elapsedStr(null)).toBe('');
  });

  it('returns seconds for <60s', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T12:00:45Z'));
    expect(elapsedStr(new Date('2026-03-21T12:00:00Z'))).toBe('45s');
  });

  it('returns 0s for same time', () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-21T12:00:00Z');
    vi.setSystemTime(now);
    expect(elapsedStr(now)).toBe('0s');
  });

  it('returns minutes for 1–59m', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T12:05:00Z'));
    expect(elapsedStr(new Date('2026-03-21T12:00:00Z'))).toBe('5m');
  });

  it('returns hours+minutes for ≥60m', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T13:30:00Z'));
    expect(elapsedStr(new Date('2026-03-21T12:00:00Z'))).toBe('1h30m');
  });

  it('handles exact hour boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T14:00:00Z'));
    expect(elapsedStr(new Date('2026-03-21T12:00:00Z'))).toBe('2h0m');
  });

  it('accepts ISO date strings', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T12:10:00Z'));
    expect(elapsedStr('2026-03-21T12:00:00Z')).toBe('10m');
  });

  it('handles 59 seconds (boundary before minutes)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T12:00:59Z'));
    expect(elapsedStr(new Date('2026-03-21T12:00:00Z'))).toBe('59s');
  });

  it('switches to minutes at exactly 60s', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T12:01:00Z'));
    expect(elapsedStr(new Date('2026-03-21T12:00:00Z'))).toBe('1m');
  });
});

// ── generateBranchPreview ────────────────────────────────────────────────────

describe('generateBranchPreview', () => {
  it('returns empty string for blank prompt', () => {
    expect(generateBranchPreview('feat', '', '')).toBe('');
    expect(generateBranchPreview('feat', '', '   ')).toBe('');
  });

  it('includes type prefix', () => {
    const result = generateBranchPreview('feat', '', 'add auth');
    expect(result).toMatch(/^feat\//);
  });

  it('includes ticket when provided', () => {
    const result = generateBranchPreview('fix', 'ENG-42', 'fix login');
    expect(result).toMatch(/^fix\/ENG-42-/);
  });

  it('omits ticket dash when ticket is empty', () => {
    const result = generateBranchPreview('feat', '', 'add auth');
    expect(result).not.toMatch(/^feat\/-/);
  });

  it('slugifies the prompt to lowercase', () => {
    const result = generateBranchPreview('feat', '', 'Add JWT Auth Flow');
    expect(result).not.toMatch(/[A-Z]/);
  });

  it('strips special characters from prompt', () => {
    const result = generateBranchPreview('feat', '', 'fix the "login" page & auth');
    expect(result).not.toMatch(/["&]/);
  });

  it('uses at most 5 words from prompt', () => {
    const result = generateBranchPreview('feat', '', 'one two three four five six seven');
    const slug = result.replace(/^feat\//, '').replace(/-\d{4}$/, '');
    const words = slug.split('-');
    expect(words.length).toBeLessThanOrEqual(5);
  });

  it('appends MMDD date suffix', () => {
    const result = generateBranchPreview('feat', '', 'add auth');
    // Should end with 4 digits (MMDD)
    expect(result).toMatch(/\d{4}$/);
  });

  it('collapses double hyphens', () => {
    const result = generateBranchPreview('feat', '', 'fix  --  stuff');
    expect(result).not.toContain('--');
  });

  it('truncates to 100 characters', () => {
    const longPrompt = 'a '.repeat(200);
    const result = generateBranchPreview('feat', 'LONG-TICKET-NAME', longPrompt);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('trims ticket whitespace', () => {
    const result = generateBranchPreview('fix', '  ENG-1  ', 'something');
    expect(result).toMatch(/^fix\/ENG-1-/);
  });

  it('no trailing or leading hyphens in result', () => {
    const result = generateBranchPreview('feat', '', 'add auth');
    expect(result).not.toMatch(/-$/);
    // After type/ prefix, no leading hyphen
    const afterSlash = result.split('/')[1];
    expect(afterSlash).not.toMatch(/^-/);
  });
});
