/**
 * fcmAdapter.ts — FCM push notification sender. Wave 34 Phase F.
 *
 * Decision: `firebase-admin` (~50 MB) is NOT installed — it violates the
 * constraint. `google-auth-library` and `jsonwebtoken` are also absent from
 * package.json. Node's built-in `https` + `crypto` are sufficient for the
 * OAuth 2.0 JWT flow needed to call FCM v1, but that implementation requires
 * a service-account JSON and non-trivial JWT signing.
 *
 * Current status: STUB — returns { sent: false, reason: 'no-fcm-backend' }.
 *
 * To wire FCM in a future wave:
 *  1. Install `google-auth-library` (it IS already a peer dep of some packages
 *     in the tree, but is not directly depended on):
 *       npm install --save google-auth-library
 *  2. Replace the stub body of `sendFcmNotification` with the implementation
 *     in the block comment below (`FCM_IMPL_REFERENCE`).
 *  3. Add `sessionDispatch.fcmServiceAccountPath: string` to the config schema
 *     and `AppConfig` in electron-foundation.d.ts.
 *  4. Update `sessionDispatchNotifier.ts` to pass the configured path.
 *
 * FCM_IMPL_REFERENCE (not active — kept as documentation):
 * ```ts
 * import { GoogleAuth } from 'google-auth-library';
 * import https from 'https';
 *
 * const auth = new GoogleAuth({
 *   keyFile: serviceAccountPath,
 *   scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
 * });
 * const client = await auth.getClient();
 * const { token } = await client.getAccessToken();
 * const projectId = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8')).project_id;
 * const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
 * // POST to url with Authorization: Bearer <token>
 * // body: { message: { token, notification: { title, body }, data } }
 * ```
 */

import log from '../logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FcmPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface FcmResult {
  sent: boolean;
  error?: string;
  reason?: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sends an FCM push notification to the given device token.
 *
 * Currently a documented stub — always returns { sent: false, reason: 'no-fcm-backend' }.
 * See module-level comment for the wiring guide.
 *
 * @param serviceAccountPath - Path to the Firebase service account JSON file.
 * @param token              - FCM device registration token (NEVER logged raw).
 * @param payload            - Notification title, body, and optional data map.
 */
export async function sendFcmNotification(
  serviceAccountPath: string,
  token: string,
  payload: FcmPayload,
): Promise<FcmResult> {
  // Log intent without exposing the raw token.
  log.info(
    '[fcmAdapter] stub — would send to token hash prefix',
    token.slice(0, 8) + '…',
    'via', serviceAccountPath,
    'title:', payload.title,
  );
  return { sent: false, reason: 'no-fcm-backend' };
}
