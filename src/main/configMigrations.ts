/**
 * configMigrations.ts — one-shot config migrations applied before first cache read.
 *
 * Each migration is idempotent: it checks for the presence of a legacy key before
 * acting, so re-running on a migrated config is a no-op.
 */

import { ensureStore } from './configStoreLazy';

function omitKey(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
}

/**
 * Wave 43 Phase A — layout.chatPrimary → layout.immersiveChat.
 *
 * If `layout.chatPrimary === true` is present in the stored config, flip to
 * `layout.immersiveChat = true` and remove the legacy key. On fresh installs
 * the key is absent and this is a no-op. On subsequent loads after migration
 * the key is gone, so this is also a no-op.
 */
export function migrateChatPrimary(): void {
  const s = ensureStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = s.get('layout') as any;
  if (!raw || raw.chatPrimary !== true) return;
  s.set('layout', {
    ...omitKey(raw as Record<string, unknown>, 'chatPrimary'),
    immersiveChat: true,
  });
}
