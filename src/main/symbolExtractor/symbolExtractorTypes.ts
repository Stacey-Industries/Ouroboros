export interface ExtractedSymbol {
  name: string
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'enum' | 'unknown'
  signature: string | null  // e.g. "(options: BuildOptions): Promise<Result>" or null
  isDefault: boolean
  line: number
}

export interface FileSymbolExtraction {
  filePath: string
  relativePath: string
  symbols: ExtractedSymbol[]
  extractedAt: number
}

export interface ModuleSymbolExtraction {
  moduleId: string
  symbols: ExtractedSymbol[]    // deduplicated across all files in module
  extractedAt: number
}
