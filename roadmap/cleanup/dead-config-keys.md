# Dead Config Keys — Audit Result

**Generated:** 2026-05-01.
**Method:** Enumerated every leaf key from `src/main/configSchema*.ts` (and the agentChat / renderer schema variants), then grepped `src/` for readers (literal key names + `config.<dotted.path>` patterns). Used `getConfigValue()`, `useConfig()` hook, `window.electronAPI.config.get()`, and the `IMPORTABLE_KEYS` list as cross-references.

---

## Result

**No fully orphaned config keys found.** All ~60+ defined keys across `configSchema.ts`, `configSchemaTail.ts`, `configSchemaTailExt.ts`, `configSchemaTailExt2.ts`, and `configSchemaMiddle.ts` have at least one confirmed reader.

## Caveats

- **Deprecated-but-still-read keys**: Several keys are marked `@deprecated` and have only fallback / migration readers. These are NOT orphans by this audit's strict definition (they have readers), but they are candidates for removal in a future cleanup wave. See **`roadmap/cleanup/dead-code.md` Part 1.1** for the list (`windowSessions`, `multiRoots`, `TRAINING_CUTOFF_DATE`, `stdioTransportPath`, `transport`, `llmJudgeSampleRate`, `autoRetrainEnabled` default-off branches, `ecosystem.rulesAndSkillsInstallEnabled` default-off).
- **Dynamic access**: Keys accessed via `config[variableName]` patterns can't be detected by literal grep. The audit assumed defined keys without literal hits would be flagged, but none surfaced — suggesting dynamic access is rare in this codebase.
- **Settings-UI surface**: Settings audit (`roadmap/settings/settings-audit.md`) flagged 22 controls as ⚠ partial/unverified, of which several have config keys whose readers are indirect (event handlers, IPC bridges). These are not orphans — they are wired-but-hard-to-trace. Cross-reference with that doc for the full picture.

## Recommended next step

The dead-code sweep already lists the `@deprecated` keys with explicit removal notes. Treat that list as the actionable backlog for config cleanup; this audit confirms there are no *additional* hidden orphans beyond what's already known.
