/**
 * types.test.ts — runtime shape verification for LayoutPreset types (Wave 17)
 *
 * These tests construct objects that satisfy the TS interfaces at runtime,
 * serving as compile-time smoke tests that all required fields are present
 * and correctly typed.
 */

import { describe, expect, it } from 'vitest';

import type {
  ComponentDescriptor,
  LayoutPreset,
  PanelId,
  ResponsiveRules,
  SlotName,
} from './types';

describe('SlotName', () => {
  it('covers all 6 AppLayoutSlots members', () => {
    const slots: SlotName[] = [
      'sidebarHeader',
      'sidebarContent',
      'editorTabBar',
      'editorContent',
      'agentCards',
      'terminalContent',
    ];
    expect(slots).toHaveLength(6);
    expect(new Set(slots).size).toBe(6);
  });
});

describe('PanelId', () => {
  it('covers the 3 resizable panels', () => {
    const panels: PanelId[] = ['leftSidebar', 'rightSidebar', 'terminal'];
    expect(panels).toHaveLength(3);
  });
});

describe('ComponentDescriptor', () => {
  it('accepts componentKey with no props', () => {
    const d: ComponentDescriptor = { componentKey: 'FileTree' };
    expect(d.componentKey).toBe('FileTree');
    expect(d.props).toBeUndefined();
  });

  it('accepts componentKey with props', () => {
    const d: ComponentDescriptor = { componentKey: 'FileTree', props: { showHidden: true } };
    expect(d.props).toEqual({ showHidden: true });
  });
});

describe('ResponsiveRules', () => {
  it('constructs a valid responsive rule', () => {
    const r: ResponsiveRules = { minWidth: 768, fallbackPresetId: 'mobile-primary' };
    expect(r.minWidth).toBe(768);
    expect(r.fallbackPresetId).toBe('mobile-primary');
  });
});

describe('LayoutPreset', () => {
  it('constructs a minimal preset (empty Partial fields)', () => {
    const preset: LayoutPreset = {
      id: 'test-preset',
      name: 'Test Preset',
      slots: {},
      panelSizes: {},
      visiblePanels: {},
    };
    expect(preset.id).toBe('test-preset');
    expect(preset.breakpoints).toBeUndefined();
  });

  it('constructs a fully-populated preset', () => {
    const preset: LayoutPreset = {
      id: 'ide-primary',
      name: 'IDE Primary',
      slots: {
        sidebarHeader: { componentKey: 'ProjectPicker' },
        editorContent: { componentKey: 'CentrePaneConnected' },
      },
      panelSizes: { leftSidebar: 220, rightSidebar: 300, terminal: 280 },
      visiblePanels: { leftSidebar: true, rightSidebar: true, terminal: true },
      breakpoints: { minWidth: 768, fallbackPresetId: 'mobile-primary' },
    };
    expect(preset.slots.sidebarHeader?.componentKey).toBe('ProjectPicker');
    expect(preset.panelSizes.leftSidebar).toBe(220);
    expect(preset.visiblePanels.terminal).toBe(true);
    expect(preset.breakpoints?.minWidth).toBe(768);
  });
});
