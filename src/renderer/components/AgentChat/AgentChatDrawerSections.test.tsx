/**
 * AgentChatDrawerSections.test.tsx — Smoke tests for extracted drawer section components.
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ContextSection, ResultSection, VerificationSection } from './AgentChatDrawerSections';

// Minimal mocks for sub-components used inside the sections
vi.mock('./AgentChatDetailsSummary', () => ({
  DrawerSection: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid={`drawer-section-${title.toLowerCase()}`}>
      <span>{title}</span>
      {children}
    </div>
  ),
  DrawerTextBlock: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MetadataGrid: ({ rows }: { rows: Array<{ label: string; value: string | null }> }) => (
    <dl>
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  ),
}));

vi.mock('./agentChatDetailsSupport', () => ({
  buildResultRows: (result: { status: string }) => [{ label: 'Status', value: result.status }],
}));

// ── ContextSection ─────────────────────────────────────────────────────────────

describe('ContextSection', () => {
  it('returns null when no contextPacket', () => {
    const { container } = render(
      <ContextSection details={{ success: true, session: null, result: null, link: null }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders budget text and file list', () => {
    const details = {
      success: true,
      result: null,
      link: null,
      session: {
        contextPacket: {
          files: [{ filePath: 'src/foo.ts', reasons: [{ detail: 'imported' }] }],
          omittedCandidates: [],
          budget: { estimatedTokens: 1200 },
        },
      },
    };
    render(<ContextSection details={details as never} />);
    expect(screen.getByText(/1 files/)).toBeTruthy();
    expect(screen.getByText('src/foo.ts')).toBeTruthy();
  });
});

// ── VerificationSection ────────────────────────────────────────────────────────

describe('VerificationSection', () => {
  it('returns null when no verification summary', () => {
    const { container } = render(
      <VerificationSection details={{ success: true, session: null, result: null, link: null }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders verification profile and status', () => {
    const details = {
      success: true,
      link: null,
      session: null,
      result: {
        verificationSummary: {
          profile: 'default',
          status: 'passed',
          summary: 'All checks passed.',
          commandResults: [],
        },
      },
    };
    render(<VerificationSection details={details as never} />);
    expect(screen.getByText('default • passed')).toBeTruthy();
  });
});

// ── ResultSection ──────────────────────────────────────────────────────────────

describe('ResultSection', () => {
  it('returns null when no result', () => {
    const { container } = render(
      <ResultSection details={{ success: true, session: null, result: null, link: null }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders result metadata', () => {
    const details = {
      success: true,
      link: null,
      session: null,
      result: {
        status: 'complete',
        message: 'Done.',
        unresolvedIssues: [],
        diffSummary: null,
      },
    };
    render(<ResultSection details={details as never} />);
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('complete')).toBeTruthy();
  });
});
