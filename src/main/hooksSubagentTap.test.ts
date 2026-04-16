/**
 * hooksSubagentTap.test.ts — Unit tests for the subagent tracker hook tap.
 *
 * Tests that tapSubagentTracker routes pre/post Task tool events correctly
 * to the subagent tracker, and ignores unrelated events.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the subagent tracker before importing the tap
const { mockOnTaskToolPreUse, mockRecordEnd } = vi.hoisted(() => ({
  mockOnTaskToolPreUse: vi.fn(),
  mockRecordEnd: vi.fn(),
}));

vi.mock('./agentChat/subagentTracker', () => ({
  onTaskToolPreUse: mockOnTaskToolPreUse,
  recordEnd: mockRecordEnd,
}));

// Mock electron (hooks.ts HookPayload type only — no runtime electron calls)
vi.mock('electron', () => ({
  BrowserWindow: {},
}));

import type { HookPayload } from './hooks';
import { tapSubagentTracker } from './hooksSubagentTap';

function makePayload(overrides: Partial<HookPayload>): HookPayload {
  return {
    type: 'pre_tool_use',
    sessionId: 'session-1',
    timestamp: Date.now(),
    ...overrides,
  } as HookPayload;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tapSubagentTracker', () => {
  describe('non-Task tools', () => {
    it('ignores pre_tool_use for non-Task tools', () => {
      tapSubagentTracker(makePayload({ type: 'pre_tool_use', toolName: 'Edit' }));
      expect(mockOnTaskToolPreUse).not.toHaveBeenCalled();
      expect(mockRecordEnd).not.toHaveBeenCalled();
    });

    it('ignores post_tool_use for non-Task tools', () => {
      tapSubagentTracker(makePayload({ type: 'post_tool_use', toolName: 'Write' }));
      expect(mockRecordEnd).not.toHaveBeenCalled();
    });
  });

  describe('pre_tool_use + Task', () => {
    it('calls onTaskToolPreUse with the full payload', () => {
      const payload = makePayload({
        type: 'pre_tool_use',
        toolName: 'Task',
        input: { description: 'Run tests', childSessionId: 'child-1' },
      });
      tapSubagentTracker(payload);
      expect(mockOnTaskToolPreUse).toHaveBeenCalledWith(payload);
      expect(mockRecordEnd).not.toHaveBeenCalled();
    });
  });

  describe('post_tool_use + Task', () => {
    it('calls recordEnd with completed when childSessionId is present', () => {
      tapSubagentTracker(makePayload({
        type: 'post_tool_use',
        toolName: 'Task',
        input: { childSessionId: 'child-2' },
      }));
      expect(mockRecordEnd).toHaveBeenCalledWith('child-2', 'completed');
    });

    it('does nothing when childSessionId is absent', () => {
      tapSubagentTracker(makePayload({
        type: 'post_tool_use',
        toolName: 'Task',
        input: { description: 'No id here' },
      }));
      expect(mockRecordEnd).not.toHaveBeenCalled();
    });
  });

  describe('post_tool_use_failure + Task', () => {
    it('calls recordEnd with failed when childSessionId is present', () => {
      tapSubagentTracker(makePayload({
        type: 'post_tool_use_failure',
        toolName: 'Task',
        input: { childSessionId: 'child-3' },
      }));
      expect(mockRecordEnd).toHaveBeenCalledWith('child-3', 'failed');
    });
  });

  describe('other event types', () => {
    it('ignores session_start events even for Task toolName', () => {
      tapSubagentTracker(makePayload({ type: 'session_start', toolName: 'Task' }));
      expect(mockOnTaskToolPreUse).not.toHaveBeenCalled();
      expect(mockRecordEnd).not.toHaveBeenCalled();
    });
  });
});
