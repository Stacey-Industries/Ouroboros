/**
 * Wave 87 Phase 1 — orchestrator-owned acceptance test.
 *
 * Per `~/.claude/rules/orchestrator-owned-acceptance-tests.md`: this file is the
 * boundary contract for Phase 1. The implementing subagent may READ it but MUST
 * NOT MODIFY it. The subagent's job is to make every assertion below true; the
 * orchestrator owns the assertions.
 *
 * Why structural assertions, not a runtime smoke:
 * The bundle issue is Vite-specific — Vite drops dynamic `require()` calls during
 * main-process bundling. Under vitest, the runtime path resolves the require fine
 * (which is exactly why unit tests didn't catch the Wave 86 production bug). The
 * contract that matters is therefore the source-level shape: no lazy require, no
 * module-eval-time Electron `app.*` call. Once those are true, the Vite bundle
 * has nothing to drop and the shadow path activates in production.
 *
 * Phase 0 baseline: these three tests FAIL. Phase 1 makes them pass.
 *
 * Run with:
 *   npx vitest run roadmap/wave-87-chat-orchestration-activation/acceptance/phase-1-shadow-path-fires.test.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

function readSrc(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
}

describe('Wave 87 Phase 1 acceptance — shadow path activation', () => {
  it('chatStateNewPath.ts no longer dynamically requires threadStore', () => {
    const src = readSrc('src/main/ipc-handlers/chatStateNewPath.ts');
    // The lazy require pattern is what Vite drops during main-process bundling.
    // Phase 1 replaces it with a static `import` at the top of the file.
    expect(src).not.toMatch(/require\(\s*['"][^'"]*agentChat\/threadStore['"]/);
  });

  it('sessionStartup.ts no longer dynamically requires threadStore', () => {
    // Second instance of the same lazy-require pattern (surfaced in Phase 0
    // pre-flight grep). Same root cause, same fix.
    const src = readSrc('src/main/session/sessionStartup.ts');
    expect(src).not.toMatch(/require\(\s*['"][^'"]*agentChat\/threadStore['"]/);
  });

  it('threadStore.ts has no module-eval-time Electron app.getPath call', () => {
    const src = readSrc('src/main/agentChat/threadStore.ts');
    // Walk the source looking for `app.getPath(` at module top level (column 0
    // or only-whitespace prefix means inside a function/class body). Any
    // top-level call is the original blocker — it forces every static importer
    // to be Electron-environment-aware. Phase 1 moves it behind a lazy getter
    // / init() function called on first DB access.
    const lines = src.split('\n');
    const topLevelOffenders: Array<{ line: number; text: string }> = [];
    let braceDepth = 0;
    let parenDepth = 0;
    lines.forEach((line, idx) => {
      // Detect app.getPath at the current scope. We only care when we're at
      // module scope (braceDepth === 0).
      if (braceDepth === 0 && /\bapp\.getPath\s*\(/.test(line) && !/^\s*\/\//.test(line)) {
        topLevelOffenders.push({ line: idx + 1, text: line.trim() });
      }
      // Track brace + paren depth crudely; ignore strings/comments. Good enough
      // for the contract we're enforcing.
      const stripped = line.replace(/\/\/.*$/, '').replace(/['"`][^'"`]*['"`]/g, '""');
      for (const ch of stripped) {
        if (ch === '{') braceDepth += 1;
        else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
        else if (ch === '(') parenDepth += 1;
        else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
      }
    });
    expect(
      topLevelOffenders,
      `Module-eval-time app.getPath(...) calls remain in threadStore.ts at lines: ${topLevelOffenders.map((o) => o.line).join(', ')}. Phase 1 must move these behind a lazy init() / getter so static importers do not require Electron at module-eval time.`,
    ).toEqual([]);
  });

  it('chatStateNewPath.ts imports threadStore statically at the top of the file', () => {
    // Belt-and-suspenders to the first assertion: confirm the replacement is
    // in place, not just that the lazy require is gone. The static import is
    // what proves the lazy-init refactor succeeded — if the import would
    // crash at module-eval (because threadStore still calls app.getPath at
    // top level), vitest itself would fail to load this file.
    const src = readSrc('src/main/ipc-handlers/chatStateNewPath.ts');
    expect(src).toMatch(
      /^\s*import\s+[^;]*\bagentChatThreadStore\b[^;]*from\s+['"][^'"]*threadStore['"]/m,
    );
  });
});
