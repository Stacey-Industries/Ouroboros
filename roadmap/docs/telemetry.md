# Telemetry

Ouroboros writes structured telemetry to a local SQLite database at
`{userData}/telemetry/telemetry.db`. The store is WAL-mode, batch-flushed every
100 ms, and closed with a final flush on `app.quit`.

## Operator inspection

```bash
sqlite3 "%APPDATA%\Ouroboros\telemetry\telemetry.db" "SELECT type, session_id, datetime(timestamp/1000,'unixepoch') FROM events ORDER BY timestamp DESC LIMIT 20"
```

## Tables

| Table | Contents |
|---|---|
| `events` | Hook events (pre/post tool use, session start/stop) |
| `outcomes` | Exit-code and duration for completed tool calls |
| `orchestration_traces` | Spawn/stdin/stdout trace entries from `claudeStreamJsonRunner` |
| `research_invocations` | Research pipeline invocations with hit/miss and latency |
| `schema_meta` | Schema version metadata |

## Retention

Rows older than 30 days are purged automatically: once at startup and then daily
(via `setInterval` in `initTelemetryStore`).

## Feature flag

Telemetry writes are gated on `telemetry.structured` (default `false`) in the
app config. Set to `true` in Settings to enable event recording.

## Trace batcher

`traceBatcher.ts` micro-batches `orchestration_traces` inserts to protect PTY
throughput. `initTraceBatcher()` is called inside `initTelemetryStore` and
`drainTraceBatcher()` is called inside `closeTelemetryStore`, so lifecycle is
automatic.

## JSONL mirror (removed)

A daily-rotated JSONL file mirror (`telemetryJsonlMirror.ts`) was planned in
Wave 15 §1 but was never instantiated in production. It was removed in Wave 41
Phase F because the SQLite store is the canonical path and leaving
tested-but-dead code is a known anti-pattern. Use `sqlite3` CLI for operator
inspection (see above).
