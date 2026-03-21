import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unmock for this file — we're testing the real implementation
vi.unmock('../../../src/streaming/cost.js');

import { parseLine, createCostState } from '../../../src/streaming/cost.js';

describe('parseLine', () => {
  let state: ReturnType<typeof createCostState>;

  beforeEach(() => {
    state = createCostState();
  });

  it('extracts cost from result event', () => {
    parseLine(state, JSON.stringify({
      type: 'result',
      total_cost_usd: 0.0067,
      usage: { input_tokens: 100, output_tokens: 50 },
    }));
    expect(state.costUsd).toBe(0.0067);
    expect(state.inputTokens).toBe(100);
    expect(state.outputTokens).toBe(50);
    expect(state.dirty).toBe(true);
  });

  it('ignores non-JSON lines', () => {
    parseLine(state, 'not json at all');
    expect(state.dirty).toBe(false);
    expect(state.costUsd).toBe(0);
  });

  it('ignores empty lines', () => {
    parseLine(state, '');
    expect(state.dirty).toBe(false);
  });

  it('extracts context_tokens_used', () => {
    parseLine(state, JSON.stringify({ context_tokens_used: 42000 }));
    expect(state.contextTokensUsed).toBe(42000);
    expect(state.dirty).toBe(true);
  });

  it('detects 85% context threshold', () => {
    parseLine(state, JSON.stringify({ context_tokens_used: 170001 }));
    expect(state.contextTokensUsed).toBe(170001);
    // context85Notified should be false still — notification fired externally
    expect(state.context85Notified).toBe(false);
  });

  it('does not mark dirty for unknown event types', () => {
    parseLine(state, JSON.stringify({ type: 'thinking', content: 'hmm' }));
    expect(state.dirty).toBe(false);
  });

  it('accumulates output tokens across usage events', () => {
    parseLine(state, JSON.stringify({
      type: 'usage',
      usage: { output_tokens: 10 },
    }));
    parseLine(state, JSON.stringify({
      type: 'usage',
      usage: { output_tokens: 20 },
    }));
    expect(state.outputTokens).toBe(30);
  });
});
