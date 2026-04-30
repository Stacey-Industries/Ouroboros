/* eslint-disable security/detect-non-literal-fs-filename -- test file; all paths derived from os.tmpdir() */
/**
 * rulesDirectoryManager.test.ts
 *
 * Unit tests for the disable/enable/restore APIs added in Wave 62 Phase A.
 * Uses a temp dir per test to avoid touching real ~/.claude/ paths.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  disableRule,
  discoverRuleFiles,
  enableRule,
  restoreAllDisabled,
} from './rulesDirectoryManager';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeTempRoot(): Promise<string> {
  const base = path.join(
    os.tmpdir(),
    `rdm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(base, { recursive: true });
  return base;
}

async function writeRule(root: string, name: string, content = `# ${name}`): Promise<void> {
  const dir = path.join(root, '.claude', 'rules');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${name}.md`), content, 'utf8');
}

async function fileExists(p: string): Promise<boolean> {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}

// ─── State ───────────────────────────────────────────────────────────────────

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await makeTempRoot();
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

// ─── disableRule ─────────────────────────────────────────────────────────────

describe('disableRule', () => {
  it('moves a file from active dir to disabled dir', async () => {
    await writeRule(tempRoot, 'my-rule');
    const activeFile = path.join(tempRoot, '.claude', 'rules', 'my-rule.md');
    const disabledFile = path.join(tempRoot, '.claude', 'rules-disabled', 'my-rule.md');

    await disableRule('project', 'my-rule', tempRoot);

    expect(await fileExists(activeFile)).toBe(false);
    expect(await fileExists(disabledFile)).toBe(true);
  });

  it('throws when the source file does not exist', async () => {
    await expect(disableRule('project', 'nonexistent', tempRoot)).rejects.toThrow(/Rule not found/);
  });

  it('throws when a collision exists in the disabled dir', async () => {
    await writeRule(tempRoot, 'my-rule');
    // Manually place a file in the disabled dir to create a collision
    const disabledDir = path.join(tempRoot, '.claude', 'rules-disabled');
    await fs.mkdir(disabledDir, { recursive: true });
    await fs.writeFile(path.join(disabledDir, 'my-rule.md'), '# existing', 'utf8');

    await expect(disableRule('project', 'my-rule', tempRoot)).rejects.toThrow(
      /already exists in disabled dir/,
    );
  });
});

// ─── enableRule ──────────────────────────────────────────────────────────────

describe('enableRule', () => {
  it('moves a file from disabled dir back to active dir', async () => {
    await writeRule(tempRoot, 'my-rule');
    await disableRule('project', 'my-rule', tempRoot);

    const activeFile = path.join(tempRoot, '.claude', 'rules', 'my-rule.md');
    const disabledFile = path.join(tempRoot, '.claude', 'rules-disabled', 'my-rule.md');

    await enableRule('project', 'my-rule', tempRoot);

    expect(await fileExists(activeFile)).toBe(true);
    expect(await fileExists(disabledFile)).toBe(false);
  });

  it('throws when the source file is not in the disabled dir', async () => {
    await expect(enableRule('project', 'nonexistent', tempRoot)).rejects.toThrow(
      /Rule not found in disabled dir/,
    );
  });

  it('throws when a collision exists in the active dir', async () => {
    // Place a file in disabled dir
    const disabledDir = path.join(tempRoot, '.claude', 'rules-disabled');
    await fs.mkdir(disabledDir, { recursive: true });
    await fs.writeFile(path.join(disabledDir, 'my-rule.md'), '# disabled', 'utf8');
    // Also place a file in active dir
    await writeRule(tempRoot, 'my-rule');

    await expect(enableRule('project', 'my-rule', tempRoot)).rejects.toThrow(
      /already exists in active dir/,
    );
  });
});

// ─── restoreAllDisabled ───────────────────────────────────────────────────────

describe('restoreAllDisabled', () => {
  it('returns { restored: 0, skipped: 0 } when disabled dir does not exist', async () => {
    const result = await restoreAllDisabled('project', tempRoot);
    expect(result).toEqual({ restored: 0, skipped: 0 });
  });

  it('round-trips multiple files and reports correct counts', async () => {
    await writeRule(tempRoot, 'rule-a');
    await writeRule(tempRoot, 'rule-b');
    await writeRule(tempRoot, 'rule-c');
    await disableRule('project', 'rule-a', tempRoot);
    await disableRule('project', 'rule-b', tempRoot);
    await disableRule('project', 'rule-c', tempRoot);

    const result = await restoreAllDisabled('project', tempRoot);

    expect(result).toEqual({ restored: 3, skipped: 0 });

    const activeDir = path.join(tempRoot, '.claude', 'rules');
    expect(await fileExists(path.join(activeDir, 'rule-a.md'))).toBe(true);
    expect(await fileExists(path.join(activeDir, 'rule-b.md'))).toBe(true);
    expect(await fileExists(path.join(activeDir, 'rule-c.md'))).toBe(true);
  });

  it('skips files when a collision exists in the active dir and increments skipped', async () => {
    // Put a file in the disabled dir
    const disabledDir = path.join(tempRoot, '.claude', 'rules-disabled');
    await fs.mkdir(disabledDir, { recursive: true });
    await fs.writeFile(path.join(disabledDir, 'colliding.md'), '# disabled', 'utf8');
    // Also in active dir — collision
    await writeRule(tempRoot, 'colliding');
    // A clean file that can be restored
    await fs.writeFile(path.join(disabledDir, 'clean.md'), '# clean', 'utf8');

    const result = await restoreAllDisabled('project', tempRoot);

    expect(result.restored).toBe(1);
    expect(result.skipped).toBe(1);
    // Collision file stays in disabled dir
    expect(await fileExists(path.join(disabledDir, 'colliding.md'))).toBe(true);
    // Clean file is restored
    expect(await fileExists(path.join(tempRoot, '.claude', 'rules', 'clean.md'))).toBe(true);
  });
});

// ─── discoverRuleFiles ────────────────────────────────────────────────────────

describe('discoverRuleFiles', () => {
  it('returns disabled: false for files in the active dir', async () => {
    await writeRule(tempRoot, 'active-rule', '# Active rule content');

    const rules = await discoverRuleFiles(tempRoot);
    const found = rules.find((r) => r.id === 'active-rule' && r.scope === 'project');

    expect(found).toBeDefined();
    expect(found?.disabled).toBe(false);
  });

  it('returns disabled: true for files in the disabled dir', async () => {
    await writeRule(tempRoot, 'toggled-rule', '# Toggled rule content');
    await disableRule('project', 'toggled-rule', tempRoot);

    const rules = await discoverRuleFiles(tempRoot);
    const found = rules.find((r) => r.id === 'toggled-rule' && r.scope === 'project');

    expect(found).toBeDefined();
    expect(found?.disabled).toBe(true);
  });

  it('returns both active and disabled rules in the same result set', async () => {
    await writeRule(tempRoot, 'rule-on', '# On');
    await writeRule(tempRoot, 'rule-off', '# Off');
    await disableRule('project', 'rule-off', tempRoot);

    const rules = await discoverRuleFiles(tempRoot);
    const projectRules = rules.filter((r) => r.scope === 'project');

    expect(projectRules).toHaveLength(2);

    const on = projectRules.find((r) => r.id === 'rule-on');
    const off = projectRules.find((r) => r.id === 'rule-off');

    expect(on?.disabled).toBe(false);
    expect(off?.disabled).toBe(true);
  });
});
