import { describe, expect,it } from 'vitest'

import { extractSymbols } from './symbolExtractor'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findSymbol(symbols: ReturnType<typeof extractSymbols>, name: string) {
  return symbols.find(s => s.name === name)
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('extractSymbols', () => {
  // 1. Simple named function export
  it('extracts a simple named function export', () => {
    const content = `export function foo(): void {\n  // ...\n}\n`
    const symbols = extractSymbols('src/foo.ts', content)
    const sym = findSymbol(symbols, 'foo')
    expect(sym).toBeDefined()
    expect(sym!.kind).toBe('function')
    expect(sym!.isDefault).toBe(false)
    expect(sym!.line).toBe(1)
  })

  // 2. Async function with parameters
  it('extracts async function with parameters and return type', () => {
    const content = `export async function bar(x: number, y: string): Promise<boolean> {\n  return true\n}\n`
    const symbols = extractSymbols('src/bar.ts', content)
    const sym = findSymbol(symbols, 'bar')
    expect(sym).toBeDefined()
    expect(sym!.kind).toBe('function')
    expect(sym!.signature).not.toBeNull()
    expect(sym!.signature).toContain('x: number')
    expect(sym!.signature).toContain('Promise<boolean>')
  })

  // 3. Export const arrow function
  it('extracts export const arrow function', () => {
    const content = `export const baz = (a: A): B => {\n  return b\n}\n`
    const symbols = extractSymbols('src/baz.ts', content)
    const sym = findSymbol(symbols, 'baz')
    expect(sym).toBeDefined()
    expect(sym!.kind).toBe('function')
    expect(sym!.signature).not.toBeNull()
    expect(sym!.signature).toContain('a: A')
  })

  // 4. Class export
  it('extracts a class export', () => {
    const content = `export class MyClass {\n  constructor() {}\n}\n`
    const symbols = extractSymbols('src/MyClass.ts', content)
    const sym = findSymbol(symbols, 'MyClass')
    expect(sym).toBeDefined()
    expect(sym!.kind).toBe('class')
    expect(sym!.signature).toBeNull()
    expect(sym!.isDefault).toBe(false)
  })

  // 5. Interface export
  it('extracts an interface export', () => {
    const content = `export interface IFoo {\n  bar: string\n}\n`
    const symbols = extractSymbols('src/IFoo.ts', content)
    const sym = findSymbol(symbols, 'IFoo')
    expect(sym).toBeDefined()
    expect(sym!.kind).toBe('interface')
    expect(sym!.signature).toBeNull()
  })

  // 6. Type alias
  it('extracts a type alias export', () => {
    const content = `export type MyType = string | number\n`
    const symbols = extractSymbols('src/types.ts', content)
    const sym = findSymbol(symbols, 'MyType')
    expect(sym).toBeDefined()
    expect(sym!.kind).toBe('type')
    expect(sym!.signature).toBeNull()
  })

  // 7. Default export function
  it('extracts a default function export', () => {
    const content = `export default function handler(req: Request): Response {\n  return new Response()\n}\n`
    const symbols = extractSymbols('src/handler.ts', content)
    const sym = findSymbol(symbols, 'handler')
    expect(sym).toBeDefined()
    expect(sym!.kind).toBe('function')
    expect(sym!.isDefault).toBe(true)
    expect(sym!.signature).toContain('req: Request')
  })

  // 8. Re-export named
  it('extracts re-exported names from another module', () => {
    const content = `export { foo, bar } from './utils'\n`
    const symbols = extractSymbols('src/index.ts', content)
    expect(findSymbol(symbols, 'foo')).toBeDefined()
    expect(findSymbol(symbols, 'bar')).toBeDefined()
    expect(findSymbol(symbols, 'foo')!.kind).toBe('unknown')
  })

  // 9. Re-export with rename
  it('extracts the new name from a renamed re-export', () => {
    const content = `export { original as renamed } from './utils'\n`
    const symbols = extractSymbols('src/index.ts', content)
    // Should export `renamed`, not `original`
    expect(findSymbol(symbols, 'renamed')).toBeDefined()
    expect(findSymbol(symbols, 'original')).toBeUndefined()
  })

  // 10. Multi-line signature
  it('handles multi-line function signatures', () => {
    const content = [
      'export function multiLine(',
      '  arg1: string,',
      '  arg2: number,',
      '  arg3: boolean',
      '): void {',
      '  // body',
      '}',
    ].join('\n')
    const symbols = extractSymbols('src/multiLine.ts', content)
    const sym = findSymbol(symbols, 'multiLine')
    expect(sym).toBeDefined()
    expect(sym!.kind).toBe('function')
    expect(sym!.signature).not.toBeNull()
    expect(sym!.signature).toContain('arg1: string')
    expect(sym!.signature).toContain('arg2: number')
  })

  // 11. Generic function
  it('includes generic type parameters in the signature', () => {
    const content = `export function map<T, U>(arr: T[], fn: (x: T) => U): U[] {\n  return arr.map(fn)\n}\n`
    const symbols = extractSymbols('src/map.ts', content)
    const sym = findSymbol(symbols, 'map')
    expect(sym).toBeDefined()
    expect(sym!.kind).toBe('function')
    expect(sym!.signature).not.toBeNull()
    // The signature should capture the parameter list
    expect(sym!.signature).toContain('arr: T[]')
  })

  // 12. Decorator before class
  it('extracts class name even when preceded by a decorator', () => {
    const content = `@Component()\nexport class Foo {\n  // ...\n}\n`
    const symbols = extractSymbols('src/Foo.ts', content)
    // The decorator line is skipped; the export class line is processed
    const sym = findSymbol(symbols, 'Foo')
    expect(sym).toBeDefined()
    expect(sym!.kind).toBe('class')
  })

  // 13. .d.ts file — should return empty array
  it('returns empty array for .d.ts files', () => {
    const content = `export declare function foo(): void\nexport declare class Bar {}\n`
    const symbols = extractSymbols('src/types.d.ts', content)
    expect(symbols).toEqual([])
  })

  // 14. Test file — symbols are still extracted (not skipped at extractor level)
  it('extracts symbols from test files (caller decides whether to include)', () => {
    const content = `export function helperForTest(x: number): number {\n  return x * 2\n}\n`
    const symbols = extractSymbols('src/utils.test.ts', content)
    // The extractor itself does not skip test files — the caller (moduleSummarizer) filters them
    const sym = findSymbol(symbols, 'helperForTest')
    expect(sym).toBeDefined()
    expect(sym!.kind).toBe('function')
  })

  // Additional: enum export
  it('extracts an enum export', () => {
    const content = `export enum Status {\n  Active = 'active',\n  Inactive = 'inactive'\n}\n`
    const symbols = extractSymbols('src/status.ts', content)
    const sym = findSymbol(symbols, 'Status')
    expect(sym).toBeDefined()
    expect(sym!.kind).toBe('enum')
  })

  // Additional: abstract class
  it('extracts an abstract class export', () => {
    const content = `export abstract class BaseService {\n  abstract doWork(): void\n}\n`
    const symbols = extractSymbols('src/BaseService.ts', content)
    const sym = findSymbol(symbols, 'BaseService')
    expect(sym).toBeDefined()
    expect(sym!.kind).toBe('class')
  })

  // Additional: namespace re-export is skipped
  it('skips namespace re-exports (export * from)', () => {
    const content = `export * from './utils'\n`
    const symbols = extractSymbols('src/index.ts', content)
    expect(symbols).toHaveLength(0)
  })

  // Additional: signature is truncated to 120 chars
  it('truncates very long signatures to 120 characters', () => {
    const longParams = Array.from({ length: 10 }, (_, i) => `param${i}: VeryLongTypeName${i}`).join(', ')
    const content = `export function longSig(${longParams}): void {}\n`
    const symbols = extractSymbols('src/longSig.ts', content)
    const sym = findSymbol(symbols, 'longSig')
    expect(sym).toBeDefined()
    expect(sym!.signature).not.toBeNull()
    expect(sym!.signature!.length).toBeLessThanOrEqual(120)
  })

  // Additional: files over 500KB are skipped
  it('returns empty array for files over 500KB', () => {
    const bigContent = 'x'.repeat(501 * 1024)
    const symbols = extractSymbols('src/big.ts', bigContent)
    expect(symbols).toEqual([])
  })
})
