/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  type ArtifactHistoryEntry,
  resetArtifactHistoryStackForTests,
  useArtifactHistoryStack,
} from './useArtifactHistoryStack';

function makeFileEntry(filePath: string): ArtifactHistoryEntry {
  return {
    key: `file:${filePath}`,
    kind: 'file',
    title: filePath.split('/').pop() ?? filePath,
    subtitle: 'Editor',
    filePath,
  };
}

describe('useArtifactHistoryStack', () => {
  afterEach(() => {
    resetArtifactHistoryStackForTests();
  });

  it('dedupes observed artifacts and keeps the most recent first', () => {
    const { result, rerender } = renderHook(
      ({
        sessionKey,
        observedArtifact,
      }: {
        sessionKey: string;
        observedArtifact: ArtifactHistoryEntry | null;
      }) => useArtifactHistoryStack({ sessionKey, observedArtifact }),
      {
        initialProps: { sessionKey: 'session-a', observedArtifact: makeFileEntry('/tmp/a.ts') },
      },
    );

    expect(result.current.history.map((entry) => entry.key)).toEqual(['file:/tmp/a.ts']);

    rerender({ sessionKey: 'session-a', observedArtifact: makeFileEntry('/tmp/b.ts') });
    expect(result.current.history.map((entry) => entry.key)).toEqual([
      'file:/tmp/b.ts',
      'file:/tmp/a.ts',
    ]);

    rerender({ sessionKey: 'session-a', observedArtifact: makeFileEntry('/tmp/a.ts') });
    expect(result.current.history.map((entry) => entry.key)).toEqual([
      'file:/tmp/a.ts',
      'file:/tmp/b.ts',
    ]);
  });

  it('keeps history isolated per session key', () => {
    renderHook(() =>
      useArtifactHistoryStack({
        sessionKey: 'session-a',
        observedArtifact: makeFileEntry('/tmp/a.ts'),
      }),
    );

    const { result } = renderHook(() =>
      useArtifactHistoryStack({
        sessionKey: 'session-b',
        observedArtifact: null,
      }),
    );

    expect(result.current.history).toEqual([]);
  });

  it('tracks explicit selection by artifact key', () => {
    const { result } = renderHook(() =>
      useArtifactHistoryStack({
        sessionKey: 'session-a',
        observedArtifact: makeFileEntry('/tmp/a.ts'),
      }),
    );

    act(() => {
      result.current.selectArtifact('file:/tmp/a.ts');
    });
    expect(result.current.selectedKey).toBe('file:/tmp/a.ts');
    expect(result.current.selectedArtifact?.key).toBe('file:/tmp/a.ts');
  });
});
