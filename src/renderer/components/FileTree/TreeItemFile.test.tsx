// @vitest-environment jsdom
/**
 * TreeItemFile.test.tsx — smoke tests for TreeItemFile.
 */

import { cleanup,render } from '@testing-library/react';
import React from 'react';
import { afterEach,describe, expect, it, vi } from 'vitest';

import type { TreeNode } from './FileTreeItem';
import { TreeItemFile } from './TreeItemFile';

afterEach(cleanup);

// FileTypeIcon uses IPC — stub it out. Don't render filename as text;
// it would collide with HighlightedName's text in getByText queries.
vi.mock('./FileTypeIcon', () => ({
  FileTypeIcon: ({ filename }: { filename: string }) => <span data-testid="icon" data-filename={filename} />,
}));

// InlineEditInput depends on DOM focus — stub for unit tests
vi.mock('./InlineEditInput', () => ({
  InlineEditInput: ({ initialValue }: { initialValue: string }) => (
    <input defaultValue={initialValue} />
  ),
}));

const BASE_NODE: TreeNode = {
  name: 'foo.ts',
  path: '/project/foo.ts',
  relativePath: 'foo.ts',
  isDirectory: false,
  depth: 0,
  isExpanded: false,
  isLoading: false,
};

describe('TreeItemFile', () => {
  it('renders file icon and name when not editing', () => {
    const { getByText } = render(
      <TreeItemFile node={BASE_NODE} isEditing={false} />,
    );
    expect(getByText('foo.ts')).toBeTruthy();
  });

  it('renders InlineEditInput when editing', () => {
    const { container } = render(
      <TreeItemFile
        node={BASE_NODE}
        isEditing={true}
        editValue="foo.ts"
        onEditConfirm={vi.fn()}
        onEditCancel={vi.fn()}
      />,
    );
    expect(container.querySelector('input')).toBeTruthy();
  });

  it('renders status badge when statusLbl provided', () => {
    const { getByText } = render(
      <TreeItemFile node={BASE_NODE} isEditing={false} statusLbl="M" />,
    );
    expect(getByText('M')).toBeTruthy();
  });

  it('does not render FileMeta while editing', () => {
    const { queryByText } = render(
      <TreeItemFile
        node={BASE_NODE}
        isEditing={true}
        statusLbl="M"
        onEditConfirm={vi.fn()}
        onEditCancel={vi.fn()}
      />,
    );
    // StatusBadge should NOT render when isEditing=true
    expect(queryByText('M')).toBeNull();
  });

  it('renders nest chevron for nodes with nested children', () => {
    const node: TreeNode = { ...BASE_NODE, hasNestedChildren: true, isNestExpanded: false };
    const { container } = render(<TreeItemFile node={node} isEditing={false} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
