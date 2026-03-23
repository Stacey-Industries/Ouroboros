/**
 * contextGenerator.ts — Generates CLAUDE.md content from ProjectContext.
 */

import type { ContextGenerateOptions, ProjectContext } from './contextTypes';

function generateHeader(ctx: ProjectContext): string[] {
  const lines: string[] = [];
  lines.push(`# ${ctx.name}`);
  lines.push('');
  lines.push('## What This Is');
  const parts: string[] = [];
  parts.push(ctx.framework ? `${ctx.framework} project` : `${ctx.language} project`);
  if (ctx.detectedPatterns.length > 0) {
    parts.push(`using ${ctx.detectedPatterns.slice(0, 5).join(', ')}`);
  }
  lines.push(parts.join(' ') + '.');
  lines.push('');
  return lines;
}

function generateCommands(ctx: ProjectContext): string[] {
  if (ctx.buildCommands.length === 0) return [];
  const lines = ['## Commands'];
  for (const cmd of ctx.buildCommands) {
    lines.push(`- \`${cmd.name}\` — ${cmd.command}`);
  }
  lines.push('');
  return lines;
}

function generateTechStack(ctx: ProjectContext): string[] {
  const stack = [`Language: ${ctx.language}`];
  if (ctx.framework) stack.push(`Framework: ${ctx.framework}`);
  if (ctx.packageManager) stack.push(`Package Manager: ${ctx.packageManager}`);
  if (ctx.testFramework) stack.push(`Test Framework: ${ctx.testFramework}`);

  const lines = ['## Tech Stack'];
  for (const item of stack) lines.push(`- ${item}`);
  lines.push('');
  return lines;
}

function generateKeyFiles(ctx: ProjectContext): string[] {
  if (ctx.entryPoints.length === 0) return [];
  const lines = ['## Key Files', '', '| File | Role |', '|---|---|'];
  for (const entry of ctx.entryPoints) {
    lines.push(`| \`${entry}\` | Entry point |`);
  }
  lines.push('');
  return lines;
}

function generateStructure(ctx: ProjectContext): string[] {
  const filtered = ctx.keyDirs.filter(
    (d) => !['node_modules', 'dist', 'build', 'out'].includes(d.path),
  );
  if (filtered.length === 0) return [];
  const lines = ['## Project Structure', '', '| Path | Contents |', '|---|---|'];
  for (const dir of filtered) {
    lines.push(`| \`${dir.path}/\` | ${dir.purpose} |`);
  }
  lines.push('');
  return lines;
}

function generateConfig(ctx: ProjectContext): string[] {
  const relevant = ctx.keyConfigs.filter((c) => !c.startsWith('.env'));
  if (relevant.length === 0) return [];
  return [
    '## Configuration',
    `Key config files: ${relevant.map((c) => `\`${c}\``).join(', ')}`,
    '',
  ];
}

function generateConventions(ctx: ProjectContext): string[] {
  if (ctx.detectedPatterns.length === 0) return [];
  const lines = ['## Conventions'];
  for (const p of ctx.detectedPatterns) lines.push(`- ${p}`);
  lines.push('');
  return lines;
}

function generateDeps(ctx: ProjectContext, maxDeps: number): string[] {
  if (ctx.dependencies.length === 0) return [];
  const lines = ['## Key Dependencies'];
  const deps = ctx.dependencies.slice(0, maxDeps);
  for (const dep of deps) lines.push(`- \`${dep.name}\`: ${dep.version}`);
  if (ctx.dependencies.length > maxDeps) {
    lines.push(`- ... and ${ctx.dependencies.length - maxDeps} more`);
  }
  lines.push('');
  return lines;
}

export function generateClaudeMdContent(
  ctx: ProjectContext,
  options: ContextGenerateOptions = {},
): string {
  const {
    includeCommands = true,
    includeDeps = true,
    includeStructure = true,
    maxDeps = 20,
  } = options;
  const sections: string[][] = [
    generateHeader(ctx),
    includeCommands ? generateCommands(ctx) : [],
    generateTechStack(ctx),
    generateKeyFiles(ctx),
    includeStructure ? generateStructure(ctx) : [],
    generateConfig(ctx),
    generateConventions(ctx),
    includeDeps ? generateDeps(ctx, maxDeps) : [],
  ];
  return sections.flat().join('\n');
}
