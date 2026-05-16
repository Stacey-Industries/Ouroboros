#!/usr/bin/env node
// Wave 92 Phase 1 — cross-platform lockfile completeness check.
//
// Verifies that a package-lock.json carries optional-dependency entries
// for win32 + linux + darwin across every platform-specific package family
// that appears in the lockfile. This is the structural test the npm 10.3+
// pruning regression (npm/cli#7961) and Windows optional-subtree skip both
// break.
//
// Exit 0 + "PASS" line = lockfile is cross-platform complete.
// Exit 1 + "FAIL" + per-family missing-platform report = not safe to commit.
//
// Reused by the Phase 4 CI canary; do not introduce repo-internal imports here.
// Ported verbatim from Gamify Wave 9 (scripts/lockfile-smoke.mjs).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_PLATFORMS = ['win32', 'linux', 'darwin'];

// Known platform-specific package families. Each entry is a RegExp that
// matches a lockfile package key (e.g. "node_modules/@esbuild/linux-x64")
// and extracts the family name + platform via named groups.
//
// Patterns cover the common shapes: scoped per-platform sub-packages
// (@esbuild/<os>-<arch>, @rollup/rollup-<os>-<arch>, @swc/core-<os>-<arch>-<libc>,
// @next/swc-<os>-<arch>-<libc>) and unscoped suffix shapes (lightningcss-<os>-<arch>).
const FAMILY_PATTERNS = [
  // @esbuild/<os>-<arch>
  /^node_modules\/(?<family>@esbuild)\/(?<os>win32|linux|darwin|freebsd|android|netbsd|openbsd|sunos)-[a-z0-9_]+$/,
  // @rollup/rollup-<os>-<arch>(-<libc>)?
  /^node_modules\/(?<family>@rollup\/rollup)-(?<os>win32|linux|darwin|freebsd|android)-[a-z0-9_-]+$/,
  // @swc/core-<os>-<arch>(-<libc>)?
  /^node_modules\/(?<family>@swc\/core)-(?<os>win32|linux|darwin|freebsd|android)-[a-z0-9_-]+$/,
  // @next/swc-<os>-<arch>(-<libc>)?
  /^node_modules\/(?<family>@next\/swc)-(?<os>win32|linux|darwin|freebsd|android)-[a-z0-9_-]+$/,
  // lightningcss-<os>-<arch>(-<libc>)?
  /^node_modules\/(?<family>lightningcss)-(?<os>win32|linux|darwin|freebsd|android)-[a-z0-9_-]+$/,
  // @parcel/watcher-<os>-<arch>(-<libc>)?
  /^node_modules\/(?<family>@parcel\/watcher)-(?<os>win32|linux|darwin|freebsd|android)-[a-z0-9_-]+$/,
  // @img/sharp-<os>-<arch> and @img/sharp-libvips-<os>-<arch>
  /^node_modules\/(?<family>@img\/sharp(?:-libvips)?)-(?<os>win32|linux|darwin|freebsd|android)-[a-z0-9_-]+$/,
  // bun-<os>-<arch>
  /^node_modules\/(?<family>bun)-(?<os>win32|linux|darwin|freebsd)-[a-z0-9_-]+$/,
  // @node-rs/xxhash-<os>-<arch>(-<libc>)? — Agent IDE specific (codebase graph)
  /^node_modules\/(?<family>@node-rs\/xxhash)-(?<os>win32|linux|darwin|freebsd|android)-[a-z0-9_-]+$/,
];

function classifyPackage(key) {
  for (const pattern of FAMILY_PATTERNS) {
    const m = key.match(pattern);
    if (m) {
      return { family: m.groups.family, os: m.groups.os };
    }
  }
  return null;
}

function main() {
  const lockfilePath = resolve(process.argv[2] ?? 'package-lock.json');
  let lockfile;
  try {
    lockfile = JSON.parse(readFileSync(lockfilePath, 'utf8'));
  } catch (err) {
    console.error(`FAIL — cannot read ${lockfilePath}: ${err.message}`);
    process.exit(1);
  }

  if (lockfile.lockfileVersion !== 3) {
    console.error(
      `FAIL — expected lockfileVersion 3, got ${lockfile.lockfileVersion}. ` +
        `This script targets the npm v7+ flat-packages format.`,
    );
    process.exit(1);
  }

  const packages = lockfile.packages ?? {};
  const families = new Map(); // family -> Set<os>

  for (const key of Object.keys(packages)) {
    const cls = classifyPackage(key);
    if (cls) {
      if (!families.has(cls.family)) families.set(cls.family, new Set());
      families.get(cls.family).add(cls.os);
    }
  }

  const failures = [];

  // Every detected platform-specific family must have entries for all three required platforms.
  // This catches the Windows-optional-subtree-skip and npm 10.3+ pruning failure modes — both
  // manifest as a family being present for only the generating OS instead of all three.
  for (const [family, oses] of [...families.entries()].sort()) {
    const missing = REQUIRED_PLATFORMS.filter((p) => !oses.has(p));
    if (missing.length > 0) {
      failures.push(
        `  family ${family}: present for [${[...oses].sort().join(', ')}], MISSING [${missing.join(', ')}]`,
      );
    }
  }

  const familyCount = families.size;
  const summary = [
    `lockfile: ${lockfilePath}`,
    `lockfileVersion: ${lockfile.lockfileVersion}`,
    `platform-specific families detected: ${familyCount}`,
  ];

  if (failures.length === 0) {
    console.log('PASS — lockfile is cross-platform complete.');
    for (const line of summary) console.log(`  ${line}`);
    if (familyCount > 0) {
      console.log('  family coverage:');
      for (const [family, oses] of [...families.entries()].sort()) {
        console.log(`    ${family}: ${[...oses].sort().join(', ')}`);
      }
    }
    process.exit(0);
  } else {
    console.error('FAIL — lockfile is NOT cross-platform complete.');
    for (const line of summary) console.error(`  ${line}`);
    if (familyCount > 0) {
      console.error('  family coverage:');
      for (const [family, oses] of [...families.entries()].sort()) {
        const ok = REQUIRED_PLATFORMS.every((p) => oses.has(p));
        const marker = ok ? 'ok   ' : 'MISS ';
        console.error(`    ${marker}${family}: ${[...oses].sort().join(', ')}`);
      }
    }
    console.error('  failures:');
    for (const f of failures) console.error(f);
    console.error('');
    console.error('  Fix: regenerate via `npm run lockfile:sync` (Wave 92 Phase 3).');
    process.exit(1);
  }
}

main();
