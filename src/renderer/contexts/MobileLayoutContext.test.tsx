/**
 * @vitest-environment jsdom
 *
 * MobileLayoutContext — unit tests for Wave 32 Phase D.
 */

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { MobileLayoutProvider, useMobileLayout } from './MobileLayoutContext';

afterEach(() => cleanup());

describe('MobileLayoutProvider', () => {
  it('renders children without error', () => {
    render(
      <MobileLayoutProvider>
        <span>child</span>
      </MobileLayoutProvider>,
    );
    expect(screen.getByText('child')).toBeDefined();
  });

  it('provides default activePanel of "chat"', () => {
    const { result, unmount } = renderHook(() => useMobileLayout(), {
      wrapper: MobileLayoutProvider,
    });
    expect(result.current.activePanel).toBe('chat');
    unmount();
  });

  it('setActivePanel propagates updated value to consumers', () => {
    const { result, unmount } = renderHook(() => useMobileLayout(), {
      wrapper: MobileLayoutProvider,
    });
    act(() => { result.current.setActivePanel('terminal'); });
    expect(result.current.activePanel).toBe('terminal');
    unmount();
  });

  it('value updates propagate to all consumers in the tree', () => {
    function Consumer(): React.ReactElement {
      const { activePanel } = useMobileLayout();
      return <span data-testid="panel">{activePanel}</span>;
    }
    function Trigger(): React.ReactElement {
      const { setActivePanel } = useMobileLayout();
      return (
        <button onClick={() => setActivePanel('files')}>switch</button>
      );
    }

    render(
      <MobileLayoutProvider>
        <Consumer />
        <Trigger />
      </MobileLayoutProvider>,
    );

    expect(screen.getByTestId('panel').textContent).toBe('chat');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('panel').textContent).toBe('files');
  });
});

describe('useMobileLayout outside provider', () => {
  it('throws with a descriptive message', () => {
    // Suppress React's console.error for the expected throw
    const consoleError = console.error;
    console.error = (): void => undefined;
    expect(() =>
      renderHook(() => useMobileLayout()),
    ).toThrow('useMobileLayout must be used inside <MobileLayoutProvider>');
    console.error = consoleError;
  });
});
