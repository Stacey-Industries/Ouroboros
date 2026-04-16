/**
 * ToolToggles.test.tsx — Unit tests for ToolToggles (Wave 26 Phase D).
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '../../types/electron';
import { ALL_KNOWN_TOOLS, TOOL_GROUPS, ToolToggles } from './ToolToggles';

// ─── Mock electronAPI ─────────────────────────────────────────────────────────

const mockSetToolOverrides = vi.fn().mockResolvedValue({ success: true });

beforeEach(() => {
  // Assign directly to avoid replacing the window object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electronAPI = { sessionCrud: { setToolOverrides: mockSetToolOverrides } };
  mockSetToolOverrides.mockClear();
});

afterEach(() => {
  cleanup();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).electronAPI;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProfile(enabledTools?: string[]): Profile {
  return {
    id: 'p1',
    name: 'Test',
    createdAt: 0,
    updatedAt: 0,
    enabledTools,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ToolToggles — tool groups rendered', () => {
  it('renders all group labels', () => {
    render(
      <ToolToggles sessionId="s1" onChange={() => undefined} />,
    );
    for (const group of TOOL_GROUPS) {
      // Use exact match to avoid 'Search' matching 'WebSearch' as well.
      expect(screen.getAllByText(group.label, { exact: true }).length).toBeGreaterThan(0);
    }
  });

  it('renders a checkbox for every known tool', () => {
    render(
      <ToolToggles sessionId="s1" onChange={() => undefined} />,
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(ALL_KNOWN_TOOLS.length);
  });
});

describe('ToolToggles — initial state from toolOverrides', () => {
  it('checks only overridden tools when toolOverrides is provided', () => {
    render(
      <ToolToggles
        sessionId="s1"
        toolOverrides={['Read', 'Grep']}
        onChange={() => undefined}
      />,
    );
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    const checked = checkboxes.filter((c) => c.checked).map((c) => c.closest('label')?.textContent?.trim());
    expect(checked).toContain('Read');
    expect(checked).toContain('Grep');
    // Bash should be unchecked
    const bashLabel = screen.getByText('Bash').closest('label');
    const bashCb = bashLabel?.querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(bashCb?.checked).toBe(false);
  });

  it('uses profile enabledTools when no toolOverrides present', () => {
    const profile = makeProfile(['Write', 'Edit']);
    render(
      <ToolToggles sessionId="s1" profile={profile} onChange={() => undefined} />,
    );
    const writeCb = screen.getByText('Write').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    const readCb = screen.getByText('Read').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    expect(writeCb?.checked).toBe(true);
    expect(readCb?.checked).toBe(false);
  });

  it('enables all tools when neither toolOverrides nor profile.enabledTools is set', () => {
    render(
      <ToolToggles sessionId="s1" onChange={() => undefined} />,
    );
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes.every((c) => c.checked)).toBe(true);
  });
});

describe('ToolToggles — toggle behaviour', () => {
  it('calls setToolOverrides and onChange when a tool is toggled off', async () => {
    const onChange = vi.fn();
    render(
      <ToolToggles
        sessionId="s1"
        toolOverrides={['Read', 'Bash']}
        onChange={onChange}
      />,
    );
    const readCb = screen.getByText('Read').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    fireEvent.click(readCb);
    expect(onChange).toHaveBeenCalledWith(['Bash']);
    expect(mockSetToolOverrides).toHaveBeenCalledWith('s1', ['Bash']);
  });

  it('adds a tool when toggled on', () => {
    const onChange = vi.fn();
    render(
      <ToolToggles
        sessionId="s1"
        toolOverrides={['Read']}
        onChange={onChange}
      />,
    );
    const bashCb = screen.getByText('Bash').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    fireEvent.click(bashCb);
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(['Read', 'Bash']));
    expect(mockSetToolOverrides).toHaveBeenCalledWith(
      's1',
      expect.arrayContaining(['Read', 'Bash']),
    );
  });

  it('passes the correct sessionId to setToolOverrides', () => {
    render(
      <ToolToggles
        sessionId="my-session-42"
        toolOverrides={['Grep']}
        onChange={() => undefined}
      />,
    );
    const grepCb = screen.getByText('Grep').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    fireEvent.click(grepCb);
    expect(mockSetToolOverrides).toHaveBeenCalledWith('my-session-42', []);
  });
});

describe('ToolToggles — re-sync on prop change', () => {
  it('updates checkboxes when toolOverrides prop changes', () => {
    const { rerender } = render(
      <ToolToggles sessionId="s1" toolOverrides={['Read']} onChange={() => undefined} />,
    );
    rerender(
      <ToolToggles sessionId="s1" toolOverrides={['Bash', 'Grep']} onChange={() => undefined} />,
    );
    const bashCb = screen.getByText('Bash').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    const readCb = screen.getByText('Read').closest('label')
      ?.querySelector('input') as HTMLInputElement;
    expect(bashCb?.checked).toBe(true);
    expect(readCb?.checked).toBe(false);
  });
});
