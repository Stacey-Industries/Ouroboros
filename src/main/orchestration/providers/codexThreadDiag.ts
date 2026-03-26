/**
 * codexThreadDiag.ts — Diagnostic helper for Codex thread ID verification.
 *
 * Cross-checks the thread ID captured from the Codex stream against the
 * session file written to ~/.codex/sessions/. Extracted from codexAdapter.ts
 * to keep that file under 300 lines.
 */
import { readdir,readFile } from 'fs/promises';
import os from 'os';
import path from 'path';

import log from '../../logger';

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;

function buildSessionDir(): string {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const dd = now.getDate().toString().padStart(2, '0');
  return path.join(os.homedir(), '.codex', 'sessions', yyyy, mm, dd);
}

export async function verifyCodexThreadId(capturedThreadId: string): Promise<void> {
  try {
    const dir = buildSessionDir();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from os.homedir() + fixed suffix
    const entries = await readdir(dir);
    const latest = entries
      .filter((f) => f.startsWith('rollout-') && f.endsWith('.jsonl'))
      .sort()
      .pop();
    if (!latest) return;
    const filenameUuid = UUID_RE.exec(latest)?.[1] ?? null;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from os.homedir() + fixed suffix
    const raw = await readFile(path.join(dir, latest), 'utf-8');
    const firstLine = raw.slice(0, raw.indexOf('\n'));
    const meta = JSON.parse(firstLine) as { payload?: { id?: string } };
    const payloadId = meta.payload?.id ?? null;
    log.info('[codex-diag] THREAD ID COMPARISON:');
    log.info(`[codex-diag]   stream thread_id:         ${capturedThreadId}`);
    log.info(`[codex-diag]   session_meta.payload.id:  ${payloadId ?? 'N/A'}`);
    log.info(`[codex-diag]   rollout filename UUID:    ${filenameUuid ?? 'N/A'}`);
    log.info(`[codex-diag]   match stream↔payload:     ${capturedThreadId === payloadId}`);
    log.info(`[codex-diag]   match stream↔filename:    ${capturedThreadId === filenameUuid}`);
  } catch {
    log.info('[codex-diag] session file cross-check skipped (no session files found)');
  }
}
