/**
 * componentRegistry.ts — Wave 20 component key → factory map.
 *
 * Presets reference components by opaque string keys (ComponentDescriptor).
 * This registry maps those keys to zero-argument factory functions that return
 * a ReactNode. InnerAppLayout calls getComponent(key) to resolve slot content.
 *
 * Factories are zero-argument to keep presets JSON-serialisable — props are
 * passed via ComponentDescriptor.props where needed (Phase B+).
 *
 * All registrations are lazy imports to avoid circular dependencies between
 * the layout layer and feature components.
 */

import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComponentFactory = () => React.ReactNode;

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, ComponentFactory>();

export function registerComponent(key: string, factory: ComponentFactory): void {
  registry.set(key, factory);
}

export function getComponent(key: string): React.ReactNode {
  const factory = registry.get(key);
  return factory ? factory() : null;
}

export function hasComponent(key: string): boolean {
  return registry.has(key);
}

export function registeredKeys(): string[] {
  return [...registry.keys()];
}

// ─── Default registrations (Wave 20 Phase A) ─────────────────────────────────
//
// Keys must match componentKey values used in presets.ts.
// Factories return null as placeholder; InnerAppLayout.tsx overrides
// slots at render time with fully-wired instances — the registry provides
// fallback resolution for dynamic/future preset consumers.

export function initDefaultRegistry(): void {
  const entries: [string, ComponentFactory][] = [
    ['SessionSidebar', () => null],
    ['AgentChatWorkspace', () => null],
    ['TerminalManager', () => null],
    ['FileViewerManager', () => null],
    ['AgentCards', () => null],
    ['AgentSidebarContent', () => null],
    ['SidebarSections', () => null],
    ['CentrePaneConnected', () => null],
    ['ProjectPicker', () => null],
    ['EditorTabBar', () => null],
  ];

  for (const [key, factory] of entries) {
    registerComponent(key, factory);
  }
}

// Initialise immediately on import.
initDefaultRegistry();
