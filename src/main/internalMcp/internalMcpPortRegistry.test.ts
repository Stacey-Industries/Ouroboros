import { afterEach, describe, expect, it } from 'vitest';

import {
  clearInternalMcpPort,
  getInternalMcpUrl,
  setInternalMcpPort,
} from './internalMcpPortRegistry';

describe('internalMcpPortRegistry', () => {
  afterEach(() => {
    clearInternalMcpPort();
  });

  it('returns null when no port has been set', () => {
    expect(getInternalMcpUrl()).toBeNull();
  });

  it('returns the correct SSE URL after setInternalMcpPort', () => {
    setInternalMcpPort(54321);
    expect(getInternalMcpUrl()).toBe('http://127.0.0.1:54321/sse');
  });

  it('returns null after clearInternalMcpPort', () => {
    setInternalMcpPort(54321);
    clearInternalMcpPort();
    expect(getInternalMcpUrl()).toBeNull();
  });

  it('reflects the most recently set port', () => {
    setInternalMcpPort(1111);
    setInternalMcpPort(2222);
    expect(getInternalMcpUrl()).toBe('http://127.0.0.1:2222/sse');
  });
});
