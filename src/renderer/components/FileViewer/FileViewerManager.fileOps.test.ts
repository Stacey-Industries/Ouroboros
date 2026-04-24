/**
 * FileViewerManager.fileOps.test.ts — smoke tests for fileOps exports.
 */

import { describe, expect, it } from 'vitest';

import {
  commitOpenFileResult,
  DEFAULT_SPLIT_STATE,
  markChangedFile,
  markDeletedFile,
  primeOpenFile,
  readTextFile,
  reloadFileContent,
} from './FileViewerManager.fileOps';

describe('FileViewerManager.fileOps exports', () => {
  it('exports primeOpenFile as a function', () => {
    expect(typeof primeOpenFile).toBe('function');
  });

  it('exports readTextFile as a function', () => {
    expect(typeof readTextFile).toBe('function');
  });

  it('exports commitOpenFileResult as a function', () => {
    expect(typeof commitOpenFileResult).toBe('function');
  });

  it('exports markChangedFile as a function', () => {
    expect(typeof markChangedFile).toBe('function');
  });

  it('exports markDeletedFile as a function', () => {
    expect(typeof markDeletedFile).toBe('function');
  });

  it('exports reloadFileContent as a function', () => {
    expect(typeof reloadFileContent).toBe('function');
  });

  it('exports DEFAULT_SPLIT_STATE with expected shape', () => {
    expect(DEFAULT_SPLIT_STATE.isSplit).toBe(false);
    expect(DEFAULT_SPLIT_STATE.activeSplit).toBe('left');
    expect(DEFAULT_SPLIT_STATE.rightFilePath).toBeNull();
    expect(DEFAULT_SPLIT_STATE.splitRatio).toBe(0.5);
  });
});
