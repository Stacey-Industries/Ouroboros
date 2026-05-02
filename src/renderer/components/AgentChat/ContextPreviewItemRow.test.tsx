/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ItemRow, isToggleableItem } from './ContextPreviewItemRow';

const base = { enabled: true, estimatedTokens: 5 };

afterEach(() => cleanup());

describe('isToggleableItem', () => {
  it('returns true for file items', () => {
    expect(isToggleableItem({ ...base, id: 'file:/foo/bar.ts', kind: 'file', label: 'bar.ts' })).toBe(true);
  });

  it('returns true for toggleable rule (global scope)', () => {
    expect(isToggleableItem({ ...base, id: 'rule:global:debug', kind: 'rule', label: 'debug' })).toBe(true);
  });

  it('returns false for managed rule (legacy path form)', () => {
    expect(isToggleableItem({ ...base, id: 'rule:/some/path.md', kind: 'rule', label: 'path' })).toBe(false);
  });

  it('returns false for memory items', () => {
    expect(isToggleableItem({ ...base, id: 'memory:foo', kind: 'memory', label: 'foo' })).toBe(false);
  });
});

describe('ItemRow', () => {
  it('renders label and token estimate', () => {
    render(
      <ItemRow
        item={{ ...base, id: 'file:/a/b.ts', kind: 'file', label: 'b.ts' }}
        disabled={false}
      />,
    );
    expect(screen.getByText('b.ts')).toBeTruthy();
    expect(screen.getByText('~5')).toBeTruthy();
  });

  it('renders a checked checkbox for enabled toggleable item', () => {
    render(
      <ItemRow
        item={{ ...base, id: 'file:/a/b.ts', kind: 'file', label: 'b.ts' }}
        disabled={false}
      />,
    );
    const cb = screen.getByRole('checkbox') as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it('renders an unchecked checkbox when disabled', () => {
    render(
      <ItemRow
        item={{ ...base, id: 'file:/a/b.ts', kind: 'file', label: 'b.ts' }}
        disabled={true}
      />,
    );
    const cb = screen.getByRole('checkbox') as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  it('calls onToggle with item id on checkbox change', () => {
    const onToggle = vi.fn();
    render(
      <ItemRow
        item={{ ...base, id: 'file:/a/b.ts', kind: 'file', label: 'b.ts' }}
        disabled={false}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith('file:/a/b.ts');
  });

  it('renders managed badge for non-toggleable item', () => {
    render(
      <ItemRow
        item={{ ...base, id: 'rule:/path/to.md', kind: 'rule', label: 'to' }}
        disabled={false}
      />,
    );
    expect(screen.getByTitle(/Managed by Claude CLI/)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('renders disabled badge when serverDisabled is true', () => {
    render(
      <ItemRow
        item={{ ...base, id: 'tool:mcp:myserver', kind: 'tool', label: 'myserver', serverDisabled: true }}
        disabled={false}
      />,
    );
    expect(screen.getByTitle(/MCP server is disabled/)).toBeTruthy();
  });
});
