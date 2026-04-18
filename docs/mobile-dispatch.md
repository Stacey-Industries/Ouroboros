# Cross-Device Session Dispatch

Send a task from your phone (or any paired device) to your desktop Ouroboros. The desktop spawns a Claude Code session against one of your configured projects and streams status back to the mobile view — all peer-to-peer, no cloud relay.

---

## Overview

Cross-Device Dispatch lets you queue an agent task from your mobile device and have it run on your desktop machine. You describe what you want done (a title and a prompt), pick the project, and tap Submit. The desktop dequeues the job, spawns a Claude Code session against that project, and pushes status updates back to your device in real time.

This is a one-way dispatch: you send instructions to the desktop, and the desktop runs them. The result (code changes, output) lives in the desktop project. You can monitor progress from the Dispatch queue view and cancel a running job if needed.

---

## Prerequisites

1. **Mobile Access enabled** (Wave 33a) — the desktop must be running the Ouroboros web server with `mobileAccess.enabled = true` and your device must be paired. See `docs/mobile-access.md` for setup.

2. **Dispatch enabled** — set `sessionDispatch.enabled = true` in desktop settings (Settings → Mobile → Session Dispatch). This can also be toggled via the config API: `config.set('sessionDispatch.enabled', true)`.

3. **A configured project root** — the desktop must have at least one project root configured (the project you want the agent to work in). Add roots via the desktop IDE's Project Picker or Settings.

4. **Android app or web build accessible** — either the Capacitor Android build (`com.stacey.ouroboros`) or the web build served at the desktop's LAN address. See `docs/mobile-dev.md` for build instructions and `docs/mobile-access.md` for network access options (LAN, reverse proxy, Cloudflare Tunnel).

---

## Using Dispatch from Mobile

### Opening Dispatch

1. Open the Ouroboros web app or Android app on your paired device.
2. Navigate to the **Chat** panel (the rightmost panel in the mobile nav bar).
3. Tap the **gear icon** in the Chat panel header to open the secondary-views menu.
4. Select **Dispatch** from the menu.

On desktop-width viewports the gear opens a dropdown; on phone viewports it opens a bottom sheet. Both expose the Dispatch entry.

Alternatively, any part of the app can open Dispatch programmatically via the `agent-ide:open-dispatch` DOM event.

### Filling the Dispatch Form

The form has three required fields and one optional one:

| Field | Required | Notes |
|---|---|---|
| **Title** | Yes | Brief label shown in the queue. |
| **Prompt** | Yes | Full instruction for the agent. Be specific — the agent cannot ask follow-up questions. |
| **Project** | Yes | One of your configured desktop project roots. |
| **Worktree** | No | Toggle to have the runner create a fresh git worktree before starting the session. Useful to keep the work isolated from your current branch. Enter the worktree name when enabled. |

### Submitting

Tap **Dispatch**. The form clears and the view switches to the **Queue** tab, where your job appears with status `queued`.

The desktop picks up the job within seconds (subject to network latency and concurrency cap). Status transitions: `queued → starting → running → completed` (or `failed` / `canceled`).

### Monitoring Progress

The Queue view shows all jobs, split into **Active** (queued/running) and **Completed** (completed/failed/canceled) sections. Each card shows:

- **Title** — what you submitted.
- **Age** — how long ago the job was created.
- **Project** — last path segment of the project root.
- **Status pill** — colored by state.

Tap a job card to open the **Detail view**, which shows the full title, prompt, project path, timestamps, and any error message on failure.

> **Note on log streaming:** Real-time agent log output in the detail view is planned for a future wave. The current detail view shows static job metadata only.

---

## Offline Behavior

If your device loses its connection to the desktop while you are filling the form, the form banner changes to:

> Desktop offline — your dispatch will send when we reconnect.

The submit button label changes to **Save — send when online**.

When you submit in offline mode, the job is saved to your device's local storage rather than sent immediately. Up to **10 dispatches** can be queued locally. Beyond that limit the form shows an error:

> Too many offline dispatches queued — try again later.

When the connection to the desktop is restored, the offline queue drains automatically. Each locally queued entry has a UUID (the `clientRequestId`) that makes replay idempotent — if the desktop already processed an entry (e.g. because the connection dropped after the server acknowledged it), the duplicate is discarded silently.

An **offline badge** on the form shows how many entries are currently waiting to drain.

---

## Notifications

**In-app banner (always available):** When a dispatched job completes or fails while the app is in the foreground, a banner notification appears at the top of the screen.

**Push notifications (future):** Native push via FCM (Android) requires a service-account JSON configured on the desktop (`sessionDispatch.fcmServiceAccountPath`). The FCM adapter is implemented in `src/main/session/sessionDispatchNotifier.ts` but is currently a stub — no production FCM credentials are shipped. This is documented future work; the in-app banner is the primary notification path until push is fully wired.

---

## Canceling a Job

To cancel a **queued or running** job:

- From the **Queue view**: tap the **Cancel** button on the job card.
- From the **Detail view**: tap the **Cancel** button in the header.

Cancellation sends a `sessions:cancelDispatchJob` IPC call to the desktop. The desktop terminates the session (if running) and marks the job `canceled`. The status pill updates on your device in real time via the `sessionDispatch:status` push event.

Completed, failed, and already-canceled jobs cannot be canceled — the Cancel button is hidden for those states.

---

## Troubleshooting

### "Project path not allowed"

The submitted `projectPath` does not match any of the desktop's configured project roots. The handler validates paths against `config.multiRoots` / per-window `projectRoots` for security. Fix: ensure the project is added to the desktop's Project Picker before dispatching.

### "Too many offline dispatches queued"

Your device has 10 locally queued dispatches waiting to drain. Wait for the desktop connection to restore and the queue to drain, then try again. You can monitor the count via the offline badge on the Dispatch form.

### "Duplicate"

The server received a dispatch with a `clientRequestId` it has already processed. This is a safe condition — the job ran (or is running) from the original submission. The duplicate entry is dropped and does not create a second job. You will see the original job in the queue.

### Dispatch view not visible in the secondary-views menu

Dispatch is only shown when `sessionDispatch.enabled = true` **or** `mobileAccess.enabled = true`. Check desktop Settings → Mobile and confirm at least one is enabled.

### Jobs stuck in `queued` indefinitely

The desktop's dispatch runner may be at its concurrency cap (default 1, configurable via `sessionDispatch.maxConcurrent` up to 3). Wait for the running job to finish, or cancel it to unblock the queue.

### Desktop restarted mid-job

Jobs that were `running` when the desktop restarted are marked `failed: 'desktop-restart-during-run'`. The PTY state is gone and cannot be recovered. Jobs that were still `queued` survive the restart and resume automatically.
