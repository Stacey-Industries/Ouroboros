import { describe, expect, it } from 'vitest';

import { deriveTags, mergeTags } from './threadTagger';

describe('deriveTags', () => {
  describe('file language extraction', () => {
    it('maps .ts files to typescript', () => {
      const tags = deriveTags({ filesTouched: ['src/foo.ts'], toolsUsed: [] });
      expect(tags).toContain('typescript');
    });

    it('maps .tsx files to typescript', () => {
      const tags = deriveTags({ filesTouched: ['src/Foo.tsx'], toolsUsed: [] });
      expect(tags).toContain('typescript');
    });

    it('maps .py files to python', () => {
      const tags = deriveTags({ filesTouched: ['script.py'], toolsUsed: [] });
      expect(tags).toContain('python');
    });

    it('maps .go files to go', () => {
      const tags = deriveTags({ filesTouched: ['main.go'], toolsUsed: [] });
      expect(tags).toContain('go');
    });

    it('maps .rs files to rust', () => {
      const tags = deriveTags({ filesTouched: ['lib.rs'], toolsUsed: [] });
      expect(tags).toContain('rust');
    });

    it('maps .sh files to shell', () => {
      const tags = deriveTags({ filesTouched: ['run.sh'], toolsUsed: [] });
      expect(tags).toContain('shell');
    });

    it('maps .sql files to sql', () => {
      const tags = deriveTags({ filesTouched: ['schema.sql'], toolsUsed: [] });
      expect(tags).toContain('sql');
    });

    it('maps .yaml and .yml to yaml', () => {
      const tags = deriveTags({ filesTouched: ['a.yaml', 'b.yml'], toolsUsed: [] });
      expect(tags).toContain('yaml');
    });

    it('maps .json to json', () => {
      const tags = deriveTags({ filesTouched: ['package.json'], toolsUsed: [] });
      expect(tags).toContain('json');
    });

    it('maps .md to markdown', () => {
      const tags = deriveTags({ filesTouched: ['README.md'], toolsUsed: [] });
      expect(tags).toContain('markdown');
    });

    it('skips files with unmapped extensions', () => {
      const tags = deriveTags({ filesTouched: ['foo.xyz', 'bar.unknown'], toolsUsed: [] });
      expect(tags).toHaveLength(0);
    });

    it('skips files with no extension', () => {
      const tags = deriveTags({ filesTouched: ['Makefile', 'Dockerfile'], toolsUsed: [] });
      expect(tags).toHaveLength(0);
    });

    it('deduplicates language tags from multiple files of the same type', () => {
      const tags = deriveTags({
        filesTouched: ['a.ts', 'b.ts', 'c.tsx'],
        toolsUsed: [],
      });
      expect(tags.filter((t) => t === 'typescript')).toHaveLength(1);
    });
  });

  describe('tool filtering', () => {
    it('includes Edit tool', () => {
      const tags = deriveTags({ filesTouched: [], toolsUsed: ['Edit'] });
      expect(tags).toContain('edit');
    });

    it('includes Bash tool', () => {
      const tags = deriveTags({ filesTouched: [], toolsUsed: ['Bash'] });
      expect(tags).toContain('bash');
    });

    it('includes Write tool', () => {
      const tags = deriveTags({ filesTouched: [], toolsUsed: ['Write'] });
      expect(tags).toContain('write');
    });

    it('excludes Read as noisy', () => {
      const tags = deriveTags({ filesTouched: [], toolsUsed: ['Read'] });
      expect(tags).not.toContain('read');
    });

    it('lowercases tool names', () => {
      const tags = deriveTags({ filesTouched: [], toolsUsed: ['WebSearch'] });
      expect(tags).toContain('websearch');
    });

    it('deduplicates repeated tools', () => {
      const tags = deriveTags({ filesTouched: [], toolsUsed: ['Bash', 'Bash', 'bash'] });
      expect(tags.filter((t) => t === 'bash')).toHaveLength(1);
    });
  });

  describe('branch and profile tags', () => {
    it('adds branch:<name> when gitBranch provided', () => {
      const tags = deriveTags({ filesTouched: [], toolsUsed: [], gitBranch: 'feat/my-feature' });
      expect(tags).toContain('branch:feat/my-feature');
    });

    it('adds profile:<id> when profileId provided', () => {
      const tags = deriveTags({ filesTouched: [], toolsUsed: [], profileId: 'work' });
      expect(tags).toContain('profile:work');
    });

    it('does not add branch tag when gitBranch is absent', () => {
      const tags = deriveTags({ filesTouched: [], toolsUsed: [] });
      expect(tags.some((t) => t.startsWith('branch:'))).toBe(false);
    });
  });

  describe('language override', () => {
    it('adds lowercased language when provided', () => {
      const tags = deriveTags({ filesTouched: [], toolsUsed: [], language: 'TypeScript' });
      expect(tags).toContain('typescript');
    });
  });

  describe('performance', () => {
    it('completes within 5ms for typical input', () => {
      const input = {
        filesTouched: Array.from({ length: 50 }, (_, i) => `src/file${i}.ts`),
        toolsUsed: ['Edit', 'Bash', 'Grep', 'Write'],
        gitBranch: 'main',
        profileId: 'default',
      };
      const start = performance.now();
      deriveTags(input);
      expect(performance.now() - start).toBeLessThan(5);
    });
  });
});

describe('mergeTags', () => {
  it('prefixes auto-tags with auto:', () => {
    const merged = mergeTags(['typescript', 'bash'], []);
    expect(merged).toContain('auto:typescript');
    expect(merged).toContain('auto:bash');
  });

  it('keeps manual tags without prefix', () => {
    const merged = mergeTags([], ['frontend', 'urgent']);
    expect(merged).toContain('frontend');
    expect(merged).toContain('urgent');
  });

  it('deduplicates: manual tag shadows same-named auto: counterpart', () => {
    // 'auto:typescript' and a manual 'auto:typescript' would dedupe
    const merged = mergeTags(['typescript'], ['auto:typescript']);
    expect(merged.filter((t) => t === 'auto:typescript')).toHaveLength(1);
  });

  it('returns sorted output', () => {
    const merged = mergeTags(['typescript', 'bash'], ['zfoo', 'afoo']);
    const sorted = [...merged].sort();
    expect(merged).toEqual(sorted);
  });

  it('returns empty array for empty inputs', () => {
    expect(mergeTags([], [])).toEqual([]);
  });

  it('handles only auto tags', () => {
    const merged = mergeTags(['go', 'sql'], []);
    expect(merged).toEqual(['auto:go', 'auto:sql']);
  });

  it('handles only manual tags', () => {
    const merged = mergeTags([], ['my-feature', 'backend']);
    expect(merged).toContain('my-feature');
    expect(merged).toContain('backend');
  });
});
