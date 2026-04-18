#!/usr/bin/env node
// tools/build-android-release.js
// Local release builder: validates env vars, then chains
// build:web → cap sync android → gradlew assembleRelease bundleRelease
// Never prints secret values. Exits with child process exit code.

'use strict';

const { execSync, spawn } = require('child_process');
const os = require('os');
const path = require('path');

const REQUIRED_VARS = [
  'ANDROID_KEYSTORE_PATH',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_PASSWORD',
];

function validateEnv() {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length === 0) return;

  console.error('[cap:build:android:release] Missing required env vars:');
  missing.forEach((v) => console.error(`  - ${v}`));
  console.error('');
  console.error('Set all four variables before running this script.');
  console.error('See docs/mobile-release.md for setup instructions.');
  process.exit(1);
}

function run(cmd, opts = {}) {
  console.error(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function gradleWrapper() {
  return os.platform() === 'win32' ? 'gradlew.bat' : './gradlew';
}

function buildGradleArgs() {
  return [
    'assembleRelease',
    'bundleRelease',
    `-Pandroid.injected.signing.store.file=${process.env.ANDROID_KEYSTORE_PATH}`,
    `-Pandroid.injected.signing.store.password=${process.env.ANDROID_KEYSTORE_PASSWORD}`,
    `-Pandroid.injected.signing.key.alias=${process.env.ANDROID_KEY_ALIAS}`,
    `-Pandroid.injected.signing.key.password=${process.env.ANDROID_KEY_PASSWORD}`,
  ];
}

function runGradle() {
  const androidDir = path.join(__dirname, '..', 'android');
  const wrapper = gradleWrapper();
  const args = buildGradleArgs();

  console.error(`\n> ${wrapper} ${args.slice(0, 2).join(' ')} [signing args redacted]`);

  const child = spawn(wrapper, args, {
    cwd: androidDir,
    stdio: 'inherit',
    shell: os.platform() === 'win32',
  });

  child.on('exit', (code) => process.exit(code ?? 1));
  child.on('error', (err) => {
    console.error(`[cap:build:android:release] Gradle error: ${err.message}`);
    process.exit(1);
  });
}

function main() {
  validateEnv();
  run('npm run build:web');
  run('npx cap sync android');
  runGradle();
}

main();
