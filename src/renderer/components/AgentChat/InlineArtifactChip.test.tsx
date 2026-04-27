/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OPEN_FILE_EVENT } from '../../hooks/appEventNames';
import type { AgentChatContentBlock } from '../../types/electron';
import { extractHtmlArtifactPaths, InlineArtifactChipBar } from './InlineArtifactChip';

afterEach(cleanup);

// ── extractHtmlArtifactPaths ──────────────────────────────────────────────────

describe('extractHtmlArtifactPaths', () => {
  it('returns empty array when no blocks', () => {
    expect(extractHtmlArtifactPaths([])).toEqual([]);
  });

  it('returns empty array for non-html tool_use blocks', () => {
    const blocks: AgentChatContentBlock[] = [
      { kind: 'tool_use', tool: 'Write', status: 'complete', filePath: 'src/main.ts' },
      { kind: 'tool_use', tool: 'Read', status: 'complete', filePath: 'dashboard.html' },
    ];
    expect(extractHtmlArtifactPaths(blocks)).toEqual([]);
  });

  it('captures .html files written by modifying tools', () => {
    const blocks: AgentChatContentBlock[] = [
      { kind: 'tool_use', tool: 'Write', status: 'complete', filePath: '/project/dashboard.html' },
      { kind: 'tool_use', tool: 'Edit', status: 'complete', filePath: '/project/report.html' },
    ];
    expect(extractHtmlArtifactPaths(blocks)).toEqual([
      '/project/dashboard.html',
      '/project/report.html',
    ]);
  });

  it('captures .htm extension', () => {
    const blocks: AgentChatContentBlock[] = [
      { kind: 'tool_use', tool: 'write_file', status: 'complete', filePath: 'index.htm' },
    ];
    expect(extractHtmlArtifactPaths(blocks)).toEqual(['index.htm']);
  });

  it('deduplicates the same path written multiple times', () => {
    const blocks: AgentChatContentBlock[] = [
      { kind: 'tool_use', tool: 'Write', status: 'complete', filePath: '/out/page.html' },
      { kind: 'tool_use', tool: 'Edit', status: 'complete', filePath: '/out/page.html' },
    ];
    expect(extractHtmlArtifactPaths(blocks)).toEqual(['/out/page.html']);
  });

  it('skips running/error status blocks', () => {
    const blocks: AgentChatContentBlock[] = [
      { kind: 'tool_use', tool: 'Write', status: 'running', filePath: 'index.html' },
      { kind: 'tool_use', tool: 'Write', status: 'error', filePath: 'other.html' },
    ];
    expect(extractHtmlArtifactPaths(blocks)).toEqual([]);
  });

  it('ignores text and other non-tool_use block kinds', () => {
    const blocks: AgentChatContentBlock[] = [
      { kind: 'text', content: 'Created dashboard.html' },
      { kind: 'tool_use', tool: 'Write', status: 'complete', filePath: 'dashboard.html' },
    ];
    expect(extractHtmlArtifactPaths(blocks)).toEqual(['dashboard.html']);
  });
});

// ── InlineArtifactChipBar ─────────────────────────────────────────────────────

describe('InlineArtifactChipBar', () => {
  it('renders null when there are no HTML artifact blocks', () => {
    const { container } = render(
      <InlineArtifactChipBar blocks={[]} isStreaming={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders null while streaming even if blocks have HTML paths', () => {
    const blocks: AgentChatContentBlock[] = [
      { kind: 'tool_use', tool: 'Write', status: 'complete', filePath: 'index.html' },
    ];
    const { container } = render(
      <InlineArtifactChipBar blocks={blocks} isStreaming={true} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders a chip for each distinct HTML file when not streaming', () => {
    const blocks: AgentChatContentBlock[] = [
      { kind: 'tool_use', tool: 'Write', status: 'complete', filePath: '/out/dashboard.html' },
      { kind: 'tool_use', tool: 'Edit', status: 'complete', filePath: '/out/report.html' },
    ];
    render(<InlineArtifactChipBar blocks={blocks} isStreaming={false} />);
    expect(screen.getByLabelText('Open dashboard.html in preview')).toBeTruthy();
    expect(screen.getByLabelText('Open report.html in preview')).toBeTruthy();
  });

  it('dispatches OPEN_FILE_EVENT with the file path on click', () => {
    const blocks: AgentChatContentBlock[] = [
      { kind: 'tool_use', tool: 'Write', status: 'complete', filePath: '/proj/page.html' },
    ];
    const listener = vi.fn();
    window.addEventListener(OPEN_FILE_EVENT, listener);
    render(<InlineArtifactChipBar blocks={blocks} isStreaming={false} />);
    fireEvent.click(screen.getByLabelText('Open page.html in preview'));
    expect(listener).toHaveBeenCalledOnce();
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail.filePath).toBe('/proj/page.html');
    window.removeEventListener(OPEN_FILE_EVENT, listener);
  });
});
