import type { ExtractedSymbol, ModuleSymbolExtraction } from './symbolExtractorTypes'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SymbolIndexEntry {
  name: string
  kind: ExtractedSymbol['kind']
  signature: string | null
  moduleId: string
  modulePath: string
  filePath: string
  line: number
}

// ---------------------------------------------------------------------------
// SymbolIndex
// ---------------------------------------------------------------------------

export class SymbolIndex {
  private entries: SymbolIndexEntry[] = []

  /**
   * Build the index from an array of module symbol extractions.
   * Replaces any previously built data.
   */
  build(extractions: ModuleSymbolExtraction[]): void {
    this.entries = []
    for (const extraction of extractions) {
      for (const symbol of extraction.symbols) {
        this.entries.push({
          name: symbol.name,
          kind: symbol.kind,
          signature: symbol.signature,
          moduleId: extraction.moduleId,
          modulePath: extraction.moduleId,  // moduleId is used as path key
          filePath: '',  // populated if FileSymbolExtraction is available
          line: symbol.line,
        })
      }
    }
  }

  /**
   * Find symbols whose name contains the query string (case-insensitive).
   *
   * @param query - Substring to search for
   * @param limit - Maximum number of results (default: 20)
   */
  searchByName(query: string, limit = 20): SymbolIndexEntry[] {
    const lower = query.toLowerCase()
    const results: SymbolIndexEntry[] = []
    for (const entry of this.entries) {
      if (entry.name.toLowerCase().includes(lower)) {
        results.push(entry)
        if (results.length >= limit) break
      }
    }
    return results
  }

  /**
   * Get all symbols belonging to a specific module.
   *
   * @param moduleId - The module ID to look up
   */
  getModuleSymbols(moduleId: string): SymbolIndexEntry[] {
    return this.entries.filter(e => e.moduleId === moduleId)
  }

  /**
   * Total number of symbols in the index.
   */
  get size(): number {
    return this.entries.length
  }
}
