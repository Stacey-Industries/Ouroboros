/**
 * gitDiffParser.test.ts — Unit tests for the unified diff parser.
 *
 * Uses inline fixture strings (real git diff output) — no filesystem access needed.
 *
 * Run with: npx vitest run src/main/ipc-handlers/gitDiffParser.test.ts
 */

import path from 'path';
import { describe, expect, it } from 'vitest';

import { parseDiffOutput } from './gitDiffParser';

const ROOT = process.platform === 'win32' ? 'C:\\repo' : '/repo';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SINGLE_MODIFIED = `\
diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,6 @@
 import path from 'path';
+import fs from 'fs';

 export function main() {
   console.log('hello');
`;

const MULTI_FILE = `\
diff --git a/src/foo.ts b/src/foo.ts
index 0000001..0000002 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 const x = 1;
+const y = 2;
 export { x };
diff --git a/src/bar.ts b/src/bar.ts
index 0000003..0000004 100644
--- a/src/bar.ts
+++ b/src/bar.ts
@@ -10,3 +10,4 @@
 function bar() {
+  return 42;
 }
`;

const ADDED_FILE = `\
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+export function newFn() {
+  return 1;
+}
`;

const DELETED_FILE = `\
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function oldFn() {
-  return 0;
-}
`;

const RENAMED_FILE = `\
diff --git a/src/before.ts b/src/after.ts
similarity index 100%
rename from src/before.ts
rename to src/after.ts
`;

const BINARY_FILE = `\
diff --git a/assets/logo.png b/assets/logo.png
index abc1234..def5678 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
`;

const MULTI_HUNK = `\
diff --git a/src/large.ts b/src/large.ts
index 0000001..0000002 100644
--- a/src/large.ts
+++ b/src/large.ts
@@ -1,4 +1,5 @@
 line1
+lineA
 line2
 line3
 line4
@@ -20,4 +21,5 @@
 line20
+lineB
 line21
 line22
 line23
`;

const EMPTY_DIFF = '';
const WHITESPACE_ONLY_DIFF = '   \n\t\n';

// ─── Empty / trivial input ────────────────────────────────────────────────────

describe('parseDiffOutput() — empty / trivial input', () => {
  it('returns [] for an empty string', () => {
    expect(parseDiffOutput(EMPTY_DIFF, ROOT)).toEqual([]);
  });

  it('returns [] for whitespace-only input', () => {
    expect(parseDiffOutput(WHITESPACE_ONLY_DIFF, ROOT)).toEqual([]);
  });
});

// ─── Single modified file ─────────────────────────────────────────────────────

describe('parseDiffOutput() — single modified file', () => {
  it('returns exactly one entry', () => {
    const result = parseDiffOutput(SINGLE_MODIFIED, ROOT);
    expect(result).toHaveLength(1);
  });

  it('status is "modified"', () => {
    const [file] = parseDiffOutput(SINGLE_MODIFIED, ROOT);
    expect(file.status).toBe('modified');
  });

  it('relativePath matches the b/ path', () => {
    const [file] = parseDiffOutput(SINGLE_MODIFIED, ROOT);
    expect(file.relativePath).toBe('src/index.ts');
  });

  it('filePath is an absolute path rooted at ROOT', () => {
    const [file] = parseDiffOutput(SINGLE_MODIFIED, ROOT);
    expect(file.filePath).toBe(path.resolve(ROOT, 'src/index.ts'));
  });

  it('has one hunk', () => {
    const [file] = parseDiffOutput(SINGLE_MODIFIED, ROOT);
    expect(file.hunks).toHaveLength(1);
  });

  it('hunk header starts with @@', () => {
    const [file] = parseDiffOutput(SINGLE_MODIFIED, ROOT);
    expect(file.hunks[0].header).toMatch(/^@@/);
  });

  it('hunk oldStart and newStart are positive integers', () => {
    const [file] = parseDiffOutput(SINGLE_MODIFIED, ROOT);
    const { oldStart, newStart } = file.hunks[0];
    expect(oldStart).toBeGreaterThan(0);
    expect(newStart).toBeGreaterThan(0);
  });

  it('hunk lines array is non-empty', () => {
    const [file] = parseDiffOutput(SINGLE_MODIFIED, ROOT);
    expect(file.hunks[0].lines.length).toBeGreaterThan(0);
  });

  it('rawPatch contains the hunk header', () => {
    const [file] = parseDiffOutput(SINGLE_MODIFIED, ROOT);
    expect(file.hunks[0].rawPatch).toContain('@@ -1,5 +1,6 @@');
  });

  it('has no oldPath (not a rename)', () => {
    const [file] = parseDiffOutput(SINGLE_MODIFIED, ROOT);
    expect(file.oldPath).toBeUndefined();
  });
});

// ─── Multiple file changes ────────────────────────────────────────────────────

describe('parseDiffOutput() — multiple file changes', () => {
  it('returns one entry per file', () => {
    const result = parseDiffOutput(MULTI_FILE, ROOT);
    expect(result).toHaveLength(2);
  });

  it('relativePaths are correct for each file', () => {
    const result = parseDiffOutput(MULTI_FILE, ROOT);
    const paths = result.map((f) => f.relativePath);
    expect(paths).toContain('src/foo.ts');
    expect(paths).toContain('src/bar.ts');
  });

  it('all statuses are "modified"', () => {
    const result = parseDiffOutput(MULTI_FILE, ROOT);
    expect(result.every((f) => f.status === 'modified')).toBe(true);
  });

  it('each file has at least one hunk', () => {
    const result = parseDiffOutput(MULTI_FILE, ROOT);
    expect(result.every((f) => f.hunks.length > 0)).toBe(true);
  });
});

// ─── Added file ───────────────────────────────────────────────────────────────

describe('parseDiffOutput() — added file', () => {
  it('returns one entry with status "added"', () => {
    const result = parseDiffOutput(ADDED_FILE, ROOT);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('added');
  });

  it('relativePath is the new file path', () => {
    const [file] = parseDiffOutput(ADDED_FILE, ROOT);
    expect(file.relativePath).toBe('src/new.ts');
  });

  it('hunk newStart is 1 (file starts at line 1)', () => {
    const [file] = parseDiffOutput(ADDED_FILE, ROOT);
    expect(file.hunks[0].newStart).toBe(1);
  });

  it('hunk lines start with + for additions', () => {
    const [file] = parseDiffOutput(ADDED_FILE, ROOT);
    const addedLines = file.hunks[0].lines.filter((l) => l.startsWith('+'));
    expect(addedLines.length).toBeGreaterThan(0);
  });
});

// ─── Deleted file ─────────────────────────────────────────────────────────────

describe('parseDiffOutput() — deleted file', () => {
  it('returns one entry with status "deleted"', () => {
    const result = parseDiffOutput(DELETED_FILE, ROOT);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('deleted');
  });

  it('relativePath is the deleted file path', () => {
    const [file] = parseDiffOutput(DELETED_FILE, ROOT);
    expect(file.relativePath).toBe('src/old.ts');
  });

  it('hunk lines start with - for deletions', () => {
    const [file] = parseDiffOutput(DELETED_FILE, ROOT);
    const removedLines = file.hunks[0].lines.filter((l) => l.startsWith('-'));
    expect(removedLines.length).toBeGreaterThan(0);
  });
});

// ─── Renamed file ─────────────────────────────────────────────────────────────

describe('parseDiffOutput() — renamed file', () => {
  it('returns one entry with status "renamed"', () => {
    const result = parseDiffOutput(RENAMED_FILE, ROOT);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('renamed');
  });

  it('relativePath is the new (b/) path', () => {
    const [file] = parseDiffOutput(RENAMED_FILE, ROOT);
    expect(file.relativePath).toBe('src/after.ts');
  });

  it('oldPath is the original (a/) path', () => {
    const [file] = parseDiffOutput(RENAMED_FILE, ROOT);
    // Rename without content change — oldPath comes from rename from detection or a/b mismatch
    expect(file.oldPath).toBeDefined();
    expect(file.oldPath).toContain('before');
  });

  it('has no hunks for a pure rename (no content change)', () => {
    const [file] = parseDiffOutput(RENAMED_FILE, ROOT);
    expect(file.hunks).toHaveLength(0);
  });
});

// ─── Binary file ──────────────────────────────────────────────────────────────

describe('parseDiffOutput() — binary file', () => {
  it('returns one entry for a binary diff', () => {
    const result = parseDiffOutput(BINARY_FILE, ROOT);
    expect(result).toHaveLength(1);
  });

  it('binary diff has no hunks (no @@ lines)', () => {
    const [file] = parseDiffOutput(BINARY_FILE, ROOT);
    expect(file.hunks).toHaveLength(0);
  });

  it('relativePath is correct for binary file', () => {
    const [file] = parseDiffOutput(BINARY_FILE, ROOT);
    expect(file.relativePath).toBe('assets/logo.png');
  });

  it('status defaults to "modified" for binary (no mode line)', () => {
    const [file] = parseDiffOutput(BINARY_FILE, ROOT);
    expect(file.status).toBe('modified');
  });
});

// ─── Multiple hunks within a single file ─────────────────────────────────────

describe('parseDiffOutput() — multiple hunks in one file', () => {
  it('returns one file entry', () => {
    expect(parseDiffOutput(MULTI_HUNK, ROOT)).toHaveLength(1);
  });

  it('file has two hunks', () => {
    const [file] = parseDiffOutput(MULTI_HUNK, ROOT);
    expect(file.hunks).toHaveLength(2);
  });

  it('first hunk starts at line 1', () => {
    const [file] = parseDiffOutput(MULTI_HUNK, ROOT);
    expect(file.hunks[0].oldStart).toBe(1);
  });

  it('second hunk starts at a later line', () => {
    const [file] = parseDiffOutput(MULTI_HUNK, ROOT);
    expect(file.hunks[1].oldStart).toBeGreaterThan(file.hunks[0].oldStart);
  });

  it('each hunk has its own rawPatch containing its header', () => {
    const [file] = parseDiffOutput(MULTI_HUNK, ROOT);
    expect(file.hunks[0].rawPatch).toContain('@@ -1,4 +1,5 @@');
    expect(file.hunks[1].rawPatch).toContain('@@ -20,4 +21,5 @@');
  });
});

// ─── filePath construction ────────────────────────────────────────────────────

describe('parseDiffOutput() — filePath uses path.resolve(root, relativePath)', () => {
  it('produces an OS-absolute path', () => {
    const [file] = parseDiffOutput(SINGLE_MODIFIED, ROOT);
    expect(path.isAbsolute(file.filePath)).toBe(true);
  });

  it('filePath equals path.resolve(root, relativePath)', () => {
    const [file] = parseDiffOutput(SINGLE_MODIFIED, ROOT);
    expect(file.filePath).toBe(path.resolve(ROOT, file.relativePath));
  });
});

// ─── hunk count/line metadata accuracy ───────────────────────────────────────

describe('parseDiffOutput() — hunk numeric metadata', () => {
  it('oldCount defaults to 1 when omitted from @@ header', () => {
    // Single-line hunk: "@@ -5 +5 @@" (no comma)
    const singleLineDiff = `\
diff --git a/x.ts b/x.ts
index 0000001..0000002 100644
--- a/x.ts
+++ b/x.ts
@@ -5 +5 @@
 unchanged
`;
    const [file] = parseDiffOutput(singleLineDiff, ROOT);
    expect(file.hunks[0].oldCount).toBe(1);
    expect(file.hunks[0].newCount).toBe(1);
  });

  it('parses counts correctly when both are present', () => {
    const [file] = parseDiffOutput(SINGLE_MODIFIED, ROOT);
    expect(file.hunks[0].oldCount).toBe(5);
    expect(file.hunks[0].newCount).toBe(6);
  });
});
