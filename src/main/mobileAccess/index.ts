/**
 * index.ts — Public façade for the mobileAccess module.
 *
 * Other modules import from here, not from the sub-files directly.
 * Wave 33a Phase A — data model + storage only; no IPC wiring.
 */

export {
  cleanupExpired,
  issueTicket,
  verifyAndConsume,
} from './pairingTickets';
export {
  addDevice,
  findByTokenHash,
  hashToken,
  listDevices,
  removeDevice,
  updateLastSeen,
} from './tokenStore';
export type { Capability, PairedDevice, PairingTicket, QrPayload, TimeoutClass } from './types';
