#!/usr/bin/env node
// Wave 92 — pin top-level package.json deps to currently-resolved exact versions.
//
// Reads a package.json + a package-lock.json. Writes a copy of the package.json
// where each caret/tilde range in dependencies/devDependencies/optionalDependencies/
// peerDependencies has been replaced with the exact resolved version from the
// lockfile. Other fields are passed through unchanged.
//
// Used by `npm run lockfile:sync` to defeat the naive-from-scratch-regen version
// drift documented in `roadmap/wave-92-cross-platform-lockfile-stryker/wave-92-decisions.md`
// (Decision 3): preserve currently-resolved direct-dep versions while letting
// transitives flow normally.
//
// Usage:
//   node scripts/pin-toplevel.mjs <package.json> <package-lock.json> [<out.json>]
//
// If <out.json> is omitted, writes the pinned JSON to stdout. Original input
// files are never modified.
//
// Ported verbatim from Gamify Wave 9 (scripts/pin-toplevel.mjs). Generic
// over manifest shape — works equally for single-manifest (Agent IDE) and
// multi-manifest monorepo (Gamify) layouts.

import { readFileSync, writeFileSync } from 'node:fs';

const [, , pkgPath, lockPath, outPath] = process.argv;

if (!pkgPath || !lockPath) {
  console.error(
    'usage: node scripts/pin-toplevel.mjs <package.json> <package-lock.json> [<out.json>]',
  );
  process.exit(2);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

// Map "name" -> "resolved version" from lockfile's top-level packages entries.
// The root package's deps live at lock.packages[""].dependencies etc., but their
// resolved versions live at lock.packages["node_modules/<name>"].version.
// Skip nested node_modules paths — only top-level resolutions matter here.
const resolvedVersion = new Map();
for (const [key, val] of Object.entries(lock.packages ?? {})) {
  if (!key.startsWith('node_modules/')) continue;
  const name = key.slice('node_modules/'.length);
  if (name.includes('/node_modules/')) continue;
  if (val.version) resolvedVersion.set(name, val.version);
}

function pinSection(section) {
  if (!section) return section;
  const out = {};
  for (const [name, range] of Object.entries(section)) {
    const resolved = resolvedVersion.get(name);
    // Only pin caret/tilde ranges. Leave exact pins, "latest", "*", file:, link:,
    // workspace:, git URLs, and other special specs alone — those are either
    // already deterministic or have semantics we shouldn't override.
    if (resolved && /^[\^~]/.test(range)) {
      out[name] = resolved;
    } else {
      out[name] = range;
    }
  }
  return out;
}

const out = { ...pkg };
if (pkg.dependencies) out.dependencies = pinSection(pkg.dependencies);
if (pkg.devDependencies) out.devDependencies = pinSection(pkg.devDependencies);
if (pkg.optionalDependencies) out.optionalDependencies = pinSection(pkg.optionalDependencies);
if (pkg.peerDependencies) out.peerDependencies = pinSection(pkg.peerDependencies);

const json = JSON.stringify(out, null, 2) + '\n';
if (outPath) {
  writeFileSync(outPath, json);
  console.error(`wrote pinned package.json → ${outPath}`);
} else {
  process.stdout.write(json);
}
