/**
 * contextLayerModuleSummary.ts — Module summary building and goal-based selection.
 * Extracted from contextLayerControllerSupport.ts to stay under the max-lines limit.
 */

import path from 'path';

import type { IndexedRepoFile } from '../orchestration/repoIndexer';
import type { ModuleContextSummary } from '../orchestration/types';
import type { CachedModuleData, DetectedModule } from './contextLayerControllerHelpers';
import type { ModuleCohesionMetrics } from './importGraphAnalyzer';

// ---------------------------------------------------------------------------
// Module summary building
// ---------------------------------------------------------------------------

export function buildSingleModuleSummary(
  mod: DetectedModule,
  cohesionMetrics?: ModuleCohesionMetrics,
): ModuleContextSummary {
  const languages = summarizeModuleLanguages(mod.files);
  const deps = cohesionMetrics?.topDependencies.slice(0, 3).map((d) => d.moduleId) ?? [];
  return {
    moduleId: mod.id,
    label: mod.label,
    rootPath: mod.rootPath,
    description: `${mod.label} module (${mod.files.length} files, ${languages.join('/')}${mod.boundarySignals.hasBarrel ? ', barrel' : ''}, ${mod.boundarySignals.boundaryStrength} boundary, ${(mod.cohesion * 100).toFixed(0)}% cohesion)`,
    keyResponsibilities: deriveResponsibilities(mod),
    gotchas: deriveGotchas(mod),
    exports: mod.exports.slice(0, 10),
    dependencies: deps.length > 0 ? deps : undefined,
  };
}

export function selectModuleSummariesForGoal(
  cached: Map<string, CachedModuleData>,
  goalKeywords: string[],
  maxModules: number,
): ModuleContextSummary[] {
  const scored = Array.from(cached.values()).map((entry) => ({
    summary: entry.summary,
    score: scoreModuleForGoal(entry, goalKeywords),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxModules).map((s) => s.summary);
}

function scoreModuleForGoal(entry: CachedModuleData, goalKeywords: string[]): number {
  let score = 0;
  const lbl = entry.module.label.toLowerCase();
  const exps = entry.module.exports.map((e) => e.toLowerCase());
  const fls = entry.module.files.map((f) => path.basename(f.relativePath).toLowerCase());

  for (const kw of goalKeywords) {
    if (lbl.includes(kw)) score += 3;
    if (entry.module.id.toLowerCase().includes(kw)) score += 2;
    if (exps.some((e) => e.includes(kw))) score += 2;
    if (fls.some((f) => f.includes(kw))) score += 1;
  }
  if (entry.module.recentlyChanged) score += 1;
  const s = entry.module.boundarySignals.boundaryStrength;
  if (s === 'strong') score += 2;
  else if (s === 'moderate') score += 1;
  if (entry.module.cohesion >= 0.5) score += 1;
  return score;
}

function summarizeModuleLanguages(files: IndexedRepoFile[]): string[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    if (file.language !== 'unknown') {
      counts.set(file.language, (counts.get(file.language) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([lang]) => lang);
}

function deriveResponsibilities(mod: DetectedModule): string[] {
  const r: string[] = [];
  const names = mod.files.map((f) => path.basename(f.relativePath, f.extension).toLowerCase());
  if (mod.files.some((f) => f.extension === '.tsx')) r.push('UI components');
  if (names.some((f) => f.includes('handler') || f.includes('controller') || f.includes('service')))
    r.push('Request handling / business logic');
  if (names.some((f) => f.includes('config') || f.includes('settings')))
    r.push('Configuration management');
  if (names.some((f) => f.includes('types') || f.includes('interfaces')))
    r.push('Type definitions');
  if (names.some((f) => f.includes('utils') || f.includes('helpers') || f.includes('support')))
    r.push('Shared utilities');
  if (names.some((f) => f.includes('test') || f.includes('spec'))) r.push('Test coverage');
  if (mod.boundarySignals.hasBarrel) r.push('Public API via barrel export');
  if (r.length === 0) r.push(`Contains ${mod.files.length} files`);
  return r.slice(0, 5);
}

function deriveGotchas(mod: DetectedModule): string[] {
  const g: string[] = [];
  if (mod.files.length > 20)
    g.push(`Large module (${mod.files.length} files) — changes may have broad impact`);
  const ext = new Set(mod.files.flatMap((f) => f.imports.filter((i) => !i.startsWith('.'))));
  if (ext.size > 15) g.push(`Heavy external dependencies (${ext.size} unique imports)`);
  const errs = mod.files.filter((f) => f.diagnostics && f.diagnostics.errors > 0);
  if (errs.length > 0) g.push(`${errs.length} file(s) with active errors`);
  if (mod.cohesion > 0 && mod.cohesion < 0.2 && mod.files.length > 3) {
    g.push(
      `Low cohesion (${(mod.cohesion * 100).toFixed(0)}%) — files may belong to different concerns`,
    );
  }
  return g.slice(0, 3);
}
