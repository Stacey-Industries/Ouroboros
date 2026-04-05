/**
 * ipc-handlers/pathSecurity.ts — Shared workspace path validation helpers.
 *
 * All IPC handlers that accept file-system paths (files, git, context, LSP,
 * symbol search, shell) import from here so sandboxing logic stays in one place.
 *
 * Security goal: prevent a compromised renderer from reading/writing arbitrary
 * paths outside the active workspace root(s).
 */

import { IpcMainInvokeEvent } from 'electron';
import os from 'os';
import path from 'path';

import { getConfigValue } from '../config';
import { getWindowProjectRoots } from '../windowManager';

/**
 * Return the set of allowed root directories for the calling window.
 * Includes the window's project root, all configured multi-roots,
 * and the default project root from config.
 */
export function getAllowedRoots(event: IpcMainInvokeEvent): string[] {
  const roots: string[] = [];

  // Per-window project roots (from windowManager)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getOwnerBrowserWindow available at runtime but missing from typedefs
  const winId = (event.sender as any).getOwnerBrowserWindow?.()?.id as number | undefined;
  if (winId !== undefined) {
    for (const r of getWindowProjectRoots(winId)) {
      if (r) roots.push(path.resolve(r));
    }
  }

  // Fallback default project root (cold-boot seed, migration compat)
  const defaultRoot = getConfigValue('defaultProjectRoot');
  if (defaultRoot) {
    roots.push(path.resolve(defaultRoot));
  }

  return roots;
}

/**
 * Validate that `targetPath` resolves to a location inside one of the
 * allowed workspace roots.  Returns an error string if the path escapes
 * the sandbox, or null if the path is allowed.
 */
export function validatePathInWorkspace(targetPath: string, allowedRoots: string[]): string | null {
  if (allowedRoots.length === 0) {
    // No workspace configured — cannot validate, deny by default.
    return 'No workspace root configured; file operation denied for security.';
  }

  const resolved = path.resolve(targetPath);

  for (const root of allowedRoots) {
    // On Windows path comparison must be case-insensitive
    const normalizedResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    const normalizedRoot = process.platform === 'win32' ? root.toLowerCase() : root;

    if (
      normalizedResolved === normalizedRoot ||
      normalizedResolved.startsWith(normalizedRoot + path.sep)
    ) {
      return null; // Path is within this root — allowed.
    }
  }

  return `Path "${targetPath}" is outside the workspace and cannot be accessed.`;
}

/**
 * Convenience: validate a path and return a rejection result if it fails.
 * Returns null if the path is allowed (caller should proceed normally).
 */
export function assertPathAllowed(
  event: IpcMainInvokeEvent,
  targetPath: string,
): { success: false; error: string } | null {
  const error = validatePathInWorkspace(targetPath, getAllowedRoots(event));
  return error ? { success: false, error } : null;
}

/**
 * Check whether `targetPath` is a trusted `.md` file inside the user's
 * `~/.claude/commands/` or `~/.claude/rules/` directories.
 *
 * Resolves the path first to defend against traversal attacks.
 * On Windows, comparison is case-insensitive (mirrors `validatePathInWorkspace`).
 */
export function isTrustedConfigPath(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  if (path.extname(resolved).toLowerCase() !== '.md') return false;

  const home = os.homedir();
  const trustedDirs = [path.join(home, '.claude', 'commands'), path.join(home, '.claude', 'rules')];

  for (const dir of trustedDirs) {
    const normResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    const normDir = process.platform === 'win32' ? dir.toLowerCase() : dir;
    if (normResolved.startsWith(normDir + path.sep)) return true;
  }

  return false;
}

/**
 * Check whether `targetPath` is inside the installed VSX extensions directory.
 *
 * This is read-only trusted content managed by the app itself under
 * `~/.ouroboros/vsx-extensions/`. Renderer code needs access to icon-theme SVGs
 * and fonts stored there, but these assets are outside the active workspace.
 */
export function isTrustedVsxExtensionPath(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  const trustedDir = path.join(os.homedir(), '.ouroboros', 'vsx-extensions');
  const normResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const normDir = process.platform === 'win32' ? trustedDir.toLowerCase() : trustedDir;
  return normResolved.startsWith(normDir + path.sep);
}
