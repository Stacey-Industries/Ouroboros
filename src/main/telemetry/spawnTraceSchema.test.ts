import { describe, expect, it } from 'vitest';

import {
  SPAWN_TRACE_SCHEMA_VERSION,
  SPAWN_TRACE_SURFACE,
  type SpawnTraceRecord,
} from './spawnTraceSchema';

describe('spawnTraceSchema', () => {
  it('exports the correct surface name', () => {
    expect(SPAWN_TRACE_SURFACE).toBe('spawn-trace');
  });

  it('exports schema version 1', () => {
    expect(SPAWN_TRACE_SCHEMA_VERSION).toBe(1);
  });

  it('SpawnTraceRecord shape is satisfied by a well-formed object', () => {
    const record: SpawnTraceRecord = {
      sessionId: 'sess-abc123',
      argv: ['claude', '-p', '--output-format', 'stream-json'],
      cwdHash: 'a1b2c3d4e5f6',
      ts: 1_700_000_000_000,
    };
    expect(record.sessionId).toBe('sess-abc123');
    expect(record.argv).toHaveLength(4);
    expect(record.cwdHash).toHaveLength(12);
    expect(record.ts).toBeGreaterThan(0);
  });

  it('surface name contains no characters that would corrupt JSONL filenames', () => {
    // telemetryQueueAppend.mjs sanitises with /[^a-zA-Z0-9._-]/g → '_'
    // The surface name must survive unsanitised so drain and hook agree on
    // the filename.
    expect(SPAWN_TRACE_SURFACE).toMatch(/^[a-zA-Z0-9._-]+$/);
  });
});
