/**
 * ipc-handlers/specScaffold.ts — `spec:scaffold` IPC handler.
 *
 * Creates `.ouroboros/specs/<slug>/{requirements,design,tasks}.md` from
 * templates in `src/main/templates/spec/`.  Path validated through
 * `pathSecurity.assertPathAllowed`.
 */

import type { SpecScaffoldRequest, SpecScaffoldResult } from '@shared/types/specScaffold';
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import fs from 'fs/promises';
import path from 'path';

import log from '../logger';
import { assertPathAllowed } from './pathSecurity';

/** Template directory — resolved relative to this compiled file at runtime. */
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'spec');

/** File names produced under the spec directory, in display order. */
const SPEC_FILES = ['requirements.md', 'design.md', 'tasks.md'] as const;

/** Slugify a feature name: lowercase, spaces→hyphens, strip non-slug chars. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function fail(error: string, extra?: Partial<SpecScaffoldResult>): SpecScaffoldResult {
  return { success: false, error, ...extra };
}

async function readTemplate(fileName: string, feature: string): Promise<string> {
  const templatePath = path.join(TEMPLATES_DIR, fileName);
  const raw = await fs.readFile(templatePath, 'utf8'); // eslint-disable-line security/detect-non-literal-fs-filename -- __dirname + static SPEC_FILES entry
  return raw.replace(/\{\{feature\}\}/g, feature);
}

async function writeSpecFiles(specDir: string, displayName: string): Promise<string[]> {
  const written: string[] = [];
  for (const fileName of SPEC_FILES) {
    const content = await readTemplate(fileName, displayName);
    const filePath = path.join(specDir, fileName);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- specDir validated by caller
    await fs.writeFile(filePath, content, 'utf8');
    written.push(filePath);
  }
  return written;
}

async function scaffoldSpec(
  event: IpcMainInvokeEvent,
  request: SpecScaffoldRequest,
): Promise<SpecScaffoldResult> {
  const { projectRoot, featureName } = request;

  const denied = assertPathAllowed(event, projectRoot);
  if (denied) return denied;

  const slug = slugify(featureName);
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return fail('invalid-feature-name');
  }

  const specDir = path.join(projectRoot, '.ouroboros', 'specs', slug);

  let exists = false;
  try {
    await fs.access(specDir);
    exists = true;
  } catch {
    // directory does not exist — proceed
  }

  if (exists) {
    return fail('spec-already-exists', { collision: true, specDir });
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- specDir derived from validated root
  await fs.mkdir(specDir, { recursive: true });

  const displayName = featureName.trim();
  const files = await writeSpecFiles(specDir, displayName);

  log.info('[specScaffold] created', slug, specDir);
  return { success: true, specDir, files, slug };
}

export function registerSpecHandlers(): string[] {
  const channels: string[] = [];

  ipcMain.handle('spec:scaffold', async (event, request: SpecScaffoldRequest) => {
    try {
      return await scaffoldSpec(event, request);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('[specScaffold] error:', msg);
      return { success: false, error: msg };
    }
  });
  channels.push('spec:scaffold');

  return channels;
}
