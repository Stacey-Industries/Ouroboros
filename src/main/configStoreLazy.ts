import Store from 'electron-store';

import type { AppConfig } from './config';
import { resolveUserDataDir, runConfigPreflight } from './configPreflight';
import { schema } from './configSchema';

/**
 * Lazy electron-store singleton.
 *
 * Constructing Store eagerly at module load time was a problem for
 * worker_threads / utility-process bundles that import config transitively but
 * never call into the store: they would crash on schema validation against the
 * persisted config before getting a chance to run. Defer construction until
 * first access so those subprocesses no longer pay the validation cost simply
 * for importing types/helpers from the config module.
 */
let storeInstance: Store<AppConfig> | null = null;

export function ensureStore(): Store<AppConfig> {
  if (!storeInstance) {
    storeInstance = constructWithRetry();
  }
  return storeInstance;
}

/**
 * Worker subprocesses (contextWorker, indexingWorker) can race the main
 * process here: main may be mid-write of an unrelated config field at the
 * moment the worker reads the file, and electron-store sees a transiently
 * invalid shape. Run preflight, attempt construction, and on a schema-shaped
 * error retry once after re-running preflight to coerce the file back to a
 * valid shape.
 */
function constructWithRetry(): Store<AppConfig> {
  runConfigPreflight();
  // Pin cwd explicitly: in main, electron-store would resolve to
  // `app.getPath('userData')` on its own, but in worker subprocesses it
  // falls back to env-paths under `electron-store-nodejs/Config/` (an
  // unrelated directory belonging to no app), reading whatever stale data
  // happens to live there. Force every process to share the same file.
  const cwd = resolveUserDataDir() ?? undefined;
  const options: ConstructorParameters<typeof Store<AppConfig>>[0] = {
    schema: schema as import('electron-store').Schema<AppConfig>,
    ...(cwd ? { cwd } : {}),
  };
  try {
    return new Store<AppConfig>(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('Config schema violation')) throw err;
    runConfigPreflight();
    return new Store<AppConfig>(options);
  }
}

export const lazyStore = new Proxy({} as Store<AppConfig>, {
  get(_target, prop, receiver) {
    const target = ensureStore();
    const value = Reflect.get(target, prop, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(ensureStore(), prop, value, receiver);
  },
  has(_target, prop) {
    return Reflect.has(ensureStore(), prop);
  },
});
