/**
 * @vitest-environment jsdom
 *
 * useSystemBack.test.ts
 *
 * Verifies the Android back-button handler priority:
 *   1. Drawer open → closeDrawer()
 *   2. Sheet open → closeSheet()
 *   3. Non-home panel → setActivePanel() cycles back
 *   4. Home panel (chat) → first press: exit toast; second press: App.exitApp()
 *   5. No-op on web (isNative() === false)
 */

import { renderHook } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── @capacitor/app mock ──────────────────────────────────────────────────────
// vi.hoisted() so variables are initialised before vi.mock factories run.

type BackHandler = () => void;
let capturedBackHandler: BackHandler | null = null;

const { mockAddListener, mockExitApp } = vi.hoisted(() => {
  const addListener = vi.fn().mockImplementation((_event: string, handler: BackHandler) => {
    capturedBackHandler = handler;
    return Promise.resolve({ remove: vi.fn() });
  });
  return { mockAddListener: addListener, mockExitApp: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('@capacitor/app', () => ({
  App: { addListener: mockAddListener, exitApp: mockExitApp },
}));

// ─── capacitor bridge mock ────────────────────────────────────────────────────

const { mockIsNative } = vi.hoisted(() => ({ mockIsNative: vi.fn() }));

vi.mock('../../web/capacitor', () => ({
  isNative: mockIsNative,
}));

// ─── MobileLayoutContext mock ─────────────────────────────────────────────────

const { mockSetActivePanel, mockCloseDrawer, mockCloseSheet } = vi.hoisted(() => ({
  mockSetActivePanel: vi.fn(),
  mockCloseDrawer: vi.fn(),
  mockCloseSheet: vi.fn(),
}));

let contextValue = {
  activePanel: 'chat' as import('../components/Layout/AppLayout.mobile').MobilePanel,
  setActivePanel: mockSetActivePanel,
  isDrawerOpen: false,
  closeDrawer: mockCloseDrawer,
  isSheetOpen: false,
  closeSheet: mockCloseSheet,
  openDrawer: vi.fn(),
  openSheet: vi.fn(),
  activeSheetView: null as string | null,
};

vi.mock('../contexts/MobileLayoutContext', () => ({
  useMobileLayout: () => contextValue,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { useSystemBack } from './useSystemBack';

// ─── Helper ───────────────────────────────────────────────────────────────────

function fireBack(): void {
  if (!capturedBackHandler) throw new Error('backButton listener not registered');
  capturedBackHandler();
}

function renderBack() {
  return renderHook(() => useSystemBack(), {
    wrapper: ({ children }) => React.createElement(React.Fragment, null, children),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useSystemBack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedBackHandler = null;
    contextValue = {
      activePanel: 'chat',
      setActivePanel: mockSetActivePanel,
      isDrawerOpen: false,
      closeDrawer: mockCloseDrawer,
      isSheetOpen: false,
      closeSheet: mockCloseSheet,
      openDrawer: vi.fn(),
      openSheet: vi.fn(),
      activeSheetView: null,
    };
  });

  it('is a no-op on web — does not register listener', () => {
    mockIsNative.mockReturnValue(false);
    renderBack();
    expect(mockAddListener).not.toHaveBeenCalled();
  });

  it('registers backButton listener on native', () => {
    mockIsNative.mockReturnValue(true);
    renderBack();
    expect(mockAddListener).toHaveBeenCalledWith('backButton', expect.any(Function));
  });

  it('priority 1: closes drawer when drawer is open', () => {
    mockIsNative.mockReturnValue(true);
    contextValue.isDrawerOpen = true;
    contextValue.activePanel = 'files';
    renderBack();
    fireBack();
    expect(mockCloseDrawer).toHaveBeenCalledOnce();
    expect(mockSetActivePanel).not.toHaveBeenCalled();
  });

  it('priority 2: closes sheet when sheet is open', () => {
    mockIsNative.mockReturnValue(true);
    contextValue.isSheetOpen = true;
    contextValue.activePanel = 'editor';
    renderBack();
    fireBack();
    expect(mockCloseSheet).toHaveBeenCalledOnce();
    expect(mockSetActivePanel).not.toHaveBeenCalled();
  });

  it('priority 3: cycles terminal → editor', () => {
    mockIsNative.mockReturnValue(true);
    contextValue.activePanel = 'terminal';
    renderBack();
    fireBack();
    expect(mockSetActivePanel).toHaveBeenCalledWith('editor');
  });

  it('priority 3: cycles editor → files', () => {
    mockIsNative.mockReturnValue(true);
    contextValue.activePanel = 'editor';
    renderBack();
    fireBack();
    expect(mockSetActivePanel).toHaveBeenCalledWith('files');
  });

  it('priority 3: cycles files → chat', () => {
    mockIsNative.mockReturnValue(true);
    contextValue.activePanel = 'files';
    renderBack();
    fireBack();
    expect(mockSetActivePanel).toHaveBeenCalledWith('chat');
  });

  it('priority 4: first back on chat shows toast, does not exit', () => {
    mockIsNative.mockReturnValue(true);
    contextValue.activePanel = 'chat';
    renderBack();
    fireBack();
    expect(mockExitApp).not.toHaveBeenCalled();
    expect(document.getElementById('system-back-exit-toast')).not.toBeNull();
  });

  it('priority 4: second back on chat calls App.exitApp()', () => {
    mockIsNative.mockReturnValue(true);
    contextValue.activePanel = 'chat';
    renderBack();
    fireBack(); // first press — toast
    fireBack(); // second press — exit
    expect(mockExitApp).toHaveBeenCalledOnce();
  });
});
