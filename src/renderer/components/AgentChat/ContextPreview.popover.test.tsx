/**
 * @vitest-environment jsdom
 *
 * ContextPreview.popover — smoke tests for ContextPreviewPopover render path.
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContextPreviewModel } from '../../hooks/useContextPreview';
import { ContextPreviewPopover, TABS } from './ContextPreview.popover';

afterEach(() => cleanup());

function makeModel(overrides: Partial<ContextPreviewModel> = {}): ContextPreviewModel {
  return {
    items: [],
    totals: {
      totalTokens: 0,
      ruleCount: 0,
      skillCount: 0,
      memoryCount: 0,
      fileCount: 0,
      mentionCount: 0,
      toolCount: 0,
      systemCount: 0,
    },
    ...overrides,
  } as unknown as ContextPreviewModel;
}

describe('ContextPreviewPopover', () => {
  it('renders dialog role with all tabs', () => {
    render(
      <ContextPreviewPopover
        model={makeModel()}
        onClose={() => undefined}
        disabledIds={new Set()}
      />,
    );
    expect(screen.getByRole('dialog', { name: /context preview/i })).toBeDefined();
    for (const tab of TABS) {
      expect(screen.getAllByText(tab.label).length).toBeGreaterThan(0);
    }
  });

  it('renders empty-state copy when active tab has no items', () => {
    render(
      <ContextPreviewPopover
        model={makeModel()}
        onClose={() => undefined}
        disabledIds={new Set()}
      />,
    );
    expect(screen.getByText(/no rules loaded/i)).toBeDefined();
  });

  it('shows total tokens in header', () => {
    render(
      <ContextPreviewPopover
        model={makeModel({
          totals: {
            totalTokens: 1234,
            ruleCount: 0,
            skillCount: 0,
            memoryCount: 0,
            fileCount: 0,
            mentionCount: 0,
            toolCount: 0,
            systemCount: 0,
          } as unknown as ContextPreviewModel['totals'],
        })}
        onClose={() => undefined}
        disabledIds={new Set()}
      />,
    );
    expect(screen.getByText(/~1234 est. tokens/)).toBeDefined();
  });

  it('fires onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<ContextPreviewPopover model={makeModel()} onClose={onClose} disabledIds={new Set()} />);
    const closeBtn = screen.getByRole('button', { name: /close context preview/i });
    closeBtn.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
