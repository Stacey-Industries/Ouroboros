import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  getStrategyForExtension,
  getStrategyForLanguage,
  getAllImportableExtensions,
  configureTypeScriptAliases,
  resolveRelativePath,
  tryMatch,
  basename,
  dirname,
} from './languageStrategies';

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

describe('resolveRelativePath', () => {
  it('resolves a sibling file', () => {
    expect(resolveRelativePath('src/a.ts', './b')).toBe('src/b');
  });

  it('resolves a parent-directory file (../)', () => {
    expect(resolveRelativePath('src/utils/helper.ts', '../core')).toBe('src/core');
  });

  it('resolves two levels up (../../)', () => {
    expect(resolveRelativePath('a/b/c.ts', '../../x')).toBe('x');
  });

  it('resolves a nested sub-path', () => {
    expect(resolveRelativePath('src/app.ts', './components/Button')).toBe(
      'src/components/Button',
    );
  });

  it('handles current-dir segment (.)', () => {
    expect(resolveRelativePath('src/a.ts', './.')).toBe('src');
  });
});

describe('tryMatch', () => {
  it('returns the path directly when it exists in knownPaths', () => {
    const known = new Set(['src/utils.ts']);
    expect(tryMatch('src/utils.ts', known, ['.js'])).toBe('src/utils.ts');
  });

  it('tries each suffix in order and returns the first match', () => {
    const known = new Set(['src/utils.tsx']);
    expect(tryMatch('src/utils', known, ['.ts', '.tsx', '.js'])).toBe('src/utils.tsx');
  });

  it('returns null when no match is found', () => {
    const known = new Set(['src/other.ts']);
    expect(tryMatch('src/utils', known, ['.ts', '.tsx'])).toBeNull();
  });
});

describe('basename', () => {
  it('returns the last segment of a path', () => {
    expect(basename('src/components/Button.tsx')).toBe('Button.tsx');
  });

  it('handles a plain filename with no directory', () => {
    expect(basename('index.ts')).toBe('index.ts');
  });
});

describe('dirname', () => {
  it('returns the directory portion of a path', () => {
    expect(dirname('src/components/Button.tsx')).toBe('src/components');
  });

  it('returns empty string for a top-level file', () => {
    expect(dirname('index.ts')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('getStrategyForExtension', () => {
  it('returns typescript-javascript strategy for .ts', () => {
    const s = getStrategyForExtension('.ts');
    expect(s?.language).toBe('typescript-javascript');
  });

  it('returns typescript-javascript strategy for .tsx', () => {
    expect(getStrategyForExtension('.tsx')?.language).toBe('typescript-javascript');
  });

  it('returns typescript-javascript strategy for .js and .jsx', () => {
    expect(getStrategyForExtension('.js')?.language).toBe('typescript-javascript');
    expect(getStrategyForExtension('.jsx')?.language).toBe('typescript-javascript');
  });

  it('returns python strategy for .py', () => {
    expect(getStrategyForExtension('.py')?.language).toBe('python');
  });

  it('returns go strategy for .go', () => {
    expect(getStrategyForExtension('.go')?.language).toBe('go');
  });

  it('returns rust strategy for .rs', () => {
    expect(getStrategyForExtension('.rs')?.language).toBe('rust');
  });

  it('returns null for unsupported extension', () => {
    expect(getStrategyForExtension('.unknown')).toBeNull();
    expect(getStrategyForExtension('.md')).toBeNull();
  });
});

describe('getStrategyForLanguage', () => {
  it('looks up by language name', () => {
    expect(getStrategyForLanguage('python')?.extensions).toContain('.py');
    expect(getStrategyForLanguage('go')?.extensions).toContain('.go');
  });

  it('returns null for unknown language', () => {
    expect(getStrategyForLanguage('cobol')).toBeNull();
  });
});

describe('getAllImportableExtensions', () => {
  it('includes all major languages', () => {
    const exts = getAllImportableExtensions();
    for (const ext of ['.ts', '.tsx', '.js', '.py', '.go', '.rs', '.java', '.kt', '.cs', '.rb', '.php']) {
      expect(exts.has(ext)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// TypeScript / JavaScript strategy
// ---------------------------------------------------------------------------

describe('TypeScript/JavaScript — extractImports', () => {
  const strategy = getStrategyForExtension('.ts')!;

  it('extracts named imports', () => {
    const content = `import { foo, bar } from './utils';`;
    expect(strategy.extractImports(content)).toContain('./utils');
  });

  it('extracts default imports', () => {
    const content = `import React from 'react';`;
    expect(strategy.extractImports(content)).toContain('react');
  });

  it('extracts type imports', () => {
    const content = `import type { Foo } from './types';`;
    expect(strategy.extractImports(content)).toContain('./types');
  });

  it('extracts re-export from', () => {
    const content = `export { Something } from './something';`;
    expect(strategy.extractImports(content)).toContain('./something');
  });

  it('extracts require() calls', () => {
    const content = `const path = require('path');`;
    expect(strategy.extractImports(content)).toContain('path');
  });

  it('extracts dynamic import()', () => {
    const content = `const mod = await import('./heavy');`;
    expect(strategy.extractImports(content)).toContain('./heavy');
  });

  it('extracts multiple imports from one file', () => {
    const content = [
      `import { a } from './a';`,
      `import { b } from './b';`,
      `import { c } from './c';`,
    ].join('\n');
    const results = strategy.extractImports(content);
    expect(results).toContain('./a');
    expect(results).toContain('./b');
    expect(results).toContain('./c');
  });

  it('returns empty array for file with no imports', () => {
    expect(strategy.extractImports('const x = 1;')).toHaveLength(0);
  });
});

describe('TypeScript/JavaScript — resolveImport', () => {
  const strategy = getStrategyForExtension('.ts')!;

  it('resolves a relative import with .ts suffix', () => {
    const known = new Set(['src/utils.ts']);
    expect(strategy.resolveImport('./utils', 'src/index.ts', known)).toBe('src/utils.ts');
  });

  it('resolves a relative import to index.ts', () => {
    const known = new Set(['src/components/index.ts']);
    expect(strategy.resolveImport('./components', 'src/app.ts', known)).toBe(
      'src/components/index.ts',
    );
  });

  it('returns null for a package import (no leading dot)', () => {
    const known = new Set<string>();
    expect(strategy.resolveImport('react', 'src/app.ts', known)).toBeNull();
  });

  it('returns null when file is not in knownPaths', () => {
    const known = new Set(['src/other.ts']);
    expect(strategy.resolveImport('./missing', 'src/app.ts', known)).toBeNull();
  });
});

describe('TypeScript/JavaScript — isModuleEntryPoint', () => {
  const strategy = getStrategyForExtension('.ts')!;

  it('recognizes index.ts as entry point', () => {
    expect(strategy.isModuleEntryPoint('src/components/index.ts')).toBe(true);
  });

  it('recognizes index.tsx as entry point', () => {
    expect(strategy.isModuleEntryPoint('src/components/index.tsx')).toBe(true);
  });

  it('does not treat non-index files as entry points', () => {
    expect(strategy.isModuleEntryPoint('src/app.ts')).toBe(false);
    expect(strategy.isModuleEntryPoint('src/utils.ts')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TypeScript path aliases
// ---------------------------------------------------------------------------

describe('configureTypeScriptAliases', () => {
  // Reset aliases after each test by reconfiguring to empty
  afterEach(() => {
    configureTypeScriptAliases({});
  });

  it('resolves an aliased import after configuration', () => {
    configureTypeScriptAliases({ '@main/*': ['src/main/*'] });
    const strategy = getStrategyForExtension('.ts')!;
    const known = new Set(['src/main/config.ts']);
    const result = strategy.resolveImport('@main/config', 'src/renderer/app.ts', known);
    expect(result).toBe('src/main/config.ts');
  });

  it('resolves an aliased import without wildcard', () => {
    configureTypeScriptAliases({ '@shared': ['src/shared/index.ts'] });
    const strategy = getStrategyForExtension('.ts')!;
    const known = new Set(['src/shared/index.ts']);
    const result = strategy.resolveImport('@shared', 'src/app.ts', known);
    expect(result).toBe('src/shared/index.ts');
  });

  it('falls back to relative resolution when alias does not match', () => {
    configureTypeScriptAliases({ '@main/*': ['src/main/*'] });
    const strategy = getStrategyForExtension('.ts')!;
    const known = new Set(['src/utils.ts']);
    // This is a relative import, not an alias — should still resolve normally
    const result = strategy.resolveImport('./utils', 'src/index.ts', known);
    expect(result).toBe('src/utils.ts');
  });
});

// ---------------------------------------------------------------------------
// Python strategy
// ---------------------------------------------------------------------------

describe('Python — extractImports', () => {
  const strategy = getStrategyForExtension('.py')!;

  it('extracts from … import … statements', () => {
    const content = `from mypackage.utils import helper`;
    expect(strategy.extractImports(content)).toContain('mypackage.utils');
  });

  it('extracts import … statements', () => {
    const content = `import os\nimport sys`;
    const results = strategy.extractImports(content);
    expect(results).toContain('os');
    expect(results).toContain('sys');
  });

  it('extracts import … as … (strips alias)', () => {
    const content = `import numpy as np`;
    expect(strategy.extractImports(content)).toContain('numpy');
  });

  it('extracts relative imports (leading dots)', () => {
    const content = `from . import sibling\nfrom .. import parent`;
    const results = strategy.extractImports(content);
    expect(results).toContain('.');
    expect(results).toContain('..');
  });

  it('extracts multiple imports on separate lines', () => {
    const content = `import json\nfrom os import path\nimport re`;
    const results = strategy.extractImports(content);
    expect(results).toContain('json');
    expect(results).toContain('os');
    expect(results).toContain('re');
  });

  it('returns empty array for file with no imports', () => {
    expect(strategy.extractImports('x = 1\nprint(x)')).toHaveLength(0);
  });
});

describe('Python — resolveImport', () => {
  const strategy = getStrategyForExtension('.py')!;

  it('resolves an absolute module path (dot-separated → slash-separated)', () => {
    const known = new Set(['mypackage/utils.py']);
    expect(strategy.resolveImport('mypackage.utils', 'main.py', known)).toBe(
      'mypackage/utils.py',
    );
  });

  it('resolves an absolute import to a package __init__.py', () => {
    const known = new Set(['mypackage/__init__.py']);
    expect(strategy.resolveImport('mypackage', 'main.py', known)).toBe(
      'mypackage/__init__.py',
    );
  });

  it('resolves a single-dot relative import', () => {
    // "from . import sibling" from pkg/module.py → pkg/sibling.py
    const known = new Set(['pkg/sibling.py']);
    expect(strategy.resolveImport('.sibling', 'pkg/module.py', known)).toBe('pkg/sibling.py');
  });

  it('resolves a two-dot relative import', () => {
    // "from .. import utils" from pkg/sub/module.py → pkg/utils.py
    const known = new Set(['pkg/utils.py']);
    expect(strategy.resolveImport('..utils', 'pkg/sub/module.py', known)).toBe('pkg/utils.py');
  });

  it('returns null for unresolvable package import', () => {
    const known = new Set<string>();
    expect(strategy.resolveImport('numpy', 'src/main.py', known)).toBeNull();
  });
});

describe('Python — isModuleEntryPoint', () => {
  const strategy = getStrategyForExtension('.py')!;

  it('recognizes __init__.py as entry point', () => {
    expect(strategy.isModuleEntryPoint('mypackage/__init__.py')).toBe(true);
  });

  it('recognizes __init__.pyi as entry point', () => {
    expect(strategy.isModuleEntryPoint('mypackage/__init__.pyi')).toBe(true);
  });

  it('does not treat regular .py files as entry points', () => {
    expect(strategy.isModuleEntryPoint('mypackage/utils.py')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Go strategy
// ---------------------------------------------------------------------------

describe('Go — extractImports', () => {
  const strategy = getStrategyForExtension('.go')!;

  it('extracts single-line import', () => {
    const content = `import "fmt"`;
    expect(strategy.extractImports(content)).toContain('fmt');
  });

  it('extracts grouped imports', () => {
    const content = `import (\n\t"fmt"\n\t"os"\n)`;
    const results = strategy.extractImports(content);
    expect(results).toContain('fmt');
    expect(results).toContain('os');
  });

  it('extracts grouped imports with aliases', () => {
    const content = `import (\n\talias "github.com/pkg/errors"\n)`;
    expect(strategy.extractImports(content)).toContain('github.com/pkg/errors');
  });

  it('returns empty array for no imports', () => {
    expect(strategy.extractImports('package main\n\nfunc main() {}')).toHaveLength(0);
  });
});

describe('Go — resolveImport', () => {
  const strategy = getStrategyForExtension('.go')!;

  it('resolves a package import to a .go file in the matching directory', () => {
    const known = new Set(['internal/utils/helper.go']);
    const result = strategy.resolveImport('internal/utils', 'cmd/main.go', known);
    expect(result).toBe('internal/utils/helper.go');
  });

  it('returns null for an external package not in known paths', () => {
    const known = new Set<string>();
    expect(strategy.resolveImport('fmt', 'main.go', known)).toBeNull();
  });
});

describe('Go — isModuleEntryPoint', () => {
  const strategy = getStrategyForExtension('.go')!;

  it('always returns false (Go has no barrel-file convention)', () => {
    expect(strategy.isModuleEntryPoint('main.go')).toBe(false);
    expect(strategy.isModuleEntryPoint('src/index.go')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rust strategy
// ---------------------------------------------------------------------------

describe('Rust — extractImports', () => {
  const strategy = getStrategyForExtension('.rs')!;

  it('extracts crate:: use statements', () => {
    const content = `use crate::utils::helper;`;
    expect(strategy.extractImports(content)).toContain('crate::utils::helper');
  });

  it('extracts super:: use statements', () => {
    const content = `use super::sibling;`;
    expect(strategy.extractImports(content)).toContain('super::sibling');
  });

  it('extracts self:: use statements', () => {
    const content = `use self::inner;`;
    expect(strategy.extractImports(content)).toContain('self::inner');
  });

  it('extracts mod declarations', () => {
    // The Rust extractor uses firstToken() which grabs up to the first space.
    // "mod utils;" has no space after "utils;" so the semicolon is retained.
    const content = `mod utils;\nmod tests;`;
    const results = strategy.extractImports(content);
    expect(results).toContain('utils;');
    expect(results).toContain('tests;');
  });

  it('does not extract external crate use statements', () => {
    // 'use serde::Deserialize' — not crate/super/self prefix
    const content = `use serde::Deserialize;`;
    expect(strategy.extractImports(content)).toHaveLength(0);
  });
});

describe('Rust — resolveImport', () => {
  const strategy = getStrategyForExtension('.rs')!;

  it('resolves crate:: path to src/', () => {
    const known = new Set(['src/utils/helper.rs']);
    expect(strategy.resolveImport('crate::utils::helper', 'src/main.rs', known)).toBe(
      'src/utils/helper.rs',
    );
  });

  it('resolves a mod declaration to a sibling .rs file', () => {
    const known = new Set(['src/utils.rs']);
    expect(strategy.resolveImport('utils', 'src/main.rs', known)).toBe('src/utils.rs');
  });

  it('resolves a mod to mod.rs', () => {
    const known = new Set(['src/utils/mod.rs']);
    expect(strategy.resolveImport('utils', 'src/main.rs', known)).toBe('src/utils/mod.rs');
  });
});

describe('Rust — isModuleEntryPoint', () => {
  const strategy = getStrategyForExtension('.rs')!;

  it('recognizes mod.rs, lib.rs, main.rs as entry points', () => {
    expect(strategy.isModuleEntryPoint('src/utils/mod.rs')).toBe(true);
    expect(strategy.isModuleEntryPoint('src/lib.rs')).toBe(true);
    expect(strategy.isModuleEntryPoint('src/main.rs')).toBe(true);
  });

  it('does not treat regular .rs files as entry points', () => {
    expect(strategy.isModuleEntryPoint('src/helper.rs')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C/C++ strategy
// ---------------------------------------------------------------------------

describe('C/C++ — extractImports', () => {
  const strategy = getStrategyForExtension('.cpp')!;

  it('extracts local #include "..." directives', () => {
    const content = `#include "utils.h"\n#include "core/engine.h"`;
    const results = strategy.extractImports(content);
    expect(results).toContain('utils.h');
    expect(results).toContain('core/engine.h');
  });

  it('does not extract system #include <...> directives', () => {
    const content = `#include <stdio.h>\n#include <vector>`;
    expect(strategy.extractImports(content)).toHaveLength(0);
  });
});

describe('C/C++ — resolveImport', () => {
  const strategy = getStrategyForExtension('.cpp')!;

  it('resolves an include path that is a known path directly', () => {
    const known = new Set(['include/utils.h']);
    expect(strategy.resolveImport('include/utils.h', 'src/main.cpp', known)).toBe(
      'include/utils.h',
    );
  });

  it('resolves a relative include path', () => {
    const known = new Set(['src/core/engine.h']);
    expect(strategy.resolveImport('core/engine.h', 'src/main.cpp', known)).toBe(
      'src/core/engine.h',
    );
  });

  it('returns null for an unresolvable header', () => {
    const known = new Set<string>();
    expect(strategy.resolveImport('missing.h', 'src/main.cpp', known)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ruby strategy
// ---------------------------------------------------------------------------

describe('Ruby — extractImports', () => {
  const strategy = getStrategyForExtension('.rb')!;

  it('extracts require_relative with relative: prefix', () => {
    const content = `require_relative 'utils'`;
    const results = strategy.extractImports(content);
    expect(results).toContain('relative:utils');
  });

  it('extracts plain require', () => {
    const content = `require 'json'`;
    expect(strategy.extractImports(content)).toContain('json');
  });
});

describe('Ruby — resolveImport', () => {
  const strategy = getStrategyForExtension('.rb')!;

  it('resolves relative: prefixed import', () => {
    const known = new Set(['app/utils.rb']);
    expect(strategy.resolveImport('relative:utils', 'app/main.rb', known)).toBe('app/utils.rb');
  });

  it('resolves lib/ path for bare require', () => {
    const known = new Set(['lib/helpers.rb']);
    expect(strategy.resolveImport('helpers', 'app/main.rb', known)).toBe('lib/helpers.rb');
  });
});

// ---------------------------------------------------------------------------
// Java strategy
// ---------------------------------------------------------------------------

describe('Java — extractImports', () => {
  const strategy = getStrategyForExtension('.java')!;

  it('extracts regular import statements', () => {
    const content = `import com.example.utils.Helper;`;
    expect(strategy.extractImports(content)).toContain('com.example.utils.Helper');
  });

  it('strips static import prefix and trailing member', () => {
    const content = `import static com.example.utils.Helper.METHOD;`;
    // Static: "com.example.utils.Helper.METHOD" → trim last segment → "com.example.utils.Helper"
    expect(strategy.extractImports(content)).toContain('com.example.utils.Helper');
  });
});

describe('Java — resolveImport', () => {
  const strategy = getStrategyForExtension('.java')!;

  it('resolves a fully-qualified class name to a .java file', () => {
    const known = new Set(['src/main/java/com/example/utils/Helper.java']);
    const result = strategy.resolveImport(
      'com.example.utils.Helper',
      'src/main/java/com/example/Main.java',
      known,
    );
    expect(result).toBe('src/main/java/com/example/utils/Helper.java');
  });
});

// ---------------------------------------------------------------------------
// Kotlin strategy
// ---------------------------------------------------------------------------

describe('Kotlin — extractImports', () => {
  const strategy = getStrategyForExtension('.kt')!;

  it('extracts import statements', () => {
    const content = `import com.example.utils.Helper\nimport kotlin.collections.List`;
    const results = strategy.extractImports(content);
    expect(results).toContain('com.example.utils.Helper');
    expect(results).toContain('kotlin.collections.List');
  });
});

// ---------------------------------------------------------------------------
// C# strategy
// ---------------------------------------------------------------------------

describe('C# — extractImports', () => {
  const strategy = getStrategyForExtension('.cs')!;

  it('extracts using directives', () => {
    const content = `using MyApp.Utils;\nusing MyApp.Services;`;
    const results = strategy.extractImports(content);
    expect(results).toContain('MyApp.Utils');
    expect(results).toContain('MyApp.Services');
  });

  it('ignores System.* namespaces', () => {
    const content = `using System;\nusing System.Collections.Generic;`;
    expect(strategy.extractImports(content)).toHaveLength(0);
  });

  it('ignores using static directives', () => {
    const content = `using static MyApp.Helpers;`;
    expect(strategy.extractImports(content)).toHaveLength(0);
  });
});

describe('C# — resolveImport', () => {
  const strategy = getStrategyForExtension('.cs')!;

  it('resolves a namespace to a .cs file', () => {
    const known = new Set(['src/MyApp/Utils.cs']);
    expect(strategy.resolveImport('MyApp.Utils', 'src/Main.cs', known)).toBe(
      'src/MyApp/Utils.cs',
    );
  });
});

// ---------------------------------------------------------------------------
// PHP strategy
// ---------------------------------------------------------------------------

describe('PHP — extractImports', () => {
  const strategy = getStrategyForExtension('.php')!;

  it('extracts use namespace statements with use: prefix', () => {
    const content = `use App\\Services\\UserService;`;
    const results = strategy.extractImports(content);
    expect(results).toContain('use:App\\Services\\UserService');
  });

  it('extracts require_once paths', () => {
    const content = `require_once 'vendor/autoload.php';`;
    expect(strategy.extractImports(content)).toContain('vendor/autoload.php');
  });
});

describe('PHP — resolveImport', () => {
  const strategy = getStrategyForExtension('.php')!;

  it('resolves a use: namespace (backslash → forward slash)', () => {
    const known = new Set(['src/App/Services/UserService.php']);
    const result = strategy.resolveImport(
      'use:App\\Services\\UserService',
      'src/index.php',
      known,
    );
    expect(result).toBe('src/App/Services/UserService.php');
  });
});
