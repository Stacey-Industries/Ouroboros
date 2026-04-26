import { describe, expect, it } from 'vitest';

import type { ApprovalRequest } from '../../../types/electron';
import type { AgentSession } from '../../AgentMonitor/types';
import type { WorkbenchTimelineEntry } from './useWorkbenchTimeline';
import {
  appendApprovalEntries,
  appendReviewEntry,
  approvalPreview,
  completionTone,
  dedupeSessions,
  deriveSessionLabel,
  formatDuration,
  normalizeText,
  toneForStatus,
} from './useWorkbenchTimeline.helpers';

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'session-1',
    taskLabel: 'Build feature',
    status: 'complete',
    startedAt: 1_000,
    completedAt: 9_000,
    toolCalls: [],
    inputTokens: 0,
    outputTokens: 0,
    ...overrides,
  };
}

describe('normalizeText', () => {
  it('collapses whitespace', () => {
    expect(normalizeText('foo   bar\n  baz')).toBe('foo bar baz');
  });

  it('truncates to maxLength with ellipsis', () => {
    const long = 'a'.repeat(130);
    const result = normalizeText(long, 120);
    expect(result.length).toBe(123);
    expect(result.endsWith('...')).toBe(true);
  });

  it('returns short strings unchanged', () => {
    expect(normalizeText('hello', 120)).toBe('hello');
  });
});

describe('formatDuration', () => {
  it('formats seconds only', () => {
    expect(formatDuration(0, 45_000)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(0, 125_000)).toBe('2m 5s');
  });

  it('formats hours, minutes, seconds', () => {
    expect(formatDuration(0, 3_661_000)).toBe('1h 1m 1s');
  });

  it('clamps negative delta to 0s', () => {
    expect(formatDuration(1_000, 500)).toBe('0s');
  });
});

describe('toneForStatus', () => {
  it('maps error → error', () => {
    expect(toneForStatus('error')).toBe('error');
  });

  it('maps pending → warning', () => {
    expect(toneForStatus('pending')).toBe('warning');
  });

  it('maps success → success', () => {
    expect(toneForStatus('success')).toBe('success');
  });
});

describe('completionTone', () => {
  it('maps error → error', () => {
    expect(completionTone('error')).toBe('error');
  });

  it('maps complete → success', () => {
    expect(completionTone('complete')).toBe('success');
  });

  it('maps running → neutral', () => {
    expect(completionTone('running')).toBe('neutral');
  });
});

describe('approvalPreview', () => {
  it('extracts Bash command', () => {
    const req: ApprovalRequest = {
      requestId: 'r1',
      toolName: 'Bash',
      toolInput: { command: 'npm test' },
      sessionId: 's1',
      timestamp: 1_000,
    };
    expect(approvalPreview(req)).toBe('npm test');
  });

  it('extracts file_path for non-Bash tools', () => {
    const req: ApprovalRequest = {
      requestId: 'r2',
      toolName: 'Write',
      toolInput: { file_path: '/src/index.ts', content: '...' },
      sessionId: 's1',
      timestamp: 1_000,
    };
    expect(approvalPreview(req)).toBe('/src/index.ts');
  });
});

describe('dedupeSessions', () => {
  it('removes duplicate session ids keeping first occurrence', () => {
    const a = makeSession({ id: 'a', startedAt: 1_000 });
    const b = makeSession({ id: 'b', startedAt: 2_000 });
    const aDup = makeSession({ id: 'a', startedAt: 1_000, taskLabel: 'duplicate' });
    const result = dedupeSessions([a, b, aDup]);
    expect(result.map((s) => s.id)).toEqual(['a', 'b']);
    expect(result[0].taskLabel).toBe('Build feature');
  });

  it('sorts by startedAt ascending then id lexicographic', () => {
    const b = makeSession({ id: 'b', startedAt: 2_000 });
    const a = makeSession({ id: 'a', startedAt: 1_000 });
    expect(dedupeSessions([b, a]).map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('deriveSessionLabel', () => {
  it('returns taskLabel when present', () => {
    expect(deriveSessionLabel(makeSession({ taskLabel: 'My Task' }))).toBe('My Task');
  });

  it('falls back to truncated id', () => {
    const s = makeSession({ taskLabel: '', id: 'abcdef1234567890' });
    expect(deriveSessionLabel(s)).toBe('Session abcdef12');
  });
});

describe('appendApprovalEntries', () => {
  it('pushes one entry per request with warning tone', () => {
    const entries: WorkbenchTimelineEntry[] = [];
    const req: ApprovalRequest = {
      requestId: 'req-1',
      toolName: 'Bash',
      toolInput: { command: 'rm -rf /' },
      sessionId: 's1',
      timestamp: 5_000,
    };
    appendApprovalEntries([req], entries);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('approval');
    expect(entries[0].tone).toBe('warning');
    expect(entries[0].detail).toContain('rm -rf /');
  });
});

describe('appendReviewEntry', () => {
  it('pushes nothing for null state', () => {
    const entries: WorkbenchTimelineEntry[] = [];
    appendReviewEntry(null, entries, 1_000);
    expect(entries).toHaveLength(0);
  });

  it('pushes a warning entry when pending hunks exist', () => {
    const entries: WorkbenchTimelineEntry[] = [];
    appendReviewEntry(
      {
        sessionId: 's1',
        snapshotHash: 'snap-1',
        projectRoot: '/root',
        files: [
          {
            filePath: '/root/a.ts',
            relativePath: 'a.ts',
            status: 'modified',
            hunks: [
              {
                id: 'h1',
                header: '@@',
                oldStart: 1,
                oldCount: 1,
                newStart: 1,
                newCount: 1,
                lines: ['+x'],
                rawPatch: '@@',
                decision: 'pending',
              },
            ],
          },
        ],
        loading: false,
        error: null,
        lastAcceptedBatch: null,
        staleFiles: [],
        stalePendingOp: null,
      },
      entries,
      9_000,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('review');
    expect(entries[0].tone).toBe('warning');
  });
});
