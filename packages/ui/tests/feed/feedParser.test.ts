import { describe, it, expect } from 'vitest';
import { parseFeedLine, getToolSummary } from '../../src/feed/feedParser';

// ── parseFeedLine ────────────────────────────────────────────────────────────

describe('parseFeedLine', () => {
  it('returns empty array for invalid JSON', () => {
    expect(parseFeedLine('not json')).toEqual([]);
    expect(parseFeedLine('')).toEqual([]);
  });

  it('returns empty array for unknown event type', () => {
    expect(parseFeedLine(JSON.stringify({ type: 'unknown_thing' }))).toEqual([]);
  });

  // ── system init ──────────────────────────────────────────────────────────

  it('parses system init into system_info', () => {
    const line = JSON.stringify({
      type: 'system',
      subtype: 'init',
      model: 'claude-sonnet-4-5-20250514',
      session_id: 'abcdef1234567890',
    });
    const result = parseFeedLine(line);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('system_info');
    expect((result[0] as { type: 'system_info'; text: string }).text).toBe(
      'claude-sonnet-4-5-20250514  ·  session abcdef12',
    );
  });

  // ── assistant text ───────────────────────────────────────────────────────

  it('parses assistant text block', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Hello world' }],
      },
    });
    const result = parseFeedLine(line);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
    expect((result[0] as { type: 'text'; content: string }).content).toBe('Hello world');
  });

  it('skips empty text blocks', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: '   ' }],
      },
    });
    expect(parseFeedLine(line)).toEqual([]);
  });

  // ── assistant thinking ───────────────────────────────────────────────────

  it('parses thinking block', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'thinking', thinking: 'Let me consider...' }],
      },
    });
    const result = parseFeedLine(line);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('thinking');
    expect((result[0] as { type: 'thinking'; content: string }).content).toBe('Let me consider...');
    expect((result[0] as { type: 'thinking'; collapsed: boolean }).collapsed).toBe(true);
  });

  // ── assistant with multiple blocks ───────────────────────────────────────

  it('parses multiple content blocks from one assistant message', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'I will edit the file.' },
          { type: 'tool_use', name: 'Edit', input: { file_path: '/src/foo.ts' } },
        ],
      },
    });
    const result = parseFeedLine(line);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('text');
    expect(result[1].type).toBe('file_change');
  });

  // ── tool_use → file_change ──────────────────────────────────────────────

  it('converts Read tool_use to file_change', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/src/index.ts' } }],
      },
    });
    const result = parseFeedLine(line);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('file_change');
    const fc = result[0] as { type: 'file_change'; action: string; path: string };
    expect(fc.action).toBe('Read');
    expect(fc.path).toBe('/src/index.ts');
  });

  it('converts Write tool_use to file_change', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/new/file.ts' } }],
      },
    });
    const result = parseFeedLine(line);
    expect(result[0].type).toBe('file_change');
    expect((result[0] as { type: 'file_change'; action: string }).action).toBe('Write');
  });

  it('converts Edit tool_use to file_change', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/src/app.ts' } }],
      },
    });
    const result = parseFeedLine(line);
    expect(result[0].type).toBe('file_change');
    expect((result[0] as { type: 'file_change'; action: string }).action).toBe('Edit');
  });

  // ── tool_use → todo_list ────────────────────────────────────────────────

  it('converts TodoWrite to todo_list', () => {
    const todos = [
      { id: '1', content: 'Fix bug', status: 'in_progress', priority: 'high' },
      { id: '2', content: 'Add test', status: 'pending', priority: 'medium' },
    ];
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'TodoWrite', input: { todos } }],
      },
    });
    const result = parseFeedLine(line);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('todo_list');
    expect((result[0] as { type: 'todo_list'; todos: unknown[] }).todos).toHaveLength(2);
  });

  // ── tool_use → generic tool card ────────────────────────────────────────

  it('converts unknown tool_use to generic tool card', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }],
      },
    });
    const result = parseFeedLine(line);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tool_use');
    const tu = result[0] as { type: 'tool_use'; name: string; input: Record<string, unknown> };
    expect(tu.name).toBe('Bash');
    expect(tu.input.command).toBe('npm test');
    expect((result[0] as { collapsed: boolean }).collapsed).toBe(true);
  });

  // ── top-level tool_use (sub-agent) ──────────────────────────────────────

  it('parses top-level tool_use event', () => {
    const line = JSON.stringify({
      type: 'tool_use',
      name: 'Grep',
      input: { pattern: 'TODO' },
    });
    const result = parseFeedLine(line);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tool_use');
    expect((result[0] as { type: 'tool_use'; name: string }).name).toBe('Grep');
  });

  // ── tool_result ─────────────────────────────────────────────────────────

  it('parses tool_result with string content', () => {
    const line = JSON.stringify({
      type: 'tool_result',
      content: 'PASS 3 tests passed',
    });
    const result = parseFeedLine(line);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tool_result');
    const tr = result[0] as { type: 'tool_result'; output: string; isError: boolean };
    expect(tr.output).toBe('PASS 3 tests passed');
    expect(tr.isError).toBe(false);
  });

  it('parses tool_result with array content', () => {
    const line = JSON.stringify({
      type: 'tool_result',
      content: [
        { type: 'text', text: 'line 1' },
        { type: 'text', text: 'line 2' },
      ],
    });
    const result = parseFeedLine(line);
    expect((result[0] as { type: 'tool_result'; output: string }).output).toBe('line 1\nline 2');
  });

  it('parses error tool_result', () => {
    const line = JSON.stringify({
      type: 'tool_result',
      content: 'command failed',
      is_error: true,
    });
    const result = parseFeedLine(line);
    expect((result[0] as { type: 'tool_result'; isError: boolean }).isError).toBe(true);
  });

  // ── result ──────────────────────────────────────────────────────────────

  it('parses result event', () => {
    const line = JSON.stringify({
      type: 'result',
      total_cost_usd: 0.84,
      duration_ms: 492000,
      is_error: false,
    });
    const result = parseFeedLine(line);
    expect(result).toHaveLength(1);
    const r = result[0] as { type: 'result'; cost: number; durationMs: number; status: string };
    expect(r.type).toBe('result');
    expect(r.cost).toBe(0.84);
    expect(r.durationMs).toBe(492000);
    expect(r.status).toBe('success');
  });

  it('parses error result', () => {
    const line = JSON.stringify({
      type: 'result',
      total_cost_usd: 0.12,
      duration_ms: 5000,
      is_error: true,
    });
    const result = parseFeedLine(line);
    expect((result[0] as { type: 'result'; status: string }).status).toBe('error');
  });

  // ── user_message ────────────────────────────────────────────────────────

  it('parses user_message event', () => {
    const ts = '2026-03-22T10:30:00.000Z';
    const line = JSON.stringify({
      type: 'user_message',
      content: 'fix the tests',
      timestamp: ts,
    });
    const result = parseFeedLine(line);
    expect(result).toHaveLength(1);
    const um = result[0] as { type: 'user_message'; content: string; timestamp: Date };
    expect(um.type).toBe('user_message');
    expect(um.content).toBe('fix the tests');
    expect(um.timestamp.toISOString()).toBe(ts);
  });

  // ── error ───────────────────────────────────────────────────────────────

  it('parses error event', () => {
    const line = JSON.stringify({
      type: 'error',
      message: 'Rate limited',
    });
    const result = parseFeedLine(line);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('error');
    expect((result[0] as { type: 'error'; message: string }).message).toBe('Rate limited');
  });

  it('falls back to error field', () => {
    const line = JSON.stringify({
      type: 'error',
      error: 'Something went wrong',
    });
    const result = parseFeedLine(line);
    expect((result[0] as { type: 'error'; message: string }).message).toBe('Something went wrong');
  });

  // ── system (non-init) ──────────────────────────────────────────────────

  it('parses non-init system event', () => {
    const line = JSON.stringify({
      type: 'system',
      subtype: 'heartbeat',
    });
    const result = parseFeedLine(line);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('system_info');
    expect((result[0] as { type: 'system_info'; text: string }).text).toBe('heartbeat');
  });

  // ── IDs are unique ─────────────────────────────────────────────────────

  it('generates unique IDs across calls', () => {
    const line = JSON.stringify({ type: 'error', message: 'x' });
    const a = parseFeedLine(line);
    const b = parseFeedLine(line);
    expect(a[0].id).not.toBe(b[0].id);
  });
});

// ── getToolSummary ───────────────────────────────────────────────────────────

describe('getToolSummary', () => {
  it('returns first line of Bash command truncated to 80 chars', () => {
    const cmd = 'npm test -- --testPathPattern=auth\necho done';
    expect(getToolSummary('Bash', { command: cmd })).toBe('npm test -- --testPathPattern=auth');
  });

  it('returns pattern in quotes for Grep', () => {
    expect(getToolSummary('Grep', { pattern: 'TODO' })).toBe('"TODO"');
  });

  it('returns pattern for Glob', () => {
    expect(getToolSummary('Glob', { pattern: '**/*.ts' })).toBe('**/*.ts');
  });

  it('returns first 60 chars of prompt for Agent', () => {
    const prompt = 'a'.repeat(100);
    expect(getToolSummary('Agent', { prompt })).toBe('a'.repeat(60));
  });

  it('returns empty string for unknown tool', () => {
    expect(getToolSummary('CustomTool', { foo: 'bar' })).toBe('');
  });

  it('returns empty string when expected field is missing', () => {
    expect(getToolSummary('Bash', {})).toBe('');
    expect(getToolSummary('Grep', {})).toBe('');
  });

  it('handles mcp__bash__bash as Bash', () => {
    expect(getToolSummary('mcp__bash__bash', { command: 'ls -la' })).toBe('ls -la');
  });
});
