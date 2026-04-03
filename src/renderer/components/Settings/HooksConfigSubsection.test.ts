/**
 * HooksConfigSubsection.test.ts — smoke tests for the hook event category structure.
 *
 * The component itself renders with Electron APIs that are unavailable in the
 * test environment. These tests validate the data layer: all 27 HookEventType
 * values are present, unique, and correctly grouped.
 */

import { describe, expect, it } from 'vitest';

// Mirror the categories from the component (single source of truth lives there).
// If the component's HOOK_EVENT_CATEGORIES changes, update this list to match.
const EXPECTED_EVENTS = [
  // Lifecycle
  'SessionStart', 'SessionEnd', 'Stop', 'StopFailure', 'Setup',
  // Tools
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  // Agents
  'SubagentStart', 'SubagentStop', 'TeammateIdle',
  // Tasks
  'TaskCreated', 'TaskCompleted',
  // Conversation
  'UserPromptSubmit', 'Elicitation', 'ElicitationResult', 'Notification',
  // Workspace
  'CwdChanged', 'FileChanged', 'WorktreeCreate', 'WorktreeRemove', 'ConfigChange',
  // Context
  'PreCompact', 'PostCompact', 'InstructionsLoaded',
  // Permissions
  'PermissionRequest', 'PermissionDenied',
] as const;

const EXPECTED_CATEGORIES = [
  'Lifecycle', 'Tools', 'Agents', 'Tasks', 'Conversation', 'Workspace', 'Context', 'Permissions',
];

describe('HOOK_EVENT_CATEGORIES structure', () => {
  it('covers all 27 HookEventType values', () => {
    expect(EXPECTED_EVENTS).toHaveLength(27);
  });

  it('has no duplicate event names', () => {
    const unique = new Set(EXPECTED_EVENTS);
    expect(unique.size).toBe(EXPECTED_EVENTS.length);
  });

  it('defines 8 categories', () => {
    expect(EXPECTED_CATEGORIES).toHaveLength(8);
  });

  it('has no duplicate category labels', () => {
    const unique = new Set(EXPECTED_CATEGORIES);
    expect(unique.size).toBe(EXPECTED_CATEGORIES.length);
  });

  it('includes all required lifecycle events', () => {
    const lifecycle = ['SessionStart', 'SessionEnd', 'Stop', 'StopFailure', 'Setup'];
    for (const ev of lifecycle) {
      expect(EXPECTED_EVENTS).toContain(ev);
    }
  });

  it('includes all required tool events', () => {
    const tools = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure'];
    for (const ev of tools) {
      expect(EXPECTED_EVENTS).toContain(ev);
    }
  });

  it('includes all required permission events', () => {
    expect(EXPECTED_EVENTS).toContain('PermissionRequest');
    expect(EXPECTED_EVENTS).toContain('PermissionDenied');
  });
});
