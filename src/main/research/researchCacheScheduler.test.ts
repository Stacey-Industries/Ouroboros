/**
 * researchCacheScheduler.test.ts — Asserts that scheduleResearchCachePurge
 * triggers purgeExpired at startup and on the daily interval (Wave 41 F.4).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock getResearchCache to capture purgeExpired calls without touching disk
const mockPurgeExpired = vi.fn(() => 0);
vi.mock('./researchCache', () => ({
  getResearchCache: vi.fn(() => ({ purgeExpired: mockPurgeExpired })),
  resetResearchCacheForTests: vi.fn(),
}));

import {
  _clearResearchCachePurgeForTests,
  scheduleResearchCachePurge,
} from './researchCacheScheduler';

describe('scheduleResearchCachePurge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPurgeExpired.mockClear();
  });

  afterEach(() => {
    _clearResearchCachePurgeForTests();
    vi.useRealTimers();
  });

  it('calls purgeExpired once at startup via setImmediate', () => {
    scheduleResearchCachePurge('/fake/userData');
    vi.advanceTimersByTime(0);
    expect(mockPurgeExpired).toHaveBeenCalledTimes(1);
  });

  it('calls purgeExpired again after 24 h', () => {
    scheduleResearchCachePurge('/fake/userData');
    vi.advanceTimersByTime(0);
    mockPurgeExpired.mockClear();

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(mockPurgeExpired).toHaveBeenCalledTimes(1);
  });

  it('calls purgeExpired a second time after 48 h', () => {
    scheduleResearchCachePurge('/fake/userData');
    vi.advanceTimersByTime(0);
    mockPurgeExpired.mockClear();

    vi.advanceTimersByTime(48 * 60 * 60 * 1000);
    expect(mockPurgeExpired).toHaveBeenCalledTimes(2);
  });

  it('stops firing after _clearResearchCachePurgeForTests', () => {
    scheduleResearchCachePurge('/fake/userData');
    vi.advanceTimersByTime(0);
    mockPurgeExpired.mockClear();

    _clearResearchCachePurgeForTests();
    vi.advanceTimersByTime(48 * 60 * 60 * 1000);
    expect(mockPurgeExpired).not.toHaveBeenCalled();
  });
});
