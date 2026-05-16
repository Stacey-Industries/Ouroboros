#!/usr/bin/env node
// Wave 93 Phase A — lockfile drift checker.
//
// Usage: node scripts/lockfile-drift-check.mjs <old-lockfile> <new-lockfile> [--accept-drift]
//
// Compares two package-lock.json files (npm v3+ format) and classifies
// transitive version changes by severity: patch / minor / major / added / removed.
//
// Exit codes:
//   0 — no drift, patch-only drift, or --accept-drift passed
//   2 — any minor, major, or prerelease drift detected
//
// ADR Decision 2: fail on minor+, warn on patch (and added/removed).

import { readFileSync } from 'node:fs';

// ---- ANSI helpers -------------------------------------------------------------

const tty = process.stdout.isTTY;
const c = {
  red: (s) => (tty ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (tty ? `\x1b[33m${s}\x1b[0m` : s),
  green: (s) => (tty ? `\x1b[32m${s}\x1b[0m` : s),
  bold: (s) => (tty ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s) => (tty ? `\x1b[2m${s}\x1b[0m` : s),
};

// ---- Version parsing ----------------------------------------------------------

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;

function parseVersion(v) {
  if (!v) return null;
  const m = VERSION_RE.exec(v);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    pre: m[4] ?? null,
  };
}

function classify(oldVer, newVer) {
  const o = parseVersion(oldVer);
  const n = parseVersion(newVer);
  if (!o || !n) return 'unknown';
  if (o.major !== n.major) return 'major';
  if (o.minor !== n.minor) return 'minor';
  if (o.patch !== n.patch) {
    // prerelease bumps within same major.minor.patch — treat as minor-severity
    if (o.pre !== n.pre) return 'prerelease';
    return 'patch';
  }
  // same numbers but different pre-release tag
  if (o.pre !== n.pre) return 'prerelease';
  return 'unchanged';
}

// ---- Lockfile reading ---------------------------------------------------------

function readPackages(lockfilePath) {
  const raw = JSON.parse(readFileSync(lockfilePath, 'utf8'));
  const packages = raw.packages ?? {};
  const result = new Map();
  for (const [key, entry] of Object.entries(packages)) {
    // Skip the root entry ("") and workspace link entries (no version field).
    if (key === '' || !entry.version) continue;
    // Strip the "node_modules/" prefix to get a stable package name.
    const name = key.startsWith('node_modules/') ? key.slice('node_modules/'.length) : key;
    result.set(name, entry.version);
  }
  return result;
}

// ---- Diff --------------------------------------------------------------------

function diffPackages(oldMap, newMap) {
  const results = { major: [], minor: [], prerelease: [], patch: [], added: [], removed: [] };

  for (const [name, oldVer] of oldMap) {
    if (!newMap.has(name)) {
      results.removed.push({ name, version: oldVer });
    } else {
      const newVer = newMap.get(name);
      const kind = classify(oldVer, newVer);
      if (kind !== 'unchanged' && kind !== 'unknown') {
        results[kind].push({ name, from: oldVer, to: newVer });
      }
    }
  }

  for (const [name, newVer] of newMap) {
    if (!oldMap.has(name)) {
      results.added.push({ name, version: newVer });
    }
  }

  return results;
}

// ---- Report ------------------------------------------------------------------

function printDriftLines(diff) {
  for (const { name, from, to } of diff.major) {
    console.log(`  ${c.red('[MAJOR]')} ${name}: ${from} → ${to}`);
  }
  for (const { name, from, to } of diff.minor) {
    console.log(`  ${c.red('[MINOR]')} ${name}: ${from} → ${to}`);
  }
  for (const { name, from, to } of diff.prerelease) {
    console.log(`  ${c.red('[PRERELEASE]')} ${name}: ${from} → ${to}`);
  }
  for (const { name, from, to } of diff.patch) {
    console.log(`  ${c.yellow('[PATCH]')} ${name}: ${from} → ${to}`);
  }
  for (const { name, version } of diff.added) {
    console.log(`  ${c.dim('[ADDED]')} ${name}@${version}`);
  }
  for (const { name, version } of diff.removed) {
    console.log(`  ${c.dim('[REMOVED]')} ${name}@${version}`);
  }
}

function hasFailingSeverity(diff) {
  return diff.major.length > 0 || diff.minor.length > 0 || diff.prerelease.length > 0;
}

function printReport(diff, acceptDrift) {
  const failing = hasFailingSeverity(diff);
  const hasWarning = diff.patch.length > 0 || diff.added.length > 0 || diff.removed.length > 0;

  if (!failing && !hasWarning) {
    console.log(c.green('✓ No drift detected — lockfiles are equivalent.'));
    return;
  }

  console.log(c.bold('Lockfile drift report:'));
  printDriftLines(diff);

  if (failing && !acceptDrift) {
    console.log(c.red('\nDrift on minor/major/prerelease detected. Re-run with --accept-drift to override.'));
  } else if (failing && acceptDrift) {
    console.log(c.yellow('\nDrift accepted via --accept-drift.'));
  }
}

// ---- Main --------------------------------------------------------------------

const args = process.argv.slice(2);
const acceptDrift = args.includes('--accept-drift');
const positional = args.filter((a) => !a.startsWith('--'));

if (positional.length < 2) {
  console.error('Usage: node scripts/lockfile-drift-check.mjs <old-lockfile> <new-lockfile> [--accept-drift]');
  process.exit(1);
}

const [oldPath, newPath] = positional;

let oldMap, newMap;
try {
  oldMap = readPackages(oldPath);
  newMap = readPackages(newPath);
} catch (err) {
  console.error(`Error reading lockfile: ${err.message}`);
  process.exit(1);
}

const diff = diffPackages(oldMap, newMap);
printReport(diff, acceptDrift);

if (hasFailingSeverity(diff) && !acceptDrift) {
  process.exit(2);
}
process.exit(0);
