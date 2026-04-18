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

export interface MobileAccessAPI {
  generatePairingCode(): Promise<GeneratePairingCodeResult>;
  listPairedDevices(): Promise<ListPairedDevicesResult>;
  revokePairedDevice(deviceId: string): Promise<RevokePairedDeviceResult>;
}
