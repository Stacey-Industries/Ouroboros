/**
 * check-docs-schema.ts — CI check for doc/schema drift.
 *
 * Parses configSchemaTail.ts to extract all top-level config-flag paths,
 * then verifies each appears in at least one docs/*.md file.
 * Exits 1 if any flag is undocumented; exits 0 otherwise.
 *
 * Run:  npx tsx scripts/check-docs-schema.ts
 *       node --loader ts-node/esm scripts/check-docs-schema.ts
 *
 * Wired as `npm run docs:check` in package.json.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.join(path.dirname(process.argv[1] ?? ''), '..'));
const SCHEMA_FILE = path.join(ROOT, 'src', 'main', 'configSchemaTail.ts');
const DOCS_DIR = path.join(ROOT, 'docs');

// ── 1. Extract flag keys from configSchemaTail.ts ─────────────────────────

function extractFlagKeys(src: string): string[] {
  const keys: string[] = [];
  // Match top-level object keys of the tailSchema export:
  //   /^  <key>:/ lines (2-space indent, no deeper nesting needed for top-level)
  const topLevelRe = /^  (\w+):/gm;
  let m: RegExpExecArray | null;
  while ((m = topLevelRe.exec(src)) !== null) {
    keys.push(m[1]);
  }
  // Also extract nested object property names from block comments and schema bodies.
  // Capture things like `mobilePrimary`, `mobileAccess.enabled`,
  // `sessionDispatch.maxConcurrent` etc. by scanning for dot-notation
  // mentions inside the schema source.
  // Filter: both sides of the dot must be alphabetic identifiers (no numeric keys).
  const dotRe = /([A-Za-z_]\w*)\.([A-Za-z_]\w*)/g;
  while ((m = dotRe.exec(src)) !== null) {
    keys.push(`${m[1]}.${m[2]}`);
  }
  return [...new Set(keys)];
}

// ── 2. Read all docs/*.md files ───────────────────────────────────────────

function readDocs(): string {
  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'));
  return files.map((f) => fs.readFileSync(path.join(DOCS_DIR, f), 'utf8')).join('\n');
}

// ── 3. Check coverage ─────────────────────────────────────────────────────

function main(): void {
  if (!fs.existsSync(SCHEMA_FILE)) {
    process.stderr.write(`[check-docs-schema] schema file not found: ${SCHEMA_FILE}\n`);
    process.exit(1);
  }
  if (!fs.existsSync(DOCS_DIR)) {
    process.stderr.write(`[check-docs-schema] docs dir not found: ${DOCS_DIR}\n`);
    process.exit(1);
  }

  const schemaSrc = fs.readFileSync(SCHEMA_FILE, 'utf8');
  const allFlags = extractFlagKeys(schemaSrc);
  const docText = readDocs();

  // Flags we explicitly skip because they are implementation details,
  // deprecated keys, or intentionally undocumented internal counters.
  const skipList = new Set([
    // Deprecated / internal keys unlikely to appear in feature docs
    'windowSessions',         // deprecated Wave 40 Phase D
    'webAccessToken',         // internal token, not a feature flag
    'routerLastRetrainCount', // internal counter
    // Dot-path false positives — these come from constant references in the source,
    // not from config schema property paths.
    'AGENT_CHAT_SETTINGS_DEFAULTS.defaultProvider',
    'AGENT_CHAT_SETTINGS_DEFAULTS.defaultVerificationProfile',
    'AGENT_CHAT_SETTINGS_DEFAULTS.contextBehavior',
    'AGENT_CHAT_SETTINGS_DEFAULTS.showAdvancedControls',
    'AGENT_CHAT_SETTINGS_DEFAULTS.openDetailsOnFailure',
    'AGENT_CHAT_SETTINGS_DEFAULTS.defaultView',
    // Generated constants imported from settingsResolver — not schema keys themselves
    'AGENT_CHAT_CONTEXT_BEHAVIORS',
    'AGENT_CHAT_DEFAULT_VIEWS',
    'AGENT_CHAT_PROVIDERS',
    'AGENT_CHAT_SETTINGS_DEFAULTS',
    'AGENT_CHAT_VERIFICATION_PROFILES',
  ]);

  const missing: string[] = [];
  for (const flag of allFlags) {
    if (skipList.has(flag)) continue;
    // Check that the flag name (or its dotted path) appears somewhere in the docs
    if (!docText.includes(flag)) {
      missing.push(flag);
    }
  }

  if (missing.length === 0) {
    process.stdout.write('[check-docs-schema] All schema flags are documented.\n');
    process.exit(0);
  } else {
    process.stderr.write('[check-docs-schema] The following schema flags are not documented in any docs/*.md file:\n');
    for (const f of missing) {
      process.stderr.write(`  - ${f}\n`);
    }
    process.stderr.write(`\nTotal undocumented: ${missing.length}. Add them to the relevant docs/*.md file.\n`);
    process.exit(1);
  }
}

main();
