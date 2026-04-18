/**
 * index.ts — Public façade for the mobileAccess module.
 *
 * Other modules import from here, not from the sub-files directly.
 * Wave 33a Phase A — data model + storage only.
 * Wave 33a Phase B — pairing handlers + consumePairingTicket.
 */

export {
  disconnectDevice,
} from './bridgeDisconnectStub';
export {
  cleanupPairingHandlers,
  consumePairingTicket,
  registerPairingHandlers,
} from './pairingHandlers';
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
