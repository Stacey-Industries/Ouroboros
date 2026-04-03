/**
 * ConversationTurnRow.test.ts — Unit tests for ConversationTurnRow helpers.
 */

import { describe, expect, it } from 'vitest';

import type { ConversationTurn } from './types';

// ─── Inline the pure helpers under test ───────────────────────────────────────

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function turnLabel(turn: ConversationTurn): string {
  switch (turn.type) {
    case 'prompt':
      return 'You:';
    case 'elicitation':
      return 'Agent asks:';
    case 'elicitation_result':
      return 'You answered:';
  }
}

function turnContent(turn: ConversationTurn): string {
  if (turn.type === 'elicitation' && turn.question) return turn.question;
  return turn.content;
}

function labelColor(type: ConversationTurn['type']): string {
  if (type === 'elicitation') return 'var(--interactive-accent)';
  return 'var(--text-faint)';
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const BASE_TS = new Date('2024-01-15T14:05:09.000Z').getTime();

describe('formatTimestamp', () => {
  it('pads hours, minutes, seconds with leading zeros', () => {
    // Use a fixed local-time offset-safe approach: build a Date whose local
    // hours/minutes/seconds are known by constructing it from local parts.
    const d = new Date(2024, 0, 15, 9, 5, 3); // Jan 15, 09:05:03 local
    const result = formatTimestamp(d.getTime());
    expect(result).toBe('09:05:03');
  });

  it('produces HH:MM:SS format', () => {
    const result = formatTimestamp(BASE_TS);
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe('turnLabel', () => {
  it('returns "You:" for prompt type', () => {
    const turn: ConversationTurn = { type: 'prompt', content: 'hello', timestamp: BASE_TS };
    expect(turnLabel(turn)).toBe('You:');
  });

  it('returns "Agent asks:" for elicitation type', () => {
    const turn: ConversationTurn = { type: 'elicitation', content: '', timestamp: BASE_TS };
    expect(turnLabel(turn)).toBe('Agent asks:');
  });

  it('returns "You answered:" for elicitation_result type', () => {
    const turn: ConversationTurn = { type: 'elicitation_result', content: 'yes', timestamp: BASE_TS };
    expect(turnLabel(turn)).toBe('You answered:');
  });
});

describe('turnContent', () => {
  it('returns content for prompt turns', () => {
    const turn: ConversationTurn = { type: 'prompt', content: 'my prompt', timestamp: BASE_TS };
    expect(turnContent(turn)).toBe('my prompt');
  });

  it('returns question for elicitation turns when question is set', () => {
    const turn: ConversationTurn = {
      type: 'elicitation',
      content: 'raw content',
      question: 'What do you want?',
      timestamp: BASE_TS,
    };
    expect(turnContent(turn)).toBe('What do you want?');
  });

  it('falls back to content for elicitation turns without question', () => {
    const turn: ConversationTurn = { type: 'elicitation', content: 'fallback', timestamp: BASE_TS };
    expect(turnContent(turn)).toBe('fallback');
  });

  it('returns content for elicitation_result turns', () => {
    const turn: ConversationTurn = { type: 'elicitation_result', content: 'my answer', timestamp: BASE_TS };
    expect(turnContent(turn)).toBe('my answer');
  });
});

describe('labelColor', () => {
  it('uses accent color for elicitation', () => {
    expect(labelColor('elicitation')).toBe('var(--interactive-accent)');
  });

  it('uses faint color for prompt', () => {
    expect(labelColor('prompt')).toBe('var(--text-faint)');
  });

  it('uses faint color for elicitation_result', () => {
    expect(labelColor('elicitation_result')).toBe('var(--text-faint)');
  });
});
