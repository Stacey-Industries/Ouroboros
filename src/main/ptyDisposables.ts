/**
 * ptyDisposables.ts — node-pty IDisposable lifecycle helpers.
 *
 * node-pty's `onData`/`onExit` return `IDisposable`s that MUST be disposed
 * when the session ends. On Windows conpty each subscription pins the
 * worker-thread + conout-socket + in/out pipe handles; leaking them walks
 * the process toward EMFILE over a long session. Matches VS Code's
 * `terminalProcess.ts` `_register` pattern (inlined as a data array since
 * our spawn sites are module-level functions, not Disposable classes).
 */

import type * as pty from 'node-pty';

/** Dispose every entry, swallowing errors (emitter may already be gone). */
export function disposeAll(list: pty.IDisposable[] | undefined): void {
  if (!list) return;
  for (const d of list) {
    try {
      d.dispose();
    } catch {
      /* already disposed or emitter gone */
    }
  }
  list.length = 0;
}
