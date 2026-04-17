/**
 * fileIdNormalise.ts — Shared `fileId` normaliser for context decision + outcome
 * writers.
 *
 * Both sides of the Wave 31 `(traceId, fileId)` join must produce identical
 * fileId values for the same underlying path. This single helper is imported
 * by contextPacketBuilderDecisions.ts (decision writer) and
 * contextOutcomeObserverSupport.ts (outcome writer) so the normalisation is
 * identical on both sides.
 *
 * Normalisation rules (in order):
 *   1. Replace all backslashes with forward slashes.
 *   2. Lowercase the result.
 *   3. If the path starts with the workspace root (normalised), strip the root
 *      prefix and leading slash to produce a repo-relative path.
 *   4. Otherwise, keep the absolute-normalised form.
 */

// ─── Normaliser ───────────────────────────────────────────────────────────────

/**
 * Return a stable, case-insensitive, forward-slash fileId for `absPath`.
 *
 * @param absPath       Absolute path to the file (may use backslashes on Windows).
 * @param workspaceRoot Absolute path to the workspace root (may use backslashes).
 *                      Pass an empty string or omit to skip root-relative stripping.
 */
export function normaliseFileId(absPath: string, workspaceRoot = ''): string {
  const normalised = absPath.replace(/\\/g, '/').toLowerCase();
  if (!workspaceRoot) return normalised;

  const root = workspaceRoot.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
  if (normalised.startsWith(root + '/')) {
    return normalised.slice(root.length + 1);
  }
  return normalised;
}
