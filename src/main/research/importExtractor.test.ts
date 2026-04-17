/**
 * importExtractor.test.ts — Unit tests for importExtractor.ts
 *
 * Wave 30 Phase D.
 */

import { describe, expect, it } from 'vitest';

import { extractImports } from './importExtractor';

describe('extractImports', () => {
  it('returns empty array for empty source', () => {
    expect(extractImports('')).toEqual([]);
  });

  it('handles static import default', () => {
    const src = `import React from 'react';`;
    expect(extractImports(src)).toContain('react');
  });

  it('handles static import named', () => {
    const src = `import { useState, useEffect } from 'react';`;
    expect(extractImports(src)).toContain('react');
  });

  it('handles side-effect import', () => {
    const src = `import 'next/server';`;
    expect(extractImports(src)).toContain('next/server');
  });

  it('handles namespace import', () => {
    const src = `import * as path from 'node:path';`;
    expect(extractImports(src)).toContain('node:path');
  });

  it('handles scoped package', () => {
    const src = `import { z } from '@scope/pkg';`;
    expect(extractImports(src)).toContain('@scope/pkg');
  });

  it('handles re-export from', () => {
    const src = `export { foo } from 'some-lib';`;
    expect(extractImports(src)).toContain('some-lib');
  });

  it('handles require() single-quoted', () => {
    const src = `const x = require('lodash');`;
    expect(extractImports(src)).toContain('lodash');
  });

  it('handles require() double-quoted', () => {
    const src = `const x = require("express");`;
    expect(extractImports(src)).toContain('express');
  });

  it('deduplication is left to callers — duplicates preserved', () => {
    const src = `import 'zod';\nimport 'zod';`;
    const results = extractImports(src);
    expect(results.filter((s) => s === 'zod').length).toBeGreaterThanOrEqual(2);
  });

  it('handles multiple imports in one file', () => {
    const src = [
      `import React from 'react';`,
      `import { NextRequest } from 'next/server';`,
      `const db = require('better-sqlite3');`,
    ].join('\n');
    const results = extractImports(src);
    expect(results).toContain('react');
    expect(results).toContain('next/server');
    expect(results).toContain('better-sqlite3');
  });

  it('does not extract relative imports (but does not crash on them)', () => {
    const src = `import { foo } from './foo';`;
    // relative imports are valid specifiers; extractor returns them as-is
    // normalizeImportToLibrary (triggerEvaluator) filters them out
    const results = extractImports(src);
    expect(results).toContain('./foo');
  });

  it('handles double-quoted static import', () => {
    const src = `import type { Foo } from "some-types";`;
    expect(extractImports(src)).toContain('some-types');
  });
});
