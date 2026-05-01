/**
 * repoMapGeneratorFrameworks.ts — Framework detection for the repo map.
 * Extracted from repoMapGenerator.ts in Wave 69 B1 to stay under the 300-line
 * limit; behavior is unchanged.
 */

import type { IndexedRepoFile, RepoIndexSnapshot } from '../orchestration/repoIndexer';

function matchesAnyPattern(relativePaths: Set<string>, patterns: string[]): boolean {
  return patterns.some((pattern) => relativePaths.has(pattern));
}

function matchesAnyGlob(relativePaths: Set<string>, prefix: string): boolean {
  return Array.from(relativePaths).some((p) => p.startsWith(prefix));
}

function detectElectronFramework(allFiles: IndexedRepoFile[], relativePaths: Set<string>): boolean {
  const hasElectronStructure =
    allFiles.some((f) => f.relativePath.startsWith('src/main/')) &&
    allFiles.some((f) => f.relativePath.startsWith('src/renderer/')) &&
    allFiles.some((f) => f.relativePath.startsWith('src/preload/'));
  return (
    hasElectronStructure ||
    Array.from(relativePaths).some((p) => p.startsWith('electron.vite.config'))
  );
}

function detectReactFramework(allFiles: IndexedRepoFile[], detected: string[]): boolean {
  const tsxCount = allFiles.filter((f) => f.extension === '.tsx').length;
  return (
    tsxCount >= 3 &&
    !detected.includes('Next.js') &&
    !detected.includes('Vue') &&
    !detected.includes('Angular')
  );
}

function buildFrameworkChecks(
  allFiles: IndexedRepoFile[],
  relativePaths: Set<string>,
): Array<{ name: string; check: (detected: string[]) => boolean }> {
  const hasExtension = (ext: string): boolean => allFiles.some((file) => file.extension === ext);
  return [
    {
      name: 'Next.js',
      check: () =>
        matchesAnyPattern(relativePaths, ['next.config.js', 'next.config.ts', 'next.config.mjs']),
    },
    {
      name: 'Vue',
      check: () => matchesAnyPattern(relativePaths, ['vue.config.js']) || hasExtension('.vue'),
    },
    { name: 'Angular', check: () => matchesAnyPattern(relativePaths, ['angular.json']) },
    { name: 'Electron', check: () => detectElectronFramework(allFiles, relativePaths) },
    {
      name: 'Vite',
      check: (d) => matchesAnyGlob(relativePaths, 'vite.config') && !d.includes('Electron'),
    },
    { name: 'React', check: (d) => detectReactFramework(allFiles, d) },
    { name: 'Tailwind CSS', check: () => matchesAnyGlob(relativePaths, 'tailwind.config') },
    {
      name: 'Svelte',
      check: () =>
        matchesAnyPattern(relativePaths, ['svelte.config.js', 'svelte.config.ts']) ||
        hasExtension('.svelte'),
    },
    {
      name: 'Astro',
      check: () =>
        matchesAnyPattern(relativePaths, ['astro.config.mjs', 'astro.config.ts']) ||
        hasExtension('.astro'),
    },
  ];
}

/**
 * Detects the frameworks used in a workspace by inspecting config-file
 * presence and source-file extensions. Returns an alphabetically-sorted list
 * of framework names. Pure: no I/O.
 */
export function detectFrameworks(repoIndex: RepoIndexSnapshot): string[] {
  const allFiles = repoIndex.roots.flatMap((root) => root.files);
  const relativePaths = new Set(allFiles.map((file) => file.relativePath.toLowerCase()));
  const checks = buildFrameworkChecks(allFiles, relativePaths);

  const detected: string[] = [];
  for (const { name, check } of checks) {
    if (check(detected)) detected.push(name);
  }
  return detected.sort((left, right) => left.localeCompare(right));
}
