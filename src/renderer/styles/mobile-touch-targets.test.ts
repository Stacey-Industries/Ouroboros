/**
 * mobile-touch-targets.test.ts
 *
 * Wave 32 Phase C — Touch-target audit scanner.
 *
 * Scans all .tsx files under src/renderer/components/ for <button> elements
 * with inline style heights below 32px, or Tailwind h-1 through h-7 classes
 * (which correspond to 4px–28px — all below the 32px threshold).
 *
 * Opt-out: append `// touch-target-ok` on the offending line.
 * Allowlist: add file paths (relative to repo root) to ALLOWLIST below.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

// Files known to be desktop-only or whose small buttons are structurally
// exempt (e.g. icon-only decorative elements that carry no interactive target).
// Keep this list empty by default — add entries only when the button is
// provably unreachable from a mobile-active surface.
const ALLOWLIST: ReadonlySet<string> = new Set<string>([]);

// ── Helpers ────────────────────────────────────────────────────────────────

/** Collect all .tsx files under a directory, recursively. */
function collectTsxFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

/** Convert an absolute file path to a repo-relative path using forward slashes. */
function toRelative(absPath: string, repoRoot: string): string {
  return absPath.slice(repoRoot.length + 1).replace(/\\/g, '/');
}

/**
 * Inline style height pattern: style={{ ... height: 'Npx' ... }} or height: N
 * where N < 32. Captures things like height: '28px', height: '16px', height: 16.
 * Does NOT fire on computed/variable heights (e.g. height: cellHeight).
 */
const INLINE_HEIGHT_RE =
  /\bheight\s*:\s*['"]?(\d+)(?:px)?['"]?/g;

/**
 * Tailwind h-N class where N is 1–7 (4px–28px, all below 32px).
 * Matches className="... h-3 ..." or className={`... h-7 ...`}.
 */
const TAILWIND_H_RE = /\bh-([1-7])\b/g;

interface Offender {
  relPath: string;
  line: number;
  text: string;
  reason: string;
}

/**
 * Return true if a height attribute on this line belongs directly to a
 * <button element (not to a child element nested inside the button).
 *
 * Two cases are considered:
 *
 * A) Single-line button: `<button className="h-5 ...">` — height on same line.
 *
 * B) Multi-line button props spread across lines:
 *    ```
 *    <button
 *      style={{
 *        height: '28px',   ← this line
 *      }}
 *    >
 *    ```
 *    We walk backward. If the current line looks like a pure prop/style value
 *    (no JSX element opener) and we find `<button` without crossing any
 *    JSX child element boundary (`<span`, `<div`, `<svg`, `/>`, `</`), it's
 *    a button prop.
 *
 * Child elements (e.g. `<span className="h-5">` inside a button) are skipped
 * because they start a new JSX element on their own line.
 */
function isButtonContext(lines: string[], lineIdx: number): boolean {
  const currentLine = lines[lineIdx];

  // Case A: same line as <button
  if (currentLine.includes('<button')) return true;

  // Case B: the current line must NOT open a JSX child element.
  // If it contains `<` followed by a letter (JSX element), it's a child, skip.
  if (/\s*<[a-zA-Z]/.test(currentLine)) return false;

  // Walk back up to 8 lines looking for <button without crossing child tags
  for (let back = 1; back <= 8; back++) {
    const idx = lineIdx - back;
    if (idx < 0) break;
    const prev = lines[idx];

    // Stop if we cross a closing tag or a JSX child opener (not <button)
    if (prev.includes('</') || prev.includes('/>')) break;
    if (/\s*<[a-zA-Z]/.test(prev) && !prev.includes('<button')) break;

    if (prev.includes('<button')) return true;
  }
  return false;
}

function scanFile(absPath: string, repoRoot: string): Offender[] {
  const rel = toRelative(absPath, repoRoot);
  if (ALLOWLIST.has(rel)) return [];

  const source = fs.readFileSync(absPath, 'utf-8');
  const lines = source.split('\n');
  const offenders: Offender[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip lines with the opt-out comment
    if (line.includes('touch-target-ok')) continue;

    // ── Inline style height check ────────────────────────────────────────
    INLINE_HEIGHT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_HEIGHT_RE.exec(line)) !== null) {
      const px = parseInt(m[1], 10);
      if (px < 32 && isButtonContext(lines, i)) {
        offenders.push({
          relPath: rel,
          line: i + 1,
          text: line.trim().slice(0, 120),
          reason: `inline height ${px}px on <button`,
        });
        break; // one report per line
      }
    }

    // ── Tailwind h-N check ───────────────────────────────────────────────
    TAILWIND_H_RE.lastIndex = 0;
    while ((m = TAILWIND_H_RE.exec(line)) !== null) {
      const n = parseInt(m[1], 10);
      const pxEquiv = n * 4; // Tailwind default spacing scale
      if (pxEquiv < 32 && isButtonContext(lines, i)) {
        offenders.push({
          relPath: rel,
          line: i + 1,
          text: line.trim().slice(0, 120),
          reason: `Tailwind h-${n} (${pxEquiv}px) on <button`,
        });
        break;
      }
    }
  }

  return offenders;
}

// ── Test ───────────────────────────────────────────────────────────────────

describe('mobile touch-target audit', () => {
  it('no <button> elements have a height below 32px without touch-target-ok opt-out', () => {
    // __dirname = src/renderer/styles — go up 3 levels to repo root
    const repoRoot = path.resolve(__dirname, '../../..');
    const componentsDir = path.join(repoRoot, 'src', 'renderer', 'components');

    const files = collectTsxFiles(componentsDir);
    expect(files.length).toBeGreaterThan(0);

    const allOffenders: Offender[] = [];
    for (const f of files) {
      allOffenders.push(...scanFile(f, repoRoot));
    }

    if (allOffenders.length > 0) {
      const report = allOffenders
        .map((o) => `  ${o.relPath}:${o.line} — ${o.reason}\n    ${o.text}`)
        .join('\n');
      // Fail with a descriptive message listing every offender
      expect.fail(
        `Found ${allOffenders.length} button(s) with height < 32px.\n` +
          `Add /* touch-target-ok */ to opt out desktop-only buttons.\n\n` +
          report,
      );
    }
  });
});
