# Wave 34 — Cross-Device Session Dispatch

## Implementation Plan

**Version target:** v2.3.0 (minor).
**Feature flag:** `mobile.dispatch` (default `false`; flips to `true` once Waves 33a + 33b ship and soak passes).
**Dependencies:** Wave 33a (pairing + capability gate), Wave 33b (native shell — required for native push notifications).
**Reference:** `roadmap/roadmap.md:1617-1662`.

**Goal:** Send a task from the mobile app to the desktop Ouroboros — the user's own instance dispatches its own agent runs against its own projects. No cloud.

**Prior art:**
- `src/main/pty.ts` + `src/main/sessionManager*.ts` — session lifecycle.
- Wave 16's worktree infrastructure — sessions can optionally create a fresh worktree.
- Wave 33a capability gate — `sessions:dispatchTask` will be classified `'paired-write'`.
- Wave 33b push plugin — required for completion notifications; if 33b pushes are deferred, Phase F below degrades to in-app banner only.

---

## Phase breakdown

| Phase | Scope | Key files |
|-------|-------|-----------|
| A | **Dispatch data model + queue.** `src/main/session/sessionDispatch.ts` — `DispatchRequest`, `DispatchJob`, `DispatchQueue` (FIFO, persisted to config so a desktop restart doesn't lose queued jobs). Config key `sessionDispatch.queue: DispatchJob[]`. Status states: `queued | starting | running | completed | failed | canceled`. No wiring yet — data model + in-memory + persistence only. | `src/main/session/sessionDispatch.ts`, `sessionDispatchQueue.ts`, config schema, tests |
| B | **Dispatch IPC + capability registration.** `sessions:dispatchTask({ title, prompt, projectPath, worktreeName? })` handler — validates input, enqueues a `DispatchJob`, returns `{ success, jobId }`. `sessions:listDispatchJobs`, `sessions:cancelDispatchJob(id)`. Register `sessions:dispatchTask` as `'paired-write'` + `'long'` in the Wave 33a channel catalog. | `src/main/ipc-handlers/sessionDispatchHandlers.ts`, `src/main/ipc.ts`, Wave 33a `channelCatalog.ts` additions, tests |
| C | **Runner.** `sessionDispatchRunner.ts` pulls from the queue, spawns a session (reusing existing `sessionManager.spawn` path), optionally creates a worktree, begins the agent turn with the prompt. Respects a configurable concurrency cap (default 1). On completion, updates job state + emits `sessionDispatch:status` event. On failure, captures error message + stack. | `src/main/session/sessionDispatchRunner.ts`, tests (mock sessionManager) |
| D | **Status streaming.** `sessionDispatch:status` push events (via existing WS bridge broadcast). Renderer hook `useDispatchJobs()` subscribes and maintains state. Desktop Sidebar session list shows dispatched sessions with a badge; Mobile dispatch screen shows status + live output tail. | `src/renderer/hooks/useDispatchJobs.ts`, `src/main/web/broadcast.ts` (existing), UI integration points |
| E | **Mobile Dispatch screen.** `src/renderer/components/Dispatch/DispatchScreen.tsx` — form (title, prompt, project picker, worktree toggle+name), queue list, job detail view with live log tail. Becomes a primary panel under mobile-primary layout (Wave 32 preset) — new `MobileNavBar` item `dispatch` OR a screen reachable from chat overflow menu (pick the one that fits the 4-panel nav; if 4+1 is too many, use chat overflow menu instead). | `DispatchScreen.tsx`, sub-components for form + list + detail, `AppLayout.mobile.tsx` update if nav item added, tests |
| F | **Native push notifications.** Requires Wave 33b `@capacitor/push-notifications` plugin. On job `completed` or `failed`, server-side: look up the device's push token (stored in Wave 33b during device-registers-for-push flow), send via FCM (Android) / APNs (iOS — deferred). If 33b didn't ship push, degrade: show an in-app banner on next foreground instead. | `src/main/session/sessionDispatchNotifier.ts`, `src/main/mobileAccess/pushTokens.ts`, Wave 33b integration, tests |
| G | **Desktop-offline handling.** Mobile detects WSS connection lost via existing Wave 33a reconnect hook. If user tries to dispatch while disconnected, show "desktop offline — saved, will send on reconnect" message; queue locally in mobile's storage; on reconnect, replay. Cap at 10 queued local dispatches; beyond that reject with "desktop unreachable — please retry later." | `src/web/offlineDispatchQueue.ts`, `DispatchScreen.tsx` (state handling), tests |
| H | **E2E + docs.** Playwright E2E (mobileWeb project from Wave 32): simulate dispatch → assert desktop spawns session → assert status streams back → assert cancellation path. Document in `docs/mobile-dispatch.md`. | `e2e/mobile/dispatch.spec.ts`, `docs/mobile-dispatch.md` |

---

## Architecture notes

**Why persist the queue (Phase A):**
A user dispatching from their commute expects the job to run even if the desktop crashes and restarts. Queue entries live in `config.sessionDispatch.queue`. On desktop boot, the runner resumes any `queued` jobs. `running` jobs on boot are marked `failed: 'desktop-restart-during-run'` — don't try to resume mid-turn (the PTY state is gone).

**Concurrency cap (Phase C):**
Default 1 — the desktop runs one agent at a time via dispatch. User can raise via `sessionDispatch.maxConcurrent`. Higher values risk model-API rate limits and confuse the user watching the sidebar. Hard cap at 3.

**Project path validation (Phase B):**
Incoming `projectPath` must match one of the user's configured project roots (`config.multiRoots` or the per-window `projectRoots`). Reject arbitrary paths — capability gate alone isn't enough since a `paired-write` channel could be abused to spawn sessions outside user projects.

**Push token lifecycle (Phase F):**
Mobile registers for push on app launch via `PushNotifications.requestPermissions()` + `PushNotifications.register()`. On token receipt, call new Wave 33b IPC `mobileAccess:registerPushToken({ deviceId, token, platform })`. Server stores in `pairedDevice.pushToken` (never returns this field to renderer). On revocation, token is cleared.

---

## Risks

- **FCM / APNs key management** — FCM requires a service-account JSON in desktop config. Document as optional — users who don't want cloud push can skip registration; in-app banner fallback is sufficient.
- **Queue starvation** — if a long-running job hangs, the queue blocks. Mitigation: per-job timeout (`sessionDispatch.jobTimeoutMs`, default 30 min). On timeout, mark `failed: 'timeout'`, kill the session, advance queue.
- **Mobile-side queue diverges from desktop** — if the user dispatches offline, then the desktop is restarted before reconnect, both sides think the job is queued. Fix: each mobile-queued job has a uuid; the replay-on-reconnect handshake is idempotent (desktop rejects if the uuid is already seen).

---

## Acceptance

- Phone dispatches a task; desktop spawns a session within 10 s; status streams back live.
- Completion triggers a native notification (or in-app banner if push is absent).
- Cancelling a queued job removes it from both mobile and desktop queue.
- Restarting the desktop preserves queued jobs (but not in-flight ones).
- Dispatched sessions show up in desktop sidebar alongside local sessions.

---

## Exit gates

- 2-week dogfood with ≥ 10 real cross-device dispatches.
- No queue lost on desktop restart during the dogfood.
- Push notifications deliver within 30 s on a typical cellular network (OR in-app banner fallback if push is deferred).

---

## Per-phase commit format

`feat: Wave 34 Phase X — short summary`

Co-author trailer:
```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Parent pushes once after Phase H lands. No subagent push.
