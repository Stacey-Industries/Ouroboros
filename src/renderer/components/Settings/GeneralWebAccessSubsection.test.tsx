/**
 * GeneralWebAccessSubsection.test.tsx — smoke tests for the web access subsection.
 * @vitest-environment jsdom
 *
 * Tests:
 *  - Component exports a function
 *  - Badge absent when hasWebPassword returns false
 *  - Badge present when hasWebPassword returns true
 */

import { cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockHasWebPassword = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  writable: true,
  value: {
    config: {
      hasWebPassword: mockHasWebPassword,
    },
  },
});

import { WebAccessSubsection } from './GeneralWebAccessSubsection';

const BASE_DRAFT = {
  webAccessPassword: '',
  webAccessPort: 7890,
} as Parameters<typeof WebAccessSubsection>[0]['draft'];

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('WebAccessSubsection', () => {
  it('exports a function component', () => {
    expect(typeof WebAccessSubsection).toBe('function');
  });

  describe('password set badge', () => {
    beforeEach(() => {
      mockHasWebPassword.mockResolvedValue(false);
    });

    it('does not show badge when password is not set', async () => {
      const { container } = render(
        <WebAccessSubsection draft={BASE_DRAFT} onChange={vi.fn()} />,
      );
      await waitFor(() => expect(mockHasWebPassword).toHaveBeenCalled());
      expect(container.textContent).not.toMatch(/password set/i);
    });

    it('shows badge when password is set', async () => {
      mockHasWebPassword.mockResolvedValue(true);
      const { container } = render(
        <WebAccessSubsection draft={BASE_DRAFT} onChange={vi.fn()} />,
      );
      await waitFor(() => {
        expect(container.textContent).toMatch(/password set/i);
      });
    });
  });
});
