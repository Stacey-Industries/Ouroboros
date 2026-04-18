/**
 * electron-mobile-access.d.ts — IPC type contract for the mobileAccess namespace.
 *
 * Wave 33a Phase B. Types mirror src/main/mobileAccess/types.ts — duplicated
 * here because renderer types cannot import from src/main at runtime.
 *
 * TODO(Wave 33a): Move QrPayload + PairedDevice to src/shared/ once the shared
 * types directory is expanded to support renderer-safe cross-boundary imports.
 */

/** Payload encoded in the QR code shown during the pairing flow. */
export interface QrPayload {
  v: 1;
  host: string;
  port: number;
  code: string;
  fingerprint: string;
}

/**
 * A mobile device that has completed the pairing flow.
 * refreshTokenHash is deliberately excluded — never sent to the renderer.
 */
export interface PairedDeviceInfo {
  id: string;
  label: string;
  fingerprint: string;
  capabilities: string[];
  issuedAt: string;
  lastSeenAt: string;
}

export interface GeneratePairingCodeResult {
  success: boolean;
  code?: string;
  expiresAt?: number;
  qrPayload?: QrPayload;
  /** Deep-link URL encoding the same payload — scannable in any QR reader app. */
  qrPairingUrl?: string;
  error?: string;
}

export interface ListPairedDevicesResult {
  success: boolean;
  devices?: PairedDeviceInfo[];
  error?: string;
}

export interface RevokePairedDeviceResult {
  success: boolean;
  error?: string;
}

/** Per-class timeout counters. Diagnostic only — resets on process restart. */
export interface TimeoutStatsResult {
  success: boolean;
  stats?: { short: number; normal: number; long: number };
  error?: string;
}

/** Args for Wave 34 Phase F push token registration. */
export interface RegisterPushTokenArgs {
  deviceId: string;
  token: string;
  platform: 'android' | 'ios';
}

export interface RegisterPushTokenResult {
  success: boolean;
  error?: string;
}

export interface MobileAccessAPI {
  generatePairingCode(): Promise<GeneratePairingCodeResult>;
  listPairedDevices(): Promise<ListPairedDevicesResult>;
  revokePairedDevice(deviceId: string): Promise<RevokePairedDeviceResult>;
  /** Diagnostic: returns timeout counts per class since process start. */
  getTimeoutStats(): Promise<TimeoutStatsResult>;
  /**
   * Wave 34 Phase F — registers a device push token for dispatch notifications.
   * Called by the mobile app after pairing succeeds and a native push token arrives.
   */
  registerPushToken(args: RegisterPushTokenArgs): Promise<RegisterPushTokenResult>;
}
