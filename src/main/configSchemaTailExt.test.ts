/**
 * configSchemaTailExt.test.ts — Smoke tests for configSchemaTailExt.ts.
 *
 * Verifies that tailSchemaExt exports all expected top-level keys and that
 * spot-checked entries have the correct type and default values.
 */

import { describe, expect, it } from 'vitest';

import { tailSchemaExt } from './configSchemaTailExt';

// ── Key presence ────────────────────────────────────────────────────────────

describe('tailSchemaExt — top-level keys', () => {
  const EXPECTED_KEYS = [
    'mobileAccess',
    'sessionDispatch',
    'context',
    'theming',
    'providers',
    'ecosystem',
    'marketplace',
    'platform',
  ] as const;

  for (const key of EXPECTED_KEYS) {
    it(`exports "${key}"`, () => {
      expect(tailSchemaExt).toHaveProperty(key);
    });
  }
});

// ── mobileAccess ─────────────────────────────────────────────────────────────

describe('tailSchemaExt — mobileAccess', () => {
  it('is an object schema', () => {
    expect(tailSchemaExt.mobileAccess.type).toBe('object');
  });

  it('default has enabled: false', () => {
    expect((tailSchemaExt.mobileAccess.default as Record<string, unknown>).enabled).toBe(false);
  });

  it('default has pairedDevices: []', () => {
    expect((tailSchemaExt.mobileAccess.default as Record<string, unknown>).pairedDevices).toEqual([]);
  });
});

// ── sessionDispatch ──────────────────────────────────────────────────────────

describe('tailSchemaExt — sessionDispatch', () => {
  it('default has enabled: false', () => {
    expect((tailSchemaExt.sessionDispatch.default as Record<string, unknown>).enabled).toBe(false);
  });

  it('default has maxConcurrent: 1', () => {
    expect((tailSchemaExt.sessionDispatch.default as Record<string, unknown>).maxConcurrent).toBe(1);
  });
});

// ── context ──────────────────────────────────────────────────────────────────

describe('tailSchemaExt — context', () => {
  it('default has provenanceWeights: true', () => {
    expect((tailSchemaExt.context.default as Record<string, unknown>).provenanceWeights).toBe(true);
  });

  it('default has pagerank: true', () => {
    expect((tailSchemaExt.context.default as Record<string, unknown>).pagerank).toBe(true);
  });

  it('default has packetMode: full', () => {
    expect((tailSchemaExt.context.default as Record<string, unknown>).packetMode).toBe('full');
  });
});

// ── ecosystem ────────────────────────────────────────────────────────────────

describe('tailSchemaExt — ecosystem', () => {
  it('has rulesAndSkillsInstallEnabled property defaulting to false', () => {
    const props = tailSchemaExt.ecosystem.properties as Record<string, Record<string, unknown>>;
    expect(props.rulesAndSkillsInstallEnabled.default).toBe(false);
  });

  it('has codexAppServerTransport property defaulting to true', () => {
    const props = tailSchemaExt.ecosystem.properties as Record<string, Record<string, unknown>>;
    expect(props.codexAppServerTransport.default).toBe(true);
  });
});

// ── marketplace ──────────────────────────────────────────────────────────────

describe('tailSchemaExt — marketplace', () => {
  it('default has allowInstallOnRevocationFetchFailure: false', () => {
    const d = tailSchemaExt.marketplace.default as Record<string, unknown>;
    expect(d.allowInstallOnRevocationFetchFailure).toBe(false);
  });
});

// ── platform ─────────────────────────────────────────────────────────────────

describe('tailSchemaExt — platform', () => {
  it('has language enum with en and es', () => {
    const props = tailSchemaExt.platform.properties as Record<string, Record<string, unknown>>;
    expect(props.language.enum).toContain('en');
    expect(props.language.enum).toContain('es');
  });

  it('crashReports default has allowInsecure: false', () => {
    const props = tailSchemaExt.platform.properties as Record<string, Record<string, unknown>>;
    const crashDefault = props.crashReports.default as Record<string, unknown>;
    expect(crashDefault.allowInsecure).toBe(false);
  });
});

// ── providers ────────────────────────────────────────────────────────────────

describe('tailSchemaExt — providers', () => {
  it('default has multiProvider: false', () => {
    expect((tailSchemaExt.providers.default as Record<string, unknown>).multiProvider).toBe(false);
  });
});
