/**
 * crashReporter.ts — Wave 38 Phase F structured crash reporter.
 *
 * Registers process.on('uncaughtException') + process.on('unhandledRejection').
 * On handler fire:
 *   1. Builds a crash record with app/OS/Node metadata.
 *   2. Redacts absolute paths (homedir, Windows drive+Users, /Users/* patterns).
 *   3. Writes to ~/.ouroboros/crash-reports/<ISO-timestamp>.json.
 *   4. If config.platform.crashReports.enabled && webhookUrl: POSTs via https.
 *
 * NEVER logs crash record contents. Chat/config/env values are never included.
 */

import https from 'https';
import os from 'os';

import { getConfigValue } from './config';
import { writeCrashRecord } from './crashReporterStorage';
import log from './logger';

export interface CrashRecord {
  timestamp: string;
  version: string;
  os: string;
  osVersion: string;
  nodeVersion: string;
  message: string;
  stack: string;
}

// ---------------------------------------------------------------------------
// Path redaction
// ---------------------------------------------------------------------------

/**
 * Redact absolute paths from a string (best-effort; documented limitation).
 * Replaces:
 *   - os.homedir() literal → ~
 *   - Windows: C:\Users\<name>\ → ~\
 *   - Unix: /Users/<name>/ → ~/
 */
export function redactPaths(input: string): string {
  const homeDir = os.homedir();
  const escapedHome = homeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // eslint-disable-next-line security/detect-non-literal-regexp -- escapedHome is derived from os.homedir(), not user input
  let result = input.replace(new RegExp(escapedHome, 'g'), '~');
  result = result.replace(/[A-Za-z]:\\Users\\[^\\]+\\/g, '~\\');
  result = result.replace(/\/Users\/[^/]+\//g, '~/');
  return result;
}

// ---------------------------------------------------------------------------
// Record builder
// ---------------------------------------------------------------------------

function buildRecord(err: Error): CrashRecord {
  const rawStack = err.stack ?? err.message ?? String(err);
  const rawMessage = err.message ?? String(err);
  return {
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? 'unknown',
    os: process.platform,
    osVersion: os.release(),
    nodeVersion: process.version,
    message: redactPaths(rawMessage),
    stack: redactPaths(rawStack),
  };
}

// ---------------------------------------------------------------------------
// Webhook upload (opt-in only)
// ---------------------------------------------------------------------------

function postToWebhook(webhookUrl: string, record: CrashRecord): void {
  try {
    const parsed = new URL(webhookUrl);
    if (!['https:', 'http:'].includes(parsed.protocol)) return;
    const body = JSON.stringify(record);
    const options: https.RequestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(webhookUrl, options, (res) => {
      log.info(`[crashReporter] webhook response: ${res.statusCode}`);
    });
    req.on('error', (reqErr) => {
      log.warn('[crashReporter] webhook error:', reqErr.message);
    });
    req.write(body);
    req.end();
  } catch {
    log.warn('[crashReporter] failed to post to webhook');
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function handleCrash(source: string, err: Error): void {
  try {
    const record = buildRecord(err);
    log.error(`[crashReporter] crash captured from ${source}`);
    void writeCrashRecord(record);
    const platform = getConfigValue('platform') ?? {};
    const crashCfg = platform.crashReports ?? {};
    if (crashCfg.enabled && crashCfg.webhookUrl) {
      postToWebhook(crashCfg.webhookUrl, record);
    }
  } catch (inner) {
    log.error('[crashReporter] error inside crash handler:', inner);
  }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

let _initialised = false;

/** Call once at main-process startup, after config is loaded. */
export function initialiseCrashReporter(): void {
  if (_initialised) return;
  _initialised = true;

  process.on('uncaughtException', (err: Error) => {
    handleCrash('main:uncaughtException', err);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    handleCrash('main:unhandledRejection', err);
  });

  log.info('[crashReporter] initialised');
}

/** Exported for tests only — reset the initialised flag. */
export function _resetForTests(): void {
  _initialised = false;
}
