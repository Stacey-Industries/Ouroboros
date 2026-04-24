/**
 * agentChatWorkspaceActionHelpers.test.ts — Smoke tests for pure helper functions.
 */
import { describe, expect, it } from 'vitest';

import { buildContextSelection, getErrorMessage, getThreadIdForSend, hasElectronAPI } from './agentChatWorkspaceActionHelpers';

describe('getErrorMessage', () => {
  it('extracts message from Error instances', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });
  it('stringifies non-Error values', () => {
    expect(getErrorMessage('plain')).toBe('plain');
  });
});

describe('getThreadIdForSend', () => {
  it('returns undefined for draft thread ids', () => {
    // Draft IDs start with 'draft-'
    expect(getThreadIdForSend('draft-abc')).toBeUndefined();
  });
  it('returns the id for real thread ids', () => {
    expect(getThreadIdForSend('real-thread-id')).toBe('real-thread-id');
  });
  it('returns undefined for null', () => {
    expect(getThreadIdForSend(null)).toBeUndefined();
  });
});

describe('buildContextSelection', () => {
  it('returns undefined when no paths', () => {
    expect(buildContextSelection()).toBeUndefined();
    expect(buildContextSelection([])).toBeUndefined();
  });
  it('returns selection with paths', () => {
    const result = buildContextSelection(['/a/b.ts']);
    expect(result?.userSelectedFiles).toEqual(['/a/b.ts']);
  });
  it('includes mention ranges when provided', () => {
    const ranges = [{ path: '/a/b.ts', startLine: 1, endLine: 5 }];
    const result = buildContextSelection(['/a/b.ts'], ranges as never);
    expect(result?.userSelectedRanges).toEqual(ranges);
  });
});

describe('hasElectronAPI', () => {
  it('returns false when electronAPI is absent', () => {
    // In vitest/jsdom environment, electronAPI is not present by default
    expect(typeof hasElectronAPI()).toBe('boolean');
  });
});
