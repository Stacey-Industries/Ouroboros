/**
 * CompareProvidersOutputPane.test.tsx — Wave 36 Phase F
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { CompareProvidersOutputPane } from './CompareProvidersOutputPane';

afterEach(cleanup);

describe('CompareProvidersOutputPane', () => {
  it('renders provider label', () => {
    render(
      <CompareProvidersOutputPane
        providerId="claude"
        label="Claude"
        text=""
        status="idle"
        cost={null}
        completedAt={null}
      />,
    );
    expect(screen.getByText('Claude')).toBeTruthy();
  });

  it('renders streamed text as it arrives', () => {
    render(
      <CompareProvidersOutputPane
        providerId="codex"
        label="Codex"
        text="Hello from Codex"
        status="streaming"
        cost={null}
        completedAt={null}
      />,
    );
    expect(screen.getByText(/Hello from Codex/)).toBeTruthy();
  });

  it('shows streaming status badge while streaming', () => {
    render(
      <CompareProvidersOutputPane
        providerId="claude"
        label="Claude"
        text="..."
        status="streaming"
        cost={null}
        completedAt={null}
      />,
    );
    expect(screen.getByText(/streaming/i)).toBeTruthy();
  });

  it('shows completed status badge when done', () => {
    render(
      <CompareProvidersOutputPane
        providerId="claude"
        label="Claude"
        text="Done output"
        status="completed"
        cost={null}
        completedAt={Date.now()}
      />,
    );
    expect(screen.getByText(/completed/i)).toBeTruthy();
  });

  it('shows error status badge on error', () => {
    render(
      <CompareProvidersOutputPane
        providerId="gemini"
        label="Gemini"
        text=""
        status="error"
        cost={null}
        completedAt={null}
      />,
    );
    expect(screen.getByText(/error/i)).toBeTruthy();
  });

  it('renders cost when provided', () => {
    render(
      <CompareProvidersOutputPane
        providerId="claude"
        label="Claude"
        text="text"
        status="completed"
        cost={0.042}
        completedAt={null}
      />,
    );
    expect(screen.getByText(/0\.04/)).toBeTruthy();
  });
});
