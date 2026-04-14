/**
 * routerShadow.ts — Shadow-routes terminal prompts for training data collection.
 *
 * Called from hooks.ts on every non-suppressed hook event. Only acts on
 * `user_prompt_submit` events with a non-empty prompt field. Runs the
 * router for LOGGING ONLY — never changes the model used by the terminal session.
 */

import { app } from 'electron';

import { getConfigValue } from '../config';
import log from '../logger';
import { routePromptSync } from './orchestrator';
import { buildEnrichedLogEntry } from './routerFeedback';
import { createRouterLogger } from './routerLogger';

/* ── Types ───────────────────────────────────────────────────────────── */

/** Minimal subset of HookPayload — avoids circular import from hooks.ts. */
interface ShadowHookEvent {
  type: string;
  sessionId: string;
  prompt?: string;
  cwd?: string;
}

/* ── Logger (lazy singleton, same pattern as orchestrator.ts) ─────── */

let logger: ReturnType<typeof createRouterLogger> | null = null;

function getLogger(): ReturnType<typeof createRouterLogger> | null {
  if (logger) return logger;
  try {
    logger = createRouterLogger(app.getPath('userData'));
    return logger;
  } catch {
    return null;
  }
}

/** Minimal event shape for chat shadow routing. */
interface ShadowChatEvent {
  prompt: string;
  sessionId: string;
  workspaceRoot?: string;
}

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Shadow-route a chat prompt for training data collection.
 * Logs a routing decision with interactionType: 'chat_shadow' but never
 * affects the model actually used for the chat send.
 */
export function shadowRouteChatPrompt(event: ShadowChatEvent): void {
  if (!event.prompt || event.prompt.trim().length === 0) return;

  const routerConfig = getConfigValue('routerSettings');
  if (!routerConfig?.enabled) return;

  const decision = routePromptSync(event.prompt, undefined, routerConfig);
  if (!decision) return;

  const entry = buildEnrichedLogEntry({
    prompt: event.prompt,
    decision,
    opts: {
      interactionType: 'chat_shadow',
      sessionId: event.sessionId,
      workspaceRoot: event.workspaceRoot,
    },
  });

  const sink = getLogger();
  if (!sink) return;
  sink.log(entry);
  log.debug('[router:shadow:chat]', { tier: entry.tier, session: event.sessionId });
}

/**
 * Shadow-route a hook event for training data collection.
 * Only processes `user_prompt_submit` with a non-empty prompt.
 * Safe to call on any hook event — non-matching types return immediately.
 */
export function shadowRouteHookEvent(event: ShadowHookEvent): void {
  if (event.type !== 'user_prompt_submit') return;
  if (!event.prompt || event.prompt.trim().length === 0) return;

  const routerConfig = getConfigValue('routerSettings');
  if (!routerConfig?.enabled) return;

  const decision = routePromptSync(event.prompt, undefined, routerConfig);
  if (!decision) return;

  const entry = buildEnrichedLogEntry({
    prompt: event.prompt,
    decision,
    opts: {
      interactionType: 'terminal_shadow',
      sessionId: event.sessionId,
      workspaceRoot: event.cwd,
    },
  });

  const sink = getLogger();
  if (!sink) return;
  sink.log(entry);
  log.debug('[router:shadow]', { tier: entry.tier, session: event.sessionId });
}
