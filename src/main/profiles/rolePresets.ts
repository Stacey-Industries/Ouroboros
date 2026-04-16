/**
 * rolePresets.ts — Built-in profile role presets for Wave 26.
 *
 * These four profiles are always available regardless of user configuration.
 * They have `builtIn: true` and cannot be deleted.
 */

import type { Profile } from '@shared/types/profile';

export const BUILT_IN_PROFILES: Profile[] = [
  {
    id: 'builtin-reviewer',
    name: 'Reviewer',
    description: 'Code review — read-only, high effort, plan mode.',
    model: 'claude-opus-4-6',
    effort: 'high',
    permissionMode: 'plan',
    enabledTools: ['Read', 'Grep', 'Glob'],
    systemPromptAddendum:
      'Focus on code review. Identify risks, suggest improvements, and do not modify files.',
    builtIn: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-scaffolder',
    name: 'Scaffolder',
    description: 'Generate new code quickly with idiomatic patterns.',
    model: 'claude-sonnet-4-6',
    effort: 'medium',
    permissionMode: 'normal',
    enabledTools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Task'],
    systemPromptAddendum:
      'Generate new code quickly. Prefer idiomatic patterns and cover common edge cases.',
    builtIn: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-explorer',
    name: 'Explorer',
    description: 'Answer questions and explore the codebase without modifying files.',
    model: 'claude-sonnet-4-6',
    effort: 'low',
    permissionMode: 'normal',
    enabledTools: ['Read', 'Grep', 'Glob', 'WebSearch'],
    systemPromptAddendum:
      'Answer questions and explore the codebase. Do not modify files unless explicitly asked.',
    builtIn: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-debugger',
    name: 'Debugger',
    description: 'Diagnose issues, reproduce bugs, and write regression tests.',
    model: 'claude-opus-4-6',
    effort: 'high',
    permissionMode: 'normal',
    enabledTools: ['Read', 'Edit', 'Bash', 'Grep', 'Glob'],
    systemPromptAddendum:
      'Diagnose issues before modifying. Reproduce the bug and write a regression test when possible.',
    builtIn: true,
    createdAt: 0,
    updatedAt: 0,
  },
];
