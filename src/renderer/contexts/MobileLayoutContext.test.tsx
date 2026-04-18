/**
 * @vitest-environment jsdom
 *
 * MobileLayoutContext — unit tests for Wave 32 Phase D + Phase F.
 */

import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { MobileLayoutProvider, useMobileLayout } from './MobileLayoutContext';

afterEach(() => cleanup());

// ── Phase D: activePanel ──────────────────────────────────────────────────────

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
      return <button onClick={() => setActivePanel('files')}>switch</button>;
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

// ── Phase F: drawer state ─────────────────────────────────────────────────────

describe('MobileLayoutProvider — drawer state', () => {
  it('isDrawerOpen defaults to false', () => {
    const { result, unmount } = renderHook(() => useMobileLayout(), {
      wrapper: MobileLayoutProvider,
    });
    expect(result.current.isDrawerOpen).toBe(false);
    unmount();
  });

  it('openDrawer sets isDrawerOpen to true', () => {
    const { result, unmount } = renderHook(() => useMobileLayout(), {
      wrapper: MobileLayoutProvider,
    });
    act(() => { result.current.openDrawer(); });
    expect(result.current.isDrawerOpen).toBe(true);
    unmount();
  });

  it('closeDrawer sets isDrawerOpen to false after open', () => {
    const { result, unmount } = renderHook(() => useMobileLayout(), {
      wrapper: MobileLayoutProvider,
    });
    act(() => { result.current.openDrawer(); });
    act(() => { result.current.closeDrawer(); });
    expect(result.current.isDrawerOpen).toBe(false);
    unmount();
  });
});

// ── Phase F: sheet state ──────────────────────────────────────────────────────

describe('MobileLayoutProvider — sheet state', () => {
  it('isSheetOpen defaults to false', () => {
    const { result, unmount } = renderHook(() => useMobileLayout(), {
      wrapper: MobileLayoutProvider,
    });
    expect(result.current.isSheetOpen).toBe(false);
    unmount();
  });

  it('activeSheetView defaults to null', () => {
    const { result, unmount } = renderHook(() => useMobileLayout(), {
      wrapper: MobileLayoutProvider,
    });
    expect(result.current.activeSheetView).toBeNull();
    unmount();
  });

  it('openSheet sets isSheetOpen to true', () => {
    const { result, unmount } = renderHook(() => useMobileLayout(), {
      wrapper: MobileLayoutProvider,
    });
    act(() => { result.current.openSheet(); });
    expect(result.current.isSheetOpen).toBe(true);
    unmount();
  });

  it('openSheet with a viewKey sets activeSheetView', () => {
    const { result, unmount } = renderHook(() => useMobileLayout(), {
      wrapper: MobileLayoutProvider,
    });
    act(() => { result.current.openSheet('monitor'); });
    expect(result.current.activeSheetView).toBe('monitor');
    unmount();
  });

  it('closeSheet resets isSheetOpen and activeSheetView', () => {
    const { result, unmount } = renderHook(() => useMobileLayout(), {
      wrapper: MobileLayoutProvider,
    });
    act(() => { result.current.openSheet('git'); });
    act(() => { result.current.closeSheet(); });
    expect(result.current.isSheetOpen).toBe(false);
    expect(result.current.activeSheetView).toBeNull();
    unmount();
  });
});

// ── Outside provider ──────────────────────────────────────────────────────────

describe('useMobileLayout outside provider', () => {
  it('throws with a descriptive message', () => {
    const consoleError = console.error;
    console.error = (): void => undefined;
    expect(() =>
      renderHook(() => useMobileLayout()),
    ).toThrow('useMobileLayout must be used inside <MobileLayoutProvider>');
    console.error = consoleError;
  });
});
