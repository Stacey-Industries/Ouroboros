import { describe, expect, it } from 'vitest';

import { checkCapability, getTimeoutMs } from './capabilityGate';
import { CHANNEL_CATALOG } from './channelCatalog';

describe('checkCapability', () => {
  it("'always' channel is allowed with empty deviceCapabilities", () => {
    const result = checkCapability({ channel: 'perf:ping', deviceCapabilities: [] });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("'always' channel is allowed regardless of device capabilities", () => {
    const result = checkCapability({
      channel: 'config:get',
      deviceCapabilities: ['paired-read', 'paired-write'],
    });
    expect(result.allowed).toBe(true);
  });

  it("'desktop-only' channel is denied with reason 'desktop-only'", () => {
    const result = checkCapability({
      channel: 'pty:spawn',
      deviceCapabilities: ['paired-read', 'paired-write'],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('desktop-only');
  });

  it("'desktop-only' channel is denied even with full capabilities", () => {
    const result = checkCapability({
      channel: 'files:delete',
      deviceCapabilities: ['always', 'paired-read', 'paired-write', 'desktop-only'] as never,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('desktop-only');
  });

  it("'paired-read' channel + ['paired-read'] device → allowed", () => {
    const result = checkCapability({
      channel: 'files:readFile',
      deviceCapabilities: ['paired-read'],
    });
    expect(result.allowed).toBe(true);
  });

  it("'paired-read' channel + ['paired-write'] only → denied", () => {
    const result = checkCapability({
      channel: 'files:readFile',
      deviceCapabilities: ['paired-write'],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('requires:paired-read');
  });

  it("'paired-write' channel + ['paired-read', 'paired-write'] → allowed", () => {
    const result = checkCapability({
      channel: 'agentChat:sendMessage',
      deviceCapabilities: ['paired-read', 'paired-write'],
    });
    expect(result.allowed).toBe(true);
  });

  it("'paired-write' channel + ['paired-read'] only → denied", () => {
    const result = checkCapability({
      channel: 'agentChat:sendMessage',
      deviceCapabilities: ['paired-read'],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('requires:paired-write');
  });

  it('unclassified channel → denied with reason unclassified', () => {
    const result = checkCapability({
      channel: 'nonexistent:channel',
      deviceCapabilities: ['paired-read', 'paired-write'],
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unclassified');
  });

  it('empty string channel → denied with reason unclassified', () => {
    const result = checkCapability({ channel: '', deviceCapabilities: [] });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('unclassified');
  });
});

describe('getTimeoutMs', () => {
  it('returns 10_000 for short-class channels', () => {
    expect(getTimeoutMs('perf:ping')).toBe(10_000);
    expect(getTimeoutMs('app:getVersion')).toBe(10_000);
  });

  it('returns 30_000 for normal-class channels', () => {
    expect(getTimeoutMs('files:readFile')).toBe(30_000);
    expect(getTimeoutMs('git:status')).toBe(30_000);
  });

  it('returns 120_000 for long-class channels', () => {
    expect(getTimeoutMs('agentChat:sendMessage')).toBe(120_000);
    expect(getTimeoutMs('spec:scaffold')).toBe(120_000);
  });

  it('returns 30_000 (normal default) for unclassified channels', () => {
    expect(getTimeoutMs('nonexistent:channel')).toBe(30_000);
  });

  /**
   * Consistency guard: all channels sharing the same timeoutClass must return
   * the same ms value. Trivially true given the current implementation but
   * guards against future regressions (e.g. per-channel overrides drifting).
   * Wave 33a Phase F.
   */
  it('all channels in the same timeoutClass return the same ms value', () => {
    const byClass = new Map<string, number[]>([
      ['short', []],
      ['normal', []],
      ['long', []],
    ]);
    for (const entry of CHANNEL_CATALOG) {
      const ms = getTimeoutMs(entry.channel);
      byClass.get(entry.timeoutClass)!.push(ms);
    }
    for (const [, values] of byClass) {
      const first = values[0];
      const mixed = [...new Set(values)].join(', ');
      expect(
        values.every((v) => v === first),
        `all values should be ${first}, got mixed: ${mixed}`,
      ).toBe(true);
    }
  });
});
