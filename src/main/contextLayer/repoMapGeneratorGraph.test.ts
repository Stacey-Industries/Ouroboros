import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GraphControllerLike } from '../codebaseGraph/graphControllerSupport';
import type { ModuleExport } from './contextLayerTypes';

// Mock the graph controller support module
vi.mock('../codebaseGraph/graphControllerSupport', () => ({
  getGraphController: vi.fn(),
}));

import { getGraphController } from '../codebaseGraph/graphControllerSupport';
import { queryModuleExports } from './repoMapGeneratorGraph';

const mockedGetGraphController = vi.mocked(getGraphController);

function makeCtrl(rows: Array<Record<string, unknown>>): GraphControllerLike {
  return { queryGraph: vi.fn().mockReturnValue(rows) } as unknown as GraphControllerLike;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('queryModuleExports', () => {
  it('returns empty array when graph controller is null (soft-fallback)', async () => {
    mockedGetGraphController.mockReturnValue(null);

    const result = await queryModuleExports('src/main/contextLayer');

    expect(result).toEqual([]);
  });

  it('happy path — maps three rows (Class, Function, Method) to ModuleExport[]', async () => {
    const rows = [
      { n_name: 'MyClass', n_signature: '(id: string): MyClass', kind: 'Class' },
      { n_name: 'myFunc', n_signature: '(a: number): void', kind: 'Function' },
      { n_name: 'myMethod', n_signature: '(): string', kind: 'Method' },
    ];
    mockedGetGraphController.mockReturnValue(makeCtrl(rows));

    const result = await queryModuleExports('src/main/foo');

    expect(result).toHaveLength(3);

    const cls = result.find((e) => e.name === 'MyClass');
    expect(cls).toEqual<ModuleExport>({
      name: 'MyClass',
      signature: '(id: string): MyClass',
      kind: 'Class',
    });

    const fn = result.find((e) => e.name === 'myFunc');
    expect(fn).toEqual<ModuleExport>({
      name: 'myFunc',
      signature: '(a: number): void',
      kind: 'Function',
    });

    const method = result.find((e) => e.name === 'myMethod');
    expect(method).toEqual<ModuleExport>({
      name: 'myMethod',
      signature: '(): string',
      kind: 'Method',
    });
  });

  it('preserves null signature when row has no signature value', async () => {
    const rows = [{ n_name: 'noSig', n_signature: null, kind: 'Function' }];
    mockedGetGraphController.mockReturnValue(makeCtrl(rows));

    const result = await queryModuleExports('src/main/bar');

    expect(result).toHaveLength(1);
    expect(result[0].signature).toBeNull();
    expect(result[0].name).toBe('noSig');
  });

  it('preserves null signature when signature is empty string', async () => {
    const rows = [{ n_name: 'emptySig', n_signature: '', kind: 'Method' }];
    mockedGetGraphController.mockReturnValue(makeCtrl(rows));

    const result = await queryModuleExports('src/main/baz');

    expect(result[0].signature).toBeNull();
  });

  it('skips rows with missing or empty name', async () => {
    const rows = [
      { n_name: '', n_signature: '(): void', kind: 'Function' },
      { n_name: null, n_signature: '(): void', kind: 'Function' },
      { n_name: 'valid', n_signature: null, kind: 'Function' },
    ];
    mockedGetGraphController.mockReturnValue(makeCtrl(rows));

    const result = await queryModuleExports('src/main/skip');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('valid');
  });

  it('path escaping — single quote in path does not throw', async () => {
    mockedGetGraphController.mockReturnValue(makeCtrl([]));

    await expect(queryModuleExports("src/main/it's-special")).resolves.toEqual([]);
  });

  it('path escaping — single quote is doubled in the Cypher query', async () => {
    const ctrl = makeCtrl([]);
    mockedGetGraphController.mockReturnValue(ctrl);

    await queryModuleExports("src/main/o'malley");

    const calledQuery = vi.mocked(ctrl.queryGraph).mock.calls[0][0] as string;
    expect(calledQuery).toContain("'src/main/o''malley'");
    expect(calledQuery).not.toContain("'src/main/o'malley'");
  });

  it('returns empty array when queryGraph throws', async () => {
    const ctrl = {
      queryGraph: vi.fn().mockImplementation(() => {
        throw new Error('db error');
      }),
    } as unknown as GraphControllerLike;
    mockedGetGraphController.mockReturnValue(ctrl);

    await expect(queryModuleExports('src/main/err')).resolves.toEqual([]);
  });

  it('defaults unknown kind to Function', async () => {
    const rows = [{ n_name: 'weirdKind', n_signature: null, kind: 'Interface' }];
    mockedGetGraphController.mockReturnValue(makeCtrl(rows));

    const result = await queryModuleExports('src/main/types');

    expect(result[0].kind).toBe('Function');
  });
});
