/**
 * train-context.test.ts — Syntax-check fixture for tools/train-context.py.
 *
 * Runs `python -c "import ast; ast.parse(...)"` against the script to catch
 * Python syntax errors at CI time without requiring scikit-learn to be present.
 * Skips automatically when neither `python` nor `python3` is on PATH.
 */

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Python discovery — match the Windows-first pattern used in retrainTrigger.ts
// ---------------------------------------------------------------------------

function findPython(): string | null {
  for (const candidate of ['python', 'python3']) {
    try {
      const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
      if (result.status === 0) return candidate;
    } catch {
      // not on PATH
    }
  }
  return null;
}

const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'tools', 'train-context.py');
const FIXTURES_DIR = path.join(REPO_ROOT, 'tools', '__fixtures__', 'train-context');
const DECISIONS_FIXTURE = path.join(FIXTURES_DIR, 'decisions.jsonl');
const OUTCOMES_FIXTURE = path.join(FIXTURES_DIR, 'outcomes.jsonl');

let pythonBin: string | null = null;

beforeAll(() => {
  pythonBin = findPython();
});

// ---------------------------------------------------------------------------
// Syntax check
// ---------------------------------------------------------------------------

describe('train-context.py syntax', () => {
  it('parses without errors', () => {
    if (!pythonBin) {
      console.warn('Python not found on PATH — skipping syntax check');
      return;
    }

    const src = readFileSync(SCRIPT_PATH, 'utf8');
    // Escape single quotes and backslashes for the inline Python expression
    const escaped = src.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const pyExpr = `import ast, sys; ast.parse('''${escaped}''')`;

    let errorDetail = '';
    try {
      spawnSync(pythonBin, ['-c', pyExpr], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err) {
      errorDetail = String(err);
    }

    // Use execSync for better error capture
    let syntaxError: string | null = null;
    try {
      execSync(
        `${pythonBin} -c "import ast; src=open(r'${SCRIPT_PATH.replace(/\\/g, '/')}').read(); ast.parse(src)"`,
        { encoding: 'utf8', stdio: 'pipe' },
      );
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
      syntaxError = e.stderr ?? e.message ?? String(err);
    }

    if (syntaxError) {
      throw new Error(`Python syntax error in train-context.py:\n${syntaxError}`);
    }

    expect(errorDetail).toBe('');
  });
});

// ---------------------------------------------------------------------------
// --help smoke test
// ---------------------------------------------------------------------------

describe('train-context.py --help', () => {
  it('exits 0 and prints usage', () => {
    if (!pythonBin) {
      console.warn('Python not found on PATH — skipping --help test');
      return;
    }

    const result = spawnSync(pythonBin, [SCRIPT_PATH, '--help'], {
      encoding: 'utf8',
      stdio: 'pipe',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--decisions');
    expect(result.stdout).toContain('--outcomes');
    expect(result.stdout).toContain('--out');
  });
});

// ---------------------------------------------------------------------------
// End-to-end fixture run
// ---------------------------------------------------------------------------

describe('train-context.py end-to-end', () => {
  it('produces valid weights JSON from fixture data', () => {
    if (!pythonBin) {
      console.warn('Python not found on PATH — skipping end-to-end test');
      return;
    }

    // Check scikit-learn is available before attempting full run
    const skCheck = spawnSync(
      pythonBin,
      ['-c', 'import sklearn, numpy'],
      { encoding: 'utf8', stdio: 'pipe' },
    );
    if (skCheck.status !== 0) {
      console.warn('scikit-learn/numpy not available — skipping end-to-end test');
      return;
    }

    const outPath = path.join(FIXTURES_DIR, 'test-output-weights.json');
    const result = spawnSync(
      pythonBin,
      [
        SCRIPT_PATH,
        '--decisions', DECISIONS_FIXTURE,
        '--outcomes', OUTCOMES_FIXTURE,
        '--out', outPath,
        '--min-samples', '5',
      ],
      { encoding: 'utf8', stdio: 'pipe' },
    );

    if (result.status !== 0) {
      throw new Error(
        `train-context.py exited ${result.status ?? 'null'}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      );
    }

    // Stdout must contain the one-line summary parseable by retrainTrigger
    expect(result.stdout).toMatch(/trained samples=\d+ auc=[\d.]+ version=\S+/);

    // Output JSON must be valid and match the expected schema
    const weights = JSON.parse(readFileSync(outPath, 'utf8')) as Record<string, unknown>;
    expect(typeof weights.version).toBe('string');
    expect(Array.isArray(weights.featureOrder)).toBe(true);
    expect(Array.isArray(weights.weights)).toBe(true);
    expect(typeof weights.bias).toBe('number');

    const metrics = weights.metrics as Record<string, unknown>;
    expect(typeof metrics.samples).toBe('number');
    expect(typeof metrics.syntheticNegatives).toBe('number');
    expect(typeof metrics.heldOutAuc).toBe('number');
    expect(typeof metrics.trainedAt).toBe('string');
    expect(typeof metrics.belowMinSamples).toBe('boolean');
    expect(typeof (metrics.classBalance as Record<string, unknown>).pos).toBe('number');

    // featureOrder must include the canonical names
    const featureOrder = weights.featureOrder as string[];
    expect(featureOrder).toContain('recencyScore');
    expect(featureOrder).toContain('pagerankScore');
    expect(featureOrder).toContain('toolKindHint_edit');

    // weights array length must match featureOrder
    expect((weights.weights as unknown[]).length).toBe(featureOrder.length);
  });
});
