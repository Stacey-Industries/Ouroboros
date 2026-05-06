/**
 * @vitest-environment jsdom
 *
 * ArtifactHistoryList.test.tsx — Wave 82 Phase G smoke coverage.
 *
 * Asserts the rewritten Recent section: horizontal flex layout (chips wrap),
 * pane close affordance moved into the header, returns null when empty.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArtifactHistoryList } from './ArtifactHistoryList';
import type { ArtifactHistoryEntry } from './useArtifactHistoryStack';

function makeEntry(id: string, title: string): ArtifactHistoryEntry {
  return {
    key: `file:${id}`,
    kind: 'file',
    title,
    subtitle: 'Editor',
    filePath: `/${id}.ts`,
  };
}

describe('ArtifactHistoryList (Wave 82)', () => {
  afterEach(() => {
    cleanup();
  });

  it('returns null when items is empty', () => {
    const { container } = render(
      <ArtifactHistoryList items={[]} activeKey={null} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders chips horizontally (flex-wrap, not flex-col)', () => {
    const items = [makeEntry('a', 'a.ts'), makeEntry('b', 'b.ts')];
    render(<ArtifactHistoryList items={items} activeKey="file:a" onSelect={vi.fn()} />);
    const list = screen.getByTestId('artifact-history-list');
    // Chips container should use flex-wrap
    const chipsContainer = list.querySelector('.flex.flex-wrap');
    expect(chipsContainer).not.toBeNull();
  });

  it('marks the active chip via data-artifact-key + interactive class', () => {
    const items = [makeEntry('a', 'a.ts'), makeEntry('b', 'b.ts')];
    render(<ArtifactHistoryList items={items} activeKey="file:b" onSelect={vi.fn()} />);
    const chips = screen.getAllByTestId('artifact-history-item');
    expect(chips).toHaveLength(2);
    const active = chips.find((c) => c.getAttribute('data-artifact-key') === 'file:b');
    expect(active?.className).toContain('interactive-selection');
  });

  it('invokes onSelect with the clicked entry', () => {
    const items = [makeEntry('a', 'a.ts')];
    const onSelect = vi.fn();
    render(<ArtifactHistoryList items={items} activeKey={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('artifact-history-item'));
    expect(onSelect).toHaveBeenCalledWith(items[0]);
  });

  it('does not render the pane-close affordance — that lives in ArtifactPaneCloseStrip', () => {
    const items = [makeEntry('a', 'a.ts')];
    render(<ArtifactHistoryList items={items} activeKey={null} onSelect={vi.fn()} />);
    expect(screen.queryByTestId('chat-workbench-artifact-close')).toBeNull();
  });
});
