/**
 * vsCodeImport.ts — parses a VS Code theme JSON into Ouroboros token overrides.
 *
 * Only the `colors` section is processed. `tokenColors`, `semanticTokenColors`,
 * `name`, and `type` are intentionally ignored for this wave.
 *
 * Call parseVsCodeTheme(json) with either a JSON string or a pre-parsed object.
 * Returns a VsCodeThemeImportResult on success, or { error: string } on fatal failure.
 */

import { VS_CODE_COLOR_MAP } from './vsCodeImport.colorMap';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface VsCodeThemeImportResult {
  /** Ouroboros CSS custom property name → color value. Feeds customTokens. */
  tokens: Record<string, string>;
  /** VS Code color keys that were recognized and mapped. */
  appliedKeys: string[];
  /** VS Code color keys present in the theme but not in our map. */
  unsupportedKeys: string[];
  /** Non-fatal issues: alpha stripping, unexpected value shapes, etc. */
  warnings: string[];
}

export type VsCodeThemeParseError = { error: string };

// ─── Internal helpers ─────────────────────────────────────────────────────────

function makeError(msg: string): VsCodeThemeParseError {
  return { error: msg };
}

function isParseError(x: unknown): x is VsCodeThemeParseError {
  return typeof x === 'object' && x !== null && 'error' in x;
}

// ─── Hex validation helpers ───────────────────────────────────────────────────

const HEX6_RE = /^#[0-9a-fA-F]{6}$/;
const HEX8_RE = /^#[0-9a-fA-F]{8}$/;

function isHex(value: string): boolean {
  return HEX6_RE.test(value) || HEX8_RE.test(value);
}

function hasAlpha(value: string): boolean {
  return HEX8_RE.test(value);
}

function stripAlpha(value: string): string {
  return value.slice(0, 7);
}

// ─── Input normalisation ──────────────────────────────────────────────────────

type ParsedRoot = Record<string, unknown>;

function parseInput(json: unknown): ParsedRoot | VsCodeThemeParseError {
  if (typeof json === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return makeError('Invalid JSON: could not parse the provided string.');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return makeError('Parsed JSON is not an object.');
    }
    return parsed as ParsedRoot;
  }

  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return makeError('Input is not a JSON object or string.');
  }

  return json as ParsedRoot;
}

// ─── Colors section extraction ────────────────────────────────────────────────

type ColorsMap = Record<string, unknown>;

function extractColors(root: ParsedRoot): ColorsMap | VsCodeThemeParseError {
  if (!('colors' in root)) {
    return makeError('Missing required "colors" field in theme object.');
  }

  const colors = root['colors'];

  if (typeof colors !== 'object' || colors === null || Array.isArray(colors)) {
    return makeError('"colors" field must be an object with string keys and string values.');
  }

  return colors as ColorsMap;
}

// ─── Per-entry processing ─────────────────────────────────────────────────────

interface EntryResult {
  tokenName: string | null;
  colorValue: string | null;
  warning: string | null;
  applied: boolean;
  unsupported: boolean;
}

function processEntry(vsKey: string, rawValue: unknown): EntryResult {
  const tokenName = VS_CODE_COLOR_MAP[vsKey] ?? null;

  if (typeof rawValue !== 'string') {
    return {
      tokenName,
      colorValue: null,
      warning: `${vsKey}: expected a string color value, got ${typeof rawValue}. Skipped.`,
      applied: false,
      unsupported: tokenName === null,
    };
  }

  if (!isHex(rawValue)) {
    return {
      tokenName,
      colorValue: null,
      warning: `${vsKey}: "${rawValue}" is not a valid hex color (#RRGGBB or #RRGGBBAA). Skipped.`,
      applied: false,
      unsupported: tokenName === null,
    };
  }

  if (tokenName === null) {
    return { tokenName: null, colorValue: rawValue, warning: null, applied: false, unsupported: true };
  }

  let finalValue = rawValue;
  let warning: string | null = null;

  if (hasAlpha(rawValue)) {
    finalValue = stripAlpha(rawValue);
    warning = `${vsKey}: alpha channel stripped from "${rawValue}" → "${finalValue}" (per-token alpha not supported).`;
  }

  return { tokenName, colorValue: finalValue, warning, applied: true, unsupported: false };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseVsCodeTheme(
  json: unknown,
): VsCodeThemeImportResult | VsCodeThemeParseError {
  const root = parseInput(json);
  if (isParseError(root)) return root;

  const colors = extractColors(root);
  if (isParseError(colors)) return colors;

  const tokens: Record<string, string> = {};
  const appliedKeys: string[] = [];
  const unsupportedKeys: string[] = [];
  const warnings: string[] = [];

  for (const [vsKey, rawValue] of Object.entries(colors)) {
    const result = processEntry(vsKey, rawValue);

    if (result.warning) warnings.push(result.warning);

    if (result.applied && result.tokenName && result.colorValue) {
      tokens[result.tokenName] = result.colorValue;
      appliedKeys.push(vsKey);
    } else if (result.unsupported) {
      unsupportedKeys.push(vsKey);
    }
  }

  return { tokens, appliedKeys, unsupportedKeys, warnings };
}
