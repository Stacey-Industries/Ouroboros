/**
 * check-docs-schema.ts — CI check for doc/schema drift.
 *
 * Parses configSchemaTail.ts to extract all top-level config-flag paths,
 * then verifies each appears in at least one roadmap/docs/*.md file.
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
const DOCS_DIR = path.join(ROOT, 'roadmap', 'docs');

// ── 1. Extract flag keys from configSchemaTail.ts ─────────────────────────

function extractFlagKeys(src: string): string[] {
  const keys: string[] = [];
  // Match top-level object keys of the tailSchema export:
  //   /^  <key>:/ lines (2-space indent, no deeper nesting needed for top-level)
  const topLevelRe = /^ {2}(\w+):/gm;
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

// ── 2. Read all roadmap/docs/*.md files ───────────────────────────────────────────

function readDocs(): string {
  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'));
  return files.map((f) => fs.readFileSync(path.join(DOCS_DIR, f), 'utf8')).join('\n');
}

// ── 3. Check coverage ─────────────────────────────────────────────────────

const SKIP_LIST = new Set([
  // Deprecated / internal keys unlikely to appear in feature docs
  'windowSessions',
  'webAccessToken',
  'routerLastRetrainCount',
  // Dot-path false positives — constant references in source, not schema keys
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

function findMissing(allFlags: string[], docText: string): string[] {
  const missing: string[] = [];
  for (const flag of allFlags) {
    if (SKIP_LIST.has(flag)) continue;
    if (!docText.includes(flag)) missing.push(flag);
  }
  return missing;
}

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
  const missing = findMissing(allFlags, docText);

  if (missing.length === 0) {
    process.stdout.write('[check-docs-schema] All schema flags are documented.\n');
    process.exit(0);
  }
  process.stderr.write(
    '[check-docs-schema] The following schema flags are not documented in any roadmap/docs/*.md file:\n',
  );
  for (const f of missing) {
    process.stderr.write(`  - ${f}\n`);
  }
  process.stderr.write(
    `\nTotal undocumented: ${missing.length}. Add them to the relevant roadmap/docs/*.md file.\n`,
  );
  process.exit(1);
}

main();
