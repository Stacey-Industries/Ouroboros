/**
 * contextOutcomeObserverSupport.test.ts — Unit tests for deriveToolKind and
 * buildOutcomeBase helpers.
 */

import { describe, expect, it } from 'vitest';

import { buildOutcomeBase, deriveToolKind } from './contextOutcomeObserverSupport';

// ─── deriveToolKind ───────────────────────────────────────────────────────────

describe('deriveToolKind', () => {
  it('maps Edit → edit', () => expect(deriveToolKind('Edit')).toBe('edit'));
  it('maps MultiEdit → edit', () => expect(deriveToolKind('MultiEdit')).toBe('edit'));
  it('maps ApplyPatch → edit', () => expect(deriveToolKind('ApplyPatch')).toBe('edit'));
  it('maps edit_file → edit', () => expect(deriveToolKind('edit_file')).toBe('edit'));

  it('maps Write → write', () => expect(deriveToolKind('Write')).toBe('write'));
  it('maps Create → write', () => expect(deriveToolKind('Create')).toBe('write'));
  it('maps write_file → write', () => expect(deriveToolKind('write_file')).toBe('write'));

  it('maps Read → read', () => expect(deriveToolKind('Read')).toBe('read'));
  it('maps Grep → read', () => expect(deriveToolKind('Grep')).toBe('read'));
  it('maps Glob → read', () => expect(deriveToolKind('Glob')).toBe('read'));
  it('maps read_file → read', () => expect(deriveToolKind('read_file')).toBe('read'));
  it('maps view_file → read', () => expect(deriveToolKind('view_file')).toBe('read'));

  it('maps unknown tool → other', () => expect(deriveToolKind('Bash')).toBe('other'));
  it('maps undefined → other', () => expect(deriveToolKind(undefined)).toBe('other'));
  it('maps empty string → other', () => expect(deriveToolKind('')).toBe('other'));
});

// ─── buildOutcomeBase ─────────────────────────────────────────────────────────

describe('buildOutcomeBase', () => {
  it('returns required fields on a used outcome', () => {
    const base = buildOutcomeBase({
      rawPath: '/workspace/project/src/a.ts',
      workspaceRoot: '/workspace/project',
      traceId: 'trace-1',
      sessionId: 'sess-1',
      kind: 'used',
      toolUsed: 'Edit',
    });

    expect(base.traceId).toBe('trace-1');
    expect(base.sessionId).toBe('sess-1');
    expect(base.kind).toBe('used');
    expect(base.toolKind).toBe('edit');
    expect(base.toolUsed).toBe('Edit');
    expect(base.schemaVersion).toBe(2);
    expect(typeof base.timestamp).toBe('number');
    expect(base.timestamp).toBeGreaterThan(0);
  });

  it('normalises fileId using the workspace root', () => {
    const base = buildOutcomeBase({
      rawPath: 'C:\\workspace\\project\\src\\b.ts',
      workspaceRoot: 'C:\\workspace\\project',
      traceId: 'trace-2',
      sessionId: 'sess-2',
      kind: 'missed',
      toolUsed: 'Read',
    });

    expect(base.fileId).toBe('src/b.ts');
    expect(base.toolKind).toBe('read');
  });

  it('sets toolKind=other when toolUsed is undefined', () => {
    const base = buildOutcomeBase({
      rawPath: '/workspace/project/src/c.ts',
      workspaceRoot: '/workspace/project',
      traceId: 'trace-3',
      sessionId: 'sess-3',
      kind: 'unused',
    });

    expect(base.toolKind).toBe('other');
    expect(base.toolUsed).toBeUndefined();
  });

  it('produces identical fileId for the same path in Windows and Unix form', () => {
    const root = 'C:/workspace/project';
    const win = buildOutcomeBase({
      rawPath: 'C:\\workspace\\project\\src\\d.ts',
      workspaceRoot: root,
      traceId: 't',
      sessionId: 's',
      kind: 'used',
      toolUsed: 'Write',
    });
    const unix = buildOutcomeBase({
      rawPath: 'C:/workspace/project/src/d.ts',
      workspaceRoot: root,
      traceId: 't',
      sessionId: 's',
      kind: 'used',
      toolUsed: 'Write',
    });

    expect(win.fileId).toBe(unix.fileId);
  });
});
