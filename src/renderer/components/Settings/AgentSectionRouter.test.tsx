/**
 * AgentSectionRouter.test.tsx — Smoke tests for AgentSectionRouter exports.
 */

import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_ROUTER_SETTINGS, updateRouterThreshold } from './AgentSectionRouter';

describe('DEFAULT_ROUTER_SETTINGS', () => {
  it('has expected default values', () => {
    expect(DEFAULT_ROUTER_SETTINGS.enabled).toBe(true);
    expect(DEFAULT_ROUTER_SETTINGS.layer1Enabled).toBe(true);
    expect(DEFAULT_ROUTER_SETTINGS.layer2Enabled).toBe(true);
    expect(DEFAULT_ROUTER_SETTINGS.layer3Enabled).toBe(true);
    expect(DEFAULT_ROUTER_SETTINGS.layer2ConfidenceThreshold).toBe(0.6);
    expect(DEFAULT_ROUTER_SETTINGS.paranoidMode).toBe(false);
    expect(DEFAULT_ROUTER_SETTINGS.llmJudgeSampleRate).toBe(0);
  });
});

describe('updateRouterThreshold', () => {
  it('calls updateSetting with clamped value', () => {
    const updateSetting = vi.fn();
    updateRouterThreshold('0.75', updateSetting);
    expect(updateSetting).toHaveBeenCalledWith('layer2ConfidenceThreshold', 0.75);
  });

  it('clamps value above 1 to 1', () => {
    const updateSetting = vi.fn();
    updateRouterThreshold('1.5', updateSetting);
    expect(updateSetting).toHaveBeenCalledWith('layer2ConfidenceThreshold', 1);
  });

  it('clamps value below 0 to 0', () => {
    const updateSetting = vi.fn();
    updateRouterThreshold('-0.1', updateSetting);
    expect(updateSetting).toHaveBeenCalledWith('layer2ConfidenceThreshold', 0);
  });

  it('does not call updateSetting for non-finite input', () => {
    const updateSetting = vi.fn();
    updateRouterThreshold('abc', updateSetting);
    expect(updateSetting).not.toHaveBeenCalled();
  });
});
