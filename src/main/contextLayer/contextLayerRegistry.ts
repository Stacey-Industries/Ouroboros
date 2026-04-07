/**
 * contextLayerRegistry.ts — Per-root context layer registry.
 *
 * Keyed by normalized project root (Zed model). Ref-counted by windows.
 * Two windows on the same root share one instance; disposing happens at
 * ref-count zero.
 */

import log from '../logger';
import type { RepoIndexSnapshot } from '../orchestration/repoIndexer';
import type {
  ContextLayerController,
  InitContextLayerOptions,
} from './contextLayerControllerTypes';
import type { ContextLayerConfig } from './contextLayerTypes';

// The impl class is created lazily via the factory to avoid circular deps.
type ControllerFactory = (options: InitContextLayerOptions) => ContextLayerController & {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
};

interface RegistryEntry {
  controller: ContextLayerController & { dispose(): Promise<void> };
  refCount: number;
}

const registry = new Map<string, RegistryEntry>();
let defaultRoot: string | null = null;
let factory: ControllerFactory | null = null;

// Shared options captured from the first initContextLayer() call.
let sharedBuildRepoIndex: ((roots: string[]) => Promise<RepoIndexSnapshot>) | null = null;
let sharedConfig: ContextLayerConfig | null = null;

function normalizeRoot(root: string): string {
  return root.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** Must be called once at module load to provide the impl factory. */
export function setControllerFactory(f: ControllerFactory): void {
  factory = f;
}

/** Remove a disposed controller from the registry. Called by dispose(). */
export function unregisterController(root: string, controller: ContextLayerController): void {
  const key = normalizeRoot(root);
  if (registry.get(key)?.controller === controller) {
    registry.delete(key);
    if (defaultRoot === key) defaultRoot = null;
  }
}

export async function initContextLayer(options: InitContextLayerOptions): Promise<void> {
  sharedBuildRepoIndex = options.buildRepoIndex;
  sharedConfig = options.config;

  const root = normalizeRoot(options.workspaceRoot);
  defaultRoot = root;

  const existing = registry.get(root);
  if (existing) {
    await existing.controller.dispose();
    registry.delete(root);
  }

  if (!factory) throw new Error('setControllerFactory not called');
  const impl = factory(options);
  registry.set(root, { controller: impl, refCount: 1 });
  await impl.initialize();
}

export async function acquireContextLayer(root: string): Promise<ContextLayerController | null> {
  if (!sharedBuildRepoIndex || !sharedConfig || !factory) {
    log.warn('[context-layer] acquireContextLayer before init');
    return null;
  }

  const key = normalizeRoot(root);
  const existing = registry.get(key);
  if (existing) {
    existing.refCount++;
    return existing.controller;
  }

  const impl = factory({
    workspaceRoot: root,
    buildRepoIndex: sharedBuildRepoIndex,
    config: sharedConfig,
  });
  registry.set(key, { controller: impl, refCount: 1 });
  await impl.initialize();
  return impl;
}

export async function releaseContextLayer(root: string): Promise<void> {
  const key = normalizeRoot(root);
  const entry = registry.get(key);
  if (!entry) return;

  entry.refCount--;
  if (entry.refCount <= 0) {
    await entry.controller.dispose();
    registry.delete(key);
    if (defaultRoot === key) defaultRoot = null;
  }
}

export function getContextLayerForRoot(root: string): ContextLayerController | null {
  return registry.get(normalizeRoot(root))?.controller ?? null;
}

export function getContextLayerController(): ContextLayerController | null {
  if (defaultRoot) {
    return registry.get(defaultRoot)?.controller ?? null;
  }
  const first = registry.values().next();
  return first.done ? null : first.value.controller;
}
