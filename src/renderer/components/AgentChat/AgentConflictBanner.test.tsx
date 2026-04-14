/**
 * @vitest-environment jsdom
 *
 * AgentConflictBanner.test.tsx — Render, dismiss, and severity token tests.
 */

import type { AgentConflictReport } from '@shared/types/agentConflict';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { afterEach } from 'vitest';

import { AgentConflictBanner } from './AgentConflictBanner';

afterEach(() => cleanup());

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReport(overrides?: Partial<AgentConflictReport>): AgentConflictReport {
  return {
    sessionA: 'sessA',
    sessionB: 'sessB',
    overlappingSymbols: [],
    overlappingFiles: ['src/foo.ts'],
    severity: 'warning',
    updatedAt: Date.now(),
    fileOnly: true,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentConflictBanner', () => {
  it('renders file-level overlap message', () => {
    render(
      <AgentConflictBanner report={makeReport()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/sessB/)).toBeDefined();
    expect(screen.getByText(/src\/foo\.ts/)).toBeDefined();
  });

  it('renders symbol-level overlap message', () => {
    const report = makeReport({
      severity: 'blocking',
      fileOnly: false,
      overlappingSymbols: [
        { id: 'src/foo.ts::fooBar', file: 'src/foo.ts', line: 10, kind: 'function', name: 'fooBar' },
      ],
    });
    render(<AgentConflictBanner report={report} onDismiss={vi.fn()} />);
    expect(screen.getByText(/fooBar/)).toBeDefined();
    expect(screen.getByText(/src\/foo\.ts/)).toBeDefined();
  });

  it('shows +N more when multiple symbols overlap', () => {
    const report = makeReport({
      severity: 'blocking',
      fileOnly: false,
      overlappingSymbols: [
        { id: 'src/foo.ts::fn1', file: 'src/foo.ts', line: 1, kind: 'function', name: 'fn1' },
        { id: 'src/foo.ts::fn2', file: 'src/foo.ts', line: 5, kind: 'function', name: 'fn2' },
        { id: 'src/foo.ts::fn3', file: 'src/foo.ts', line: 9, kind: 'function', name: 'fn3' },
      ],
    });
    render(<AgentConflictBanner report={report} onDismiss={vi.fn()} />);
    expect(screen.getByText(/\+2 more/)).toBeDefined();
  });

  it('calls onDismiss with sessionA and sessionB when Dismiss is clicked', () => {
    const onDismiss = vi.fn();
    render(<AgentConflictBanner report={makeReport()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledWith('sessA', 'sessB');
  });

  it('applies warning severity CSS tokens', () => {
    render(<AgentConflictBanner report={makeReport({ severity: 'warning' })} onDismiss={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-status-warning-subtle');
  });

  it('applies blocking severity CSS tokens', () => {
    render(<AgentConflictBanner report={makeReport({ severity: 'blocking' })} onDismiss={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-status-error-subtle');
  });

  it('applies info severity CSS tokens', () => {
    render(<AgentConflictBanner report={makeReport({ severity: 'info' })} onDismiss={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-surface-inset');
  });

  it('has accessible alert role and aria-live', () => {
    render(<AgentConflictBanner report={makeReport()} onDismiss={vi.fn()} />);
    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('aria-live')).toBe('polite');
  });
});
