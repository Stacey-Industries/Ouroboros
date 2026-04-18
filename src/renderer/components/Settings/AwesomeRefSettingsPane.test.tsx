/**
 * @vitest-environment jsdom
 *
 * AwesomeRefSettingsPane.test.tsx — Smoke tests for the settings entry pane.
 *
 * Wave 37 Phase E.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OPEN_AWESOME_REF_EVENT } from '../../hooks/appEventNames';
import { AwesomeRefSettingsPane } from './AwesomeRefSettingsPane';

afterEach(() => cleanup());

describe('AwesomeRefSettingsPane', () => {
  it('renders the section heading', () => {
    render(<AwesomeRefSettingsPane />);
    expect(screen.getByText('Awesome Ouroboros')).toBeTruthy();
  });

  it('renders the open button', () => {
    render(<AwesomeRefSettingsPane />);
    // Use getAllByRole to handle the heading and button both containing the label text
    const buttons = screen.getAllByRole('button');
    const openBtn = buttons.find((b) => /open awesome ouroboros/i.test(b.textContent ?? ''));
    expect(openBtn).toBeTruthy();
  });

  it('dispatches OPEN_AWESOME_REF_EVENT when button is clicked', () => {
    render(<AwesomeRefSettingsPane />);
    const listener = vi.fn();
    window.addEventListener(OPEN_AWESOME_REF_EVENT, listener);

    const buttons = screen.getAllByRole('button');
    const openBtn = buttons.find((b) => /open awesome ouroboros/i.test(b.textContent ?? ''));
    expect(openBtn).toBeTruthy();
    fireEvent.click(openBtn!);

    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(OPEN_AWESOME_REF_EVENT, listener);
  });

  it('lists all five category names in the description area', () => {
    render(<AwesomeRefSettingsPane />);
    // getAllByText tolerates multiple nodes; we just need at least one match each
    expect(screen.getAllByText(/Hooks/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Slash commands/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/MCP configs/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rules/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Skills/).length).toBeGreaterThan(0);
  });

  it('renders a description paragraph', () => {
    render(<AwesomeRefSettingsPane />);
    // The paragraph text is split across children — match via container text content
    const { container } = render(<AwesomeRefSettingsPane />);
    expect(container.textContent).toContain('hand-curated collection');
  });
});
