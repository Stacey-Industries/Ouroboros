/**
 * researchSlashCommands.test.ts — Unit tests for /research slash command handlers.
 * Wave 30 Phase C.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  addEnhancedLibrary,
  getResearchMode,
  resetAllForTests,
} from './researchSessionState';
import { handleResearchSlashCommand } from './researchSlashCommands';

afterEach(() => {
  resetAllForTests();
});

describe('handleResearchSlashCommand — /research off', () => {
  it('returns handled: true with confirmation message', () => {
    const result = handleResearchSlashCommand('s1', 'off');
    expect(result.handled).toBe(true);
    if (result.handled) expect(result.message).toMatch(/disabled/i);
  });

  it('sets mode to off', () => {
    handleResearchSlashCommand('s1', 'off');
    expect(getResearchMode('s1')).toBe('off');
  });
});

describe('handleResearchSlashCommand — /research on', () => {
  it('returns handled: true with conservative confirmation', () => {
    const result = handleResearchSlashCommand('s2', 'on');
    expect(result.handled).toBe(true);
    if (result.handled) expect(result.message).toMatch(/conservative/i);
  });

  it('sets mode to conservative, not aggressive', () => {
    handleResearchSlashCommand('s2', 'on');
    expect(getResearchMode('s2')).toBe('conservative');
  });

  it('overrides a prior aggressive setting', () => {
    handleResearchSlashCommand('s2', 'aggressive');
    handleResearchSlashCommand('s2', 'on');
    expect(getResearchMode('s2')).toBe('conservative');
  });
});

describe('handleResearchSlashCommand — /research aggressive', () => {
  it('returns handled: true with aggressive confirmation', () => {
    const result = handleResearchSlashCommand('s3', 'aggressive');
    expect(result.handled).toBe(true);
    if (result.handled) expect(result.message).toMatch(/aggressive/i);
  });

  it('sets mode to aggressive', () => {
    handleResearchSlashCommand('s3', 'aggressive');
    expect(getResearchMode('s3')).toBe('aggressive');
  });
});

describe('handleResearchSlashCommand — /research status', () => {
  it('returns handled: true with mode in message', () => {
    const result = handleResearchSlashCommand('s4', 'status');
    expect(result.handled).toBe(true);
    if (result.handled) expect(result.message).toMatch(/conservative/i);
  });

  it('reflects current mode after change', () => {
    handleResearchSlashCommand('s4', 'aggressive');
    const result = handleResearchSlashCommand('s4', 'status');
    expect(result.handled).toBe(true);
    if (result.handled) expect(result.message).toMatch(/aggressive/i);
  });

  it('does not mutate state', () => {
    handleResearchSlashCommand('s5', 'off');
    handleResearchSlashCommand('s5', 'status');
    expect(getResearchMode('s5')).toBe('off');
  });

  it('reports enhanced library count when libraries are present', () => {
    addEnhancedLibrary('s6', 'react');
    addEnhancedLibrary('s6', 'next');
    const result = handleResearchSlashCommand('s6', 'status');
    expect(result.handled).toBe(true);
    if (result.handled) expect(result.message).toMatch(/2/);
  });

  it('omits library count when no libraries are present', () => {
    const result = handleResearchSlashCommand('s7', 'status');
    expect(result.handled).toBe(true);
    if (result.handled) expect(result.message).not.toMatch(/librar/i);
  });
});

describe('handleResearchSlashCommand — unknown subcommand', () => {
  it('returns handled: false for unknown subcommand', () => {
    const result = handleResearchSlashCommand('s8', 'unknown');
    expect(result.handled).toBe(false);
  });

  it('returns handled: false for empty subcommand', () => {
    const result = handleResearchSlashCommand('s8', '');
    expect(result.handled).toBe(false);
  });

  it('returns handled: false for unrelated words', () => {
    const result = handleResearchSlashCommand('s8', 'help');
    expect(result.handled).toBe(false);
  });
});

describe('handleResearchSlashCommand — case insensitivity', () => {
  it('accepts uppercase OFF', () => {
    const result = handleResearchSlashCommand('s9', 'OFF');
    expect(result.handled).toBe(true);
  });

  it('accepts mixed-case Aggressive', () => {
    const result = handleResearchSlashCommand('s9', 'Aggressive');
    expect(result.handled).toBe(true);
  });

  it('accepts STATUS with leading whitespace', () => {
    const result = handleResearchSlashCommand('s9', '  status  ');
    expect(result.handled).toBe(true);
  });
});
