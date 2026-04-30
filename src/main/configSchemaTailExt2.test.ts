/**
 * configSchemaTailExt2.test.ts — Smoke tests for configSchemaTailExt2.ts.
 *
 * Verifies that tailSchemaExt2 exports the expected top-level keys and that
 * the agentMonitor schema has the correct type and default values.
 */

import { describe, expect, it } from 'vitest';

import { tailSchemaExt2 } from './configSchemaTailExt2';

describe('tailSchemaExt2 — top-level keys', () => {
  it('exports "agentMonitor"', () => {
    expect(tailSchemaExt2).toHaveProperty('agentMonitor');
  });
});

describe('tailSchemaExt2 — agentMonitor schema', () => {
  it('is an object schema', () => {
    expect(tailSchemaExt2.agentMonitor.type).toBe('object');
  });

  it('default has subagentDisplay.diagnostics: false', () => {
    const d = tailSchemaExt2.agentMonitor.default as Record<string, unknown>;
    const sub = d.subagentDisplay as Record<string, unknown>;
    expect(sub.diagnostics).toBe(false);
  });

  it('subagentDisplay property has diagnostics defaulting to false', () => {
    const props = tailSchemaExt2.agentMonitor.properties as Record<string, Record<string, unknown>>;
    const subProps = props.subagentDisplay.properties as Record<string, Record<string, unknown>>;
    expect(subProps.diagnostics.default).toBe(false);
  });

  it('subagentDisplay property has diagnostics type boolean', () => {
    const props = tailSchemaExt2.agentMonitor.properties as Record<string, Record<string, unknown>>;
    const subProps = props.subagentDisplay.properties as Record<string, Record<string, unknown>>;
    expect(subProps.diagnostics.type).toBe('boolean');
  });
});
