import { describe, expect, it } from 'vitest';

import {
  createExcerpt,
  isInvalidPositiveLine,
  validateForm,
} from './MultiBufferAddExcerptForm.helpers';

describe('MultiBufferAddExcerptForm.helpers', () => {
  describe('isInvalidPositiveLine', () => {
    it('returns false for empty string', () => {
      expect(isInvalidPositiveLine('', NaN)).toBe(false);
    });
    it('returns true for NaN', () => {
      expect(isInvalidPositiveLine('abc', NaN)).toBe(true);
    });
    it('returns true for zero', () => {
      expect(isInvalidPositiveLine('0', 0)).toBe(true);
    });
    it('returns false for positive number', () => {
      expect(isInvalidPositiveLine('5', 5)).toBe(false);
    });
  });

  describe('validateForm', () => {
    it('returns error when filePath is empty', () => {
      const errs = validateForm('', '1', '10');
      expect(errs.filePath).not.toBeNull();
    });
    it('returns error when end < start', () => {
      const errs = validateForm('/some/file', '10', '5');
      expect(errs.endLine).not.toBeNull();
    });
    it('returns no errors for valid input', () => {
      const errs = validateForm('/some/file', '1', '10');
      expect(errs.filePath).toBeNull();
      expect(errs.startLine).toBeNull();
      expect(errs.endLine).toBeNull();
    });
  });

  describe('createExcerpt', () => {
    it('returns null for empty filePath', () => {
      expect(createExcerpt('', '1', '10', '')).toBeNull();
    });
    it('returns null when end < start', () => {
      expect(createExcerpt('/file', '10', '5', '')).toBeNull();
    });
    it('returns excerpt for valid input', () => {
      const result = createExcerpt('/file.ts', '1', '10', 'myLabel');
      expect(result).toEqual({ filePath: '/file.ts', startLine: 1, endLine: 10, label: 'myLabel' });
    });
    it('omits label when empty', () => {
      const result = createExcerpt('/file.ts', '1', '10', '');
      expect(result?.label).toBeUndefined();
    });
  });
});
