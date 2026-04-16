/**
 * approvalManagerHelpers.test.ts — Unit tests for approval broadcast + timeout helpers.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// NOTE: vi.mock factories are hoisted to the top of the file by vitest.
// Variables declared with `const` outside the factory are NOT accessible inside it.
// All mock implementations must be expressed as inline vi.fn() calls inside the factory,
// then retrieved via vi.mocked() in the test body.

let _configStore: Record<string, unknown> = {};

vi.mock('./approvalManager', () => ({
  // Only the ApprovalRequest type is needed at runtime — no runtime values imported
}));

vi.mock('./config', () => ({
  // eslint-disable-next-line security/detect-object-injection -- test mock; key is 'approvalTimeout' only
  getConfigValue: vi.fn((key: string) => _configStore[key]),
}));

vi.mock('./windowManager', () => ({
  getAllActiveWindows: vi.fn(),
}));

vi.mock('./web/webServer', () => ({
  broadcastToWebClients: vi.fn(),
}));

// ─── Mock accessors (retrieved after hoisting) ────────────────────────────────

import { broadcastToWebClients } from './web/webServer';
import { getAllActiveWindows } from './windowManager';

const mockGetAllActiveWindows = vi.mocked(getAllActiveWindows);
const mockBroadcastToWebClients = vi.mocked(broadcastToWebClients);

// ─── Window factory ───────────────────────────────────────────────────────────

const mockSend = vi.fn();
const mockFlashFrame = vi.fn();

function makeWindow(opts: { destroyed?: boolean; focused?: boolean } = {}): object {
  return {
    isDestroyed: vi.fn(() => opts.destroyed ?? false),
    isFocused: vi.fn(() => opts.focused ?? false),
    webContents: { mainFrame: { send: mockSend } },
    flashFrame: mockFlashFrame,
  };
}

// ─── Import SUT after mocks ───────────────────────────────────────────────────

import {
  broadcastApprovalRequest,
  scheduleAutoApproveTimeout,
} from './approvalManagerHelpers';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<{ requestId: string; toolName: string }> = {}) {
  return {
    requestId: 'req-1',
    toolName: 'Bash',
    toolInput: { command: 'npm test' },
    sessionId: 'session-1',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ─── broadcastApprovalRequest ─────────────────────────────────────────────────

describe('broadcastApprovalRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllActiveWindows.mockReturnValue([makeWindow()]);
  });

  it('sends approval:request to active window mainFrame', () => {
    const req = makeRequest();
    broadcastApprovalRequest(req);
    expect(mockSend).toHaveBeenCalledWith('approval:request', req);
  });

  it('broadcasts to web clients', () => {
    const req = makeRequest();
    broadcastApprovalRequest(req);
    expect(mockBroadcastToWebClients).toHaveBeenCalledWith('approval:request', req);
  });

  it('flashes taskbar when window is not focused', () => {
    mockGetAllActiveWindows.mockReturnValue([makeWindow({ focused: false })]);
    broadcastApprovalRequest(makeRequest());
    expect(mockFlashFrame).toHaveBeenCalledWith(true);
  });

  it('does not flash taskbar when window is focused', () => {
    mockGetAllActiveWindows.mockReturnValue([makeWindow({ focused: true })]);
    broadcastApprovalRequest(makeRequest());
    expect(mockFlashFrame).not.toHaveBeenCalled();
  });

  it('skips destroyed windows without throwing', () => {
    mockGetAllActiveWindows.mockReturnValue([makeWindow({ destroyed: true })]);
    expect(() => broadcastApprovalRequest(makeRequest())).not.toThrow();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('handles send() throwing (disposed frame) without crashing', () => {
    mockSend.mockImplementationOnce(() => {
      throw new Error('frame disposed');
    });
    expect(() => broadcastApprovalRequest(makeRequest())).not.toThrow();
  });

  it('handles empty window list gracefully', () => {
    mockGetAllActiveWindows.mockReturnValue([]);
    expect(() => broadcastApprovalRequest(makeRequest())).not.toThrow();
    expect(mockBroadcastToWebClients).toHaveBeenCalledOnce();
  });
});

// ─── scheduleAutoApproveTimeout ───────────────────────────────────────────────

describe('scheduleAutoApproveTimeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    _configStore = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when approvalTimeout is 0', () => {
    _configStore['approvalTimeout'] = 0;
    const respond = vi.fn().mockResolvedValue(true);
    const timer = scheduleAutoApproveTimeout(makeRequest(), () => false, respond);
    expect(timer).toBeNull();
  });

  it('returns null when approvalTimeout is undefined', () => {
    _configStore['approvalTimeout'] = undefined;
    const respond = vi.fn().mockResolvedValue(true);
    const timer = scheduleAutoApproveTimeout(makeRequest(), () => false, respond);
    expect(timer).toBeNull();
  });

  it('returns a timer when approvalTimeout > 0', () => {
    _configStore['approvalTimeout'] = 30;
    const respond = vi.fn().mockResolvedValue(true);
    const timer = scheduleAutoApproveTimeout(makeRequest(), () => true, respond);
    expect(timer).not.toBeNull();
    clearTimeout(timer!);
  });

  it('calls respond with approve after the timeout elapses', () => {
    _configStore['approvalTimeout'] = 5;
    const respond = vi.fn().mockResolvedValue(true);
    const req = makeRequest();

    scheduleAutoApproveTimeout(req, () => true, respond);
    vi.advanceTimersByTime(5000);

    expect(respond).toHaveBeenCalledWith('req-1', {
      decision: 'approve',
      reason: 'auto-approved (timeout)',
    });
  });

  it('does NOT call respond if the request is no longer pending', () => {
    _configStore['approvalTimeout'] = 5;
    const respond = vi.fn().mockResolvedValue(true);

    scheduleAutoApproveTimeout(makeRequest(), () => false, respond);
    vi.advanceTimersByTime(5000);

    expect(respond).not.toHaveBeenCalled();
  });

  it('fires at the configured interval (not earlier)', () => {
    _configStore['approvalTimeout'] = 10;
    const respond = vi.fn().mockResolvedValue(true);

    scheduleAutoApproveTimeout(makeRequest(), () => true, respond);
    vi.advanceTimersByTime(9999);
    expect(respond).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(respond).toHaveBeenCalledOnce();
  });
});
