/**
 * presets.test.ts — built-in preset contract verification (Wave 17)
 */

import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_PRESETS,
  chatPrimaryPreset,
  idePrimaryPreset,
  mobilePrimaryPreset,
  resolveBuiltInPreset,
} from './presets';
import type { SlotName } from './types';

const ALL_SLOTS: SlotName[] = [
  'sidebarHeader',
  'sidebarContent',
  'editorTabBar',
  'editorContent',
  'agentCards',
  'terminalContent',
];

describe('BUILT_IN_PRESETS', () => {
  it('contains exactly 3 presets', () => {
    expect(BUILT_IN_PRESETS).toHaveLength(3);
  });

  it('ide-primary is first (the default)', () => {
    expect(BUILT_IN_PRESETS[0].id).toBe('ide-primary');
  });

  it('all presets have required id and name fields', () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(typeof preset.id).toBe('string');
      expect(preset.id.length).toBeGreaterThan(0);
      expect(typeof preset.name).toBe('string');
      expect(preset.name.length).toBeGreaterThan(0);
    }
  });

  it('all preset ids are unique', () => {
    const ids = BUILT_IN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('idePrimaryPreset', () => {
  it('has id "ide-primary"', () => {
    expect(idePrimaryPreset.id).toBe('ide-primary');
  });

  it('populates all 6 slots', () => {
    for (const slot of ALL_SLOTS) {
      expect(idePrimaryPreset.slots[slot]).toBeDefined();
      expect(typeof idePrimaryPreset.slots[slot]?.componentKey).toBe('string');
    }
  });

  it('has default panel sizes matching useResizable defaults', () => {
    expect(idePrimaryPreset.panelSizes.leftSidebar).toBe(220);
    expect(idePrimaryPreset.panelSizes.rightSidebar).toBe(300);
    expect(idePrimaryPreset.panelSizes.terminal).toBe(280);
  });

  it('has all panels visible', () => {
    expect(idePrimaryPreset.visiblePanels.leftSidebar).toBe(true);
    expect(idePrimaryPreset.visiblePanels.rightSidebar).toBe(true);
    expect(idePrimaryPreset.visiblePanels.terminal).toBe(true);
  });

  it('has no responsive breakpoints (desktop-only)', () => {
    expect(idePrimaryPreset.breakpoints).toBeUndefined();
  });
});

describe('chatPrimaryPreset', () => {
  it('has id "chat-primary"', () => {
    expect(chatPrimaryPreset.id).toBe('chat-primary');
  });

  it('is a scaffold — slots are empty pending Wave 20', () => {
    expect(Object.keys(chatPrimaryPreset.slots)).toHaveLength(0);
  });
});

describe('mobilePrimaryPreset', () => {
  it('has id "mobile-primary"', () => {
    expect(mobilePrimaryPreset.id).toBe('mobile-primary');
  });

  it('is a scaffold — slots are empty pending Wave 32', () => {
    expect(Object.keys(mobilePrimaryPreset.slots)).toHaveLength(0);
  });
});

describe('resolveBuiltInPreset', () => {
  it('returns idePrimaryPreset for undefined', () => {
    expect(resolveBuiltInPreset(undefined)).toBe(idePrimaryPreset);
  });

  it('returns idePrimaryPreset for empty string', () => {
    expect(resolveBuiltInPreset('')).toBe(idePrimaryPreset);
  });

  it('returns idePrimaryPreset for unknown id', () => {
    expect(resolveBuiltInPreset('nonexistent-preset')).toBe(idePrimaryPreset);
  });

  it('resolves ide-primary by id', () => {
    expect(resolveBuiltInPreset('ide-primary')).toBe(idePrimaryPreset);
  });

  it('resolves chat-primary by id', () => {
    expect(resolveBuiltInPreset('chat-primary')).toBe(chatPrimaryPreset);
  });

  it('resolves mobile-primary by id', () => {
    expect(resolveBuiltInPreset('mobile-primary')).toBe(mobilePrimaryPreset);
  });
});
