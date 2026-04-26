import { describe, expect, it } from 'vitest';

import {
  buildOrderBy,
  buildWhereExpression,
  cypherOpToSql,
  isWriteQuery,
  mergeCondition,
  pushWhereParam,
  resolveColumn,
  sanitizeIdentifier,
} from './cypherEngineSqlHelpers';

describe('cypherEngineSqlHelpers', () => {
  describe('resolveColumn', () => {
    it('maps known property names to SQL columns', () => {
      expect(resolveColumn('name')).toBe('name');
      expect(resolveColumn('file_path')).toBe('file_path');
    });

    it('returns the property name unchanged for unknown properties', () => {
      expect(resolveColumn('unknown_prop')).toBe('unknown_prop');
    });
  });

  describe('cypherOpToSql', () => {
    it('maps CONTAINS to LIKE', () => {
      expect(cypherOpToSql('CONTAINS')).toBe('LIKE');
    });

    it('maps STARTS WITH to LIKE', () => {
      expect(cypherOpToSql('STARTS WITH')).toBe('LIKE');
    });

    it('maps ENDS WITH to LIKE', () => {
      expect(cypherOpToSql('ENDS WITH')).toBe('LIKE');
    });

    it('maps = to =', () => {
      expect(cypherOpToSql('=')).toBe('=');
    });

    it('maps <> to <>', () => {
      expect(cypherOpToSql('<>')).toBe('<>');
    });

    it('maps comparison operators correctly', () => {
      expect(cypherOpToSql('>')).toBe('>');
      expect(cypherOpToSql('<')).toBe('<');
      expect(cypherOpToSql('>=')).toBe('>=');
      expect(cypherOpToSql('<=')).toBe('<=');
    });

    it('defaults unknown operators to =', () => {
      expect(cypherOpToSql('INVALID')).toBe('=');
    });
  });

  describe('buildOrderBy', () => {
    it('returns empty string for empty array', () => {
      expect(buildOrderBy([])).toBe('');
    });

    it('builds ORDER BY clause for single field', () => {
      const result = buildOrderBy([{ alias: 'n', property: 'name', direction: 'ASC' }]);
      expect(result).toBe('n.name ASC');
    });

    it('builds ORDER BY clause for multiple fields', () => {
      const result = buildOrderBy([
        { alias: 'n', property: 'name', direction: 'ASC' },
        { alias: 'm', property: 'file_path', direction: 'DESC' },
      ]);
      expect(result).toBe('n.name ASC, m.file_path DESC');
    });
  });

  describe('buildWhereExpression', () => {
    it('returns column ref for known schema properties', () => {
      const result = buildWhereExpression('name', 'n', 'n.name');
      expect(result).toBe('n.name');
    });

    it('returns json_extract for unknown properties', () => {
      const result = buildWhereExpression('custom_prop', 'n', 'n.custom_prop');
      expect(result).toBe("json_extract(n.props, '$.custom_prop')");
    });
  });

  describe('mergeCondition', () => {
    it('appends condition with AND by default', () => {
      const conditions: string[] = ['a = 1'];
      mergeCondition(conditions, 'b = 2', 'AND');
      expect(conditions).toEqual(['a = 1', 'b = 2']);
    });

    it('collapses OR pairs into parenthesized expression', () => {
      const conditions: string[] = ['a = 1'];
      mergeCondition(conditions, 'b = 2', 'OR');
      expect(conditions).toEqual(['(a = 1 OR b = 2)']);
    });

    it('appends condition when prevConjunction is null', () => {
      const conditions: string[] = [];
      mergeCondition(conditions, 'a = 1', null);
      expect(conditions).toEqual(['a = 1']);
    });
  });

  describe('pushWhereParam', () => {
    it('wraps CONTAINS value with % on both sides', () => {
      const params: unknown[] = [];
      pushWhereParam(params, { alias: 'n', property: 'name', operator: 'CONTAINS', value: 'foo', conjunction: null });
      expect(params).toEqual(['%foo%']);
    });

    it('wraps STARTS WITH value with trailing %', () => {
      const params: unknown[] = [];
      pushWhereParam(params, {
        alias: 'n',
        property: 'name',
        operator: 'STARTS WITH',
        value: 'foo',
        conjunction: null,
      });
      expect(params).toEqual(['foo%']);
    });

    it('wraps ENDS WITH value with leading %', () => {
      const params: unknown[] = [];
      pushWhereParam(params, {
        alias: 'n',
        property: 'name',
        operator: 'ENDS WITH',
        value: 'foo',
        conjunction: null,
      });
      expect(params).toEqual(['%foo']);
    });

    it('passes through value unchanged for equality operators', () => {
      const params: unknown[] = [];
      pushWhereParam(params, { alias: 'n', property: 'name', operator: '=', value: 'foo', conjunction: null });
      expect(params).toEqual(['foo']);
    });
  });

  describe('isWriteQuery', () => {
    it('identifies CREATE as a write query', () => {
      expect(isWriteQuery('CREATE (n:Node)')).toBe(true);
    });

    it('identifies DELETE as a write query', () => {
      expect(isWriteQuery('DELETE n')).toBe(true);
    });

    it('identifies MERGE as a write query', () => {
      expect(isWriteQuery('MERGE (n:Node {id: 1})')).toBe(true);
    });

    it('allows MATCH queries', () => {
      expect(isWriteQuery('MATCH (n:Node) RETURN n')).toBe(false);
    });
  });

  describe('sanitizeIdentifier', () => {
    it('strips non-alphanumeric/underscore characters', () => {
      expect(sanitizeIdentifier('CALLS')).toBe('CALLS');
      expect(sanitizeIdentifier('IMPORT_FROM')).toBe('IMPORT_FROM');
    });

    it('removes special characters', () => {
      expect(sanitizeIdentifier("'; DROP TABLE")).toBe('DROP TABLE'.replace(' ', ''));
    });
  });
});
