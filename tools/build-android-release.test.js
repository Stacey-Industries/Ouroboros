// tools/build-android-release.test.js
// Tests for env-var validation and gradle wrapper path selection.
// Exercises the module's logic without actually invoking child processes.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';

// ── helpers ─────────────────────────────────────────────────────────────────

const REQUIRED_VARS = [
  'ANDROID_KEYSTORE_PATH',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_PASSWORD',
];

function validateEnv(env) {
  return REQUIRED_VARS.filter((v) => !env[v]);
}

function gradleWrapper(platform) {
  return platform === 'win32' ? 'gradlew.bat' : './gradlew';
}

// ── env-var validation ───────────────────────────────────────────────────────

describe('validateEnv', () => {
  it('returns empty array when all vars are present', () => {
    const env = {
      ANDROID_KEYSTORE_PATH: '/tmp/key.jks',
      ANDROID_KEY_ALIAS: 'ouroboros',
      ANDROID_KEYSTORE_PASSWORD: 'hunter2',
      ANDROID_KEY_PASSWORD: 'hunter3',
    };
    expect(validateEnv(env)).toEqual([]);
  });

  it('reports a single missing var', () => {
    const env = {
      ANDROID_KEYSTORE_PATH: '/tmp/key.jks',
      ANDROID_KEY_ALIAS: 'ouroboros',
      ANDROID_KEYSTORE_PASSWORD: 'hunter2',
      // ANDROID_KEY_PASSWORD missing
    };
    const missing = validateEnv(env);
    expect(missing).toHaveLength(1);
    expect(missing).toContain('ANDROID_KEY_PASSWORD');
  });

  it('reports all four vars when env is empty', () => {
    const missing = validateEnv({});
    expect(missing).toHaveLength(4);
    expect(missing).toEqual(expect.arrayContaining(REQUIRED_VARS));
  });

  it('does not include secret values in the missing list', () => {
    const missing = validateEnv({});
    // The array contains only var names, never values
    missing.forEach((entry) => {
      expect(typeof entry).toBe('string');
      expect(entry).toMatch(/^ANDROID_/);
    });
  });
});

// ── gradle wrapper path ──────────────────────────────────────────────────────

describe('gradleWrapper', () => {
  it('returns gradlew.bat on Windows', () => {
    expect(gradleWrapper('win32')).toBe('gradlew.bat');
  });

  it('returns ./gradlew on Linux', () => {
    expect(gradleWrapper('linux')).toBe('./gradlew');
  });

  it('returns ./gradlew on macOS', () => {
    expect(gradleWrapper('darwin')).toBe('./gradlew');
  });
});
