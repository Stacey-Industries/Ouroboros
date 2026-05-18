/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WindowControls } from './TitleBarWindowControls';

afterEach(cleanup);

// electronAPI.app is not available in jsdom — mock minimally.
const mockApp = {
  getPlatform: vi.fn(),
  minimizeWindow: vi.fn(),
  toggleMaximizeWindow: vi.fn(),
  closeWindow: vi.fn(),
};

describe('WindowControls', () => {
  it('renders nothing when platform is not win32', async () => {
    mockApp.getPlatform.mockResolvedValue('darwin');
    Object.defineProperty(window, 'electronAPI', {
      value: { app: mockApp },
      writable: true,
      configurable: true,
    });

    const { container } = render(<WindowControls />);
    // Effect resolves after first render — container is empty until platform resolves.
    expect(container.firstChild).toBeNull();
  });

  it('renders win32 buttons after platform resolves to win32', async () => {
    mockApp.getPlatform.mockResolvedValue('win32');
    Object.defineProperty(window, 'electronAPI', {
      value: { app: mockApp },
      writable: true,
      configurable: true,
    });

    render(<WindowControls />);

    // Allow the getPlatform promise to resolve.
    await vi.waitFor(() => {
      expect(screen.getByTitle('Minimize')).toBeDefined();
    });

    expect(screen.getByTitle('Maximize')).toBeDefined();
    expect(screen.getByTitle('Close')).toBeDefined();
  });
});
