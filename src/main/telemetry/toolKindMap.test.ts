/**
 * toolKindMap.test.ts — Smoke tests for deriveResearchToolKind.
 */

import { describe, expect, it } from 'vitest';

import { deriveResearchToolKind } from './toolKindMap';

describe('deriveResearchToolKind', () => {
  it('returns "edit" for Edit', () => {
    expect(deriveResearchToolKind('Edit')).toBe('edit');
  });

  it('returns "edit" for MultiEdit', () => {
    expect(deriveResearchToolKind('MultiEdit')).toBe('edit');
  });

  it('returns "edit" for ApplyPatch', () => {
    expect(deriveResearchToolKind('ApplyPatch')).toBe('edit');
  });

  it('returns "edit" for edit_file', () => {
    expect(deriveResearchToolKind('edit_file')).toBe('edit');
  });

  it('returns "write" for Write', () => {
    expect(deriveResearchToolKind('Write')).toBe('write');
  });

  it('returns "write" for Create', () => {
    expect(deriveResearchToolKind('Create')).toBe('write');
  });

  it('returns "write" for write_file', () => {
    expect(deriveResearchToolKind('write_file')).toBe('write');
  });

  it('returns "read" for Read', () => {
    expect(deriveResearchToolKind('Read')).toBe('read');
  });

  it('returns "read" for Grep', () => {
    expect(deriveResearchToolKind('Grep')).toBe('read');
  });

  it('returns "read" for Glob', () => {
    expect(deriveResearchToolKind('Glob')).toBe('read');
  });

  it('returns "read" for read_file', () => {
    expect(deriveResearchToolKind('read_file')).toBe('read');
  });

  it('returns "read" for view_file', () => {
    expect(deriveResearchToolKind('view_file')).toBe('read');
  });

  it('returns "other" for unknown tool names', () => {
    expect(deriveResearchToolKind('Bash')).toBe('other');
    expect(deriveResearchToolKind('WebSearch')).toBe('other');
    expect(deriveResearchToolKind('unknown')).toBe('other');
  });

  it('returns "other" for undefined', () => {
    expect(deriveResearchToolKind(undefined)).toBe('other');
  });

  it('returns "other" for empty string', () => {
    expect(deriveResearchToolKind('')).toBe('other');
  });
});
