import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  beginChatSessionLaunch,
  endChatSessionLaunch,
  getChatLaunchesInFlight,
} from './hooksChatLaunch';

vi.mock('./logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

describe('hooksChatLaunch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset module state between tests by draining any in-flight state
    while (getChatLaunchesInFlight() > 0) endChatSessionLaunch();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('beginChatSessionLaunch / endChatSessionLaunch', () => {
    it('increments and decrements the counter', () => {
      expect(getChatLaunchesInFlight()).toBe(0);
      beginChatSessionLaunch();
      expect(getChatLaunchesInFlight()).toBe(1);
      endChatSessionLaunch();
      expect(getChatLaunchesInFlight()).toBe(0);
    });

    it('supports multiple concurrent launches', () => {
      beginChatSessionLaunch();
      beginChatSessionLaunch();
      expect(getChatLaunchesInFlight()).toBe(2);
      endChatSessionLaunch();
      expect(getChatLaunchesInFlight()).toBe(1);
      endChatSessionLaunch();
      expect(getChatLaunchesInFlight()).toBe(0);
    });

    it('does not decrement below zero', () => {
      expect(getChatLaunchesInFlight()).toBe(0);
      endChatSessionLaunch();
      expect(getChatLaunchesInFlight()).toBe(0);
    });
  });

  describe('safety timeout', () => {
    it('auto-decrements after 30 s if endChatSessionLaunch was never called', () => {
      beginChatSessionLaunch();
      expect(getChatLaunchesInFlight()).toBe(1);
      vi.advanceTimersByTime(30_000);
      expect(getChatLaunchesInFlight()).toBe(0);
    });

    it('does not double-decrement when endChatSessionLaunch is called before timeout', () => {
      beginChatSessionLaunch();
      endChatSessionLaunch();
      expect(getChatLaunchesInFlight()).toBe(0);
      vi.advanceTimersByTime(30_000);
      expect(getChatLaunchesInFlight()).toBe(0);
    });

    it('each launch gets its own independent timeout', () => {
      beginChatSessionLaunch();
      beginChatSessionLaunch();
      vi.advanceTimersByTime(30_000);
      // Both timeouts fire — counter should reach 0
      expect(getChatLaunchesInFlight()).toBe(0);
    });
  });
});
