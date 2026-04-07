import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetConfigValue = vi.fn();
const mockSetConfigValue = vi.fn();

vi.mock('./config', () => ({
  getConfigValue: (...args: unknown[]) => mockGetConfigValue(...args),
  setConfigValue: (...args: unknown[]) => mockSetConfigValue(...args),
}));

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  getWindowTrustLevel,
  getWorkspaceTrustLevel,
  isWorkspaceTrusted,
  trustWorkspace,
  untrustWorkspace,
} from './workspaceTrust';

describe('workspaceTrust', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfigValue.mockReturnValue([]);
  });

  describe('isWorkspaceTrusted', () => {
    it('returns false when workspace is not in trusted list', () => {
      mockGetConfigValue.mockReturnValue([]);
      expect(isWorkspaceTrusted('C:\\Projects\\untrusted')).toBe(false);
    });

    it('returns true when workspace is in trusted list', () => {
      mockGetConfigValue.mockReturnValue(['C:\\Projects\\myapp']);
      expect(isWorkspaceTrusted('C:\\Projects\\myapp')).toBe(true);
    });

    it('normalizes paths for comparison', () => {
      mockGetConfigValue.mockReturnValue(['C:\\Projects\\MyApp']);
      // Windows paths are case-insensitive
      expect(isWorkspaceTrusted('c:\\projects\\myapp')).toBe(true);
    });
  });

  describe('getWorkspaceTrustLevel', () => {
    it('returns trusted for trusted paths', () => {
      mockGetConfigValue.mockReturnValue(['C:\\Projects\\safe']);
      expect(getWorkspaceTrustLevel('C:\\Projects\\safe')).toBe('trusted');
    });

    it('returns restricted for untrusted paths', () => {
      mockGetConfigValue.mockReturnValue([]);
      expect(getWorkspaceTrustLevel('C:\\Temp\\sketchy')).toBe('restricted');
    });
  });

  describe('trustWorkspace', () => {
    it('adds path to trusted list', () => {
      mockGetConfigValue.mockReturnValue([]);
      trustWorkspace('C:\\Projects\\new');
      expect(mockSetConfigValue).toHaveBeenCalledWith('trustedWorkspaces', ['C:\\Projects\\new']);
    });

    it('does not duplicate existing trusted path', () => {
      mockGetConfigValue.mockReturnValue(['C:\\Projects\\existing']);
      trustWorkspace('C:\\Projects\\existing');
      expect(mockSetConfigValue).not.toHaveBeenCalled();
    });
  });

  describe('untrustWorkspace', () => {
    it('removes path from trusted list', () => {
      mockGetConfigValue.mockReturnValue(['C:\\Projects\\a', 'C:\\Projects\\b']);
      untrustWorkspace('C:\\Projects\\a');
      expect(mockSetConfigValue).toHaveBeenCalledWith('trustedWorkspaces', ['C:\\Projects\\b']);
    });
  });

  describe('getWindowTrustLevel', () => {
    it('returns restricted when no roots provided', () => {
      expect(getWindowTrustLevel([])).toBe('restricted');
    });

    it('returns trusted when all roots are trusted', () => {
      mockGetConfigValue.mockReturnValue(['C:\\A', 'C:\\B']);
      expect(getWindowTrustLevel(['C:\\A', 'C:\\B'])).toBe('trusted');
    });

    it('returns restricted when any root is untrusted', () => {
      mockGetConfigValue.mockReturnValue(['C:\\A']);
      expect(getWindowTrustLevel(['C:\\A', 'C:\\B'])).toBe('restricted');
    });
  });
});
