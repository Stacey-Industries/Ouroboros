/**
 * awesomeEntries.skills.ts — Skill seed data for AWESOME_ENTRIES.
 *
 * Split out from awesomeEntries.ts to keep the main entry list under the
 * ESLint max-lines limit. Import via awesomeEntries.ts — not directly.
 */

import type { AwesomeEntry } from './awesomeData';

export const SKILL_ENTRIES: AwesomeEntry[] = [
  {
    id: 'skill-changelog-generator',
    category: 'skills',
    title: 'Changelog generator',
    description: 'Generates a CHANGELOG entry from git log between two refs.',
    author: 'ouroboros-team',
    tags: ['changelog', 'git', 'release'],
    content:
      'You are generating a CHANGELOG entry. The user will provide FROM_REF and TO_REF.\n\n' +
      'Steps:\n' +
      '1. Run: git log <FROM_REF>..<TO_REF> --oneline --no-merges\n' +
      '2. Group commits by conventional-commit type (feat, fix, refactor, etc.)\n' +
      '3. Output markdown:\n\n' +
      '## [<version>] - <YYYY-MM-DD>\n' +
      '### Added\n- ...\n### Fixed\n- ...\n### Changed\n- ...\n\n' +
      'Omit sections with no entries.\n',
    installAction: {
      kind: 'skill',
      payload: { scope: 'global', name: 'changelog-generator', content: '' },
    },
  },
  {
    id: 'skill-dependency-auditor',
    category: 'skills',
    title: 'Dependency auditor',
    description: 'Reviews package.json for outdated, unused, or vulnerable dependencies.',
    author: 'ouroboros-team',
    tags: ['dependencies', 'audit', 'security'],
    content:
      'Audit the project dependencies:\n\n' +
      '1. Read package.json (dependencies + devDependencies).\n' +
      '2. Run: npm outdated --json\n' +
      '3. Run: npm audit --json (filter severity >= moderate)\n' +
      '4. Grep imports vs listed deps to find unused packages.\n\n' +
      'Produce a table: | Package | Current | Latest | Severity | Action |\n' +
      'Recommended actions: upgrade, remove, review, ignore.\n' +
      'Do not auto-upgrade — only report.\n',
    installAction: {
      kind: 'skill',
      payload: { scope: 'global', name: 'dependency-auditor', content: '' },
    },
  },
  {
    id: 'skill-test-scaffolder',
    category: 'skills',
    title: 'Test scaffolder',
    description: 'Generates a vitest test file scaffold for a given source file.',
    author: 'ouroboros-team',
    tags: ['testing', 'vitest', 'scaffold'],
    content:
      'You are scaffolding a vitest test file. The user provides a source file path.\n\n' +
      '1. Read the source file.\n' +
      '2. Identify exported functions, classes, and hooks.\n' +
      '3. Generate a test file co-located with the source (same directory, .test.ts suffix).\n\n' +
      'Use describe/it/expect from vitest. Add one describe block per exported symbol.\n' +
      'Leave TODOs for edge cases. Do not use jest APIs.\n',
    installAction: {
      kind: 'skill',
      payload: { scope: 'global', name: 'test-scaffolder', content: '' },
    },
  },
];
