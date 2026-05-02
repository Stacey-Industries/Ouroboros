# Overnight Wave Run — Handoff for Fresh Claude Code Session

**Audience:** the *fresh* Claude Code session the user launches after exiting the current one and setting `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. NOT the user. The user pastes the contents of this file (or points to its path) as the first message.

---

## Background

The user is on Max subscription and wants to burn weekly quota in the 4-hour window between `05:00` and `09:00` local on `2026-04-26`. They are going to bed shortly after pasting this handoff. Three independent Ouroboros wave plans are queued for autonomous execution by an Agent Team:

- **Wave 46** — Chat-Only Workstation Parity (renderer-heavy)
- **Wave 48** — Token Baseline Quick Wins (main/orchestration)
- **Wave 53** — Telemetry Recovery & Router Signal Restoration (telemetry plumbing)

Each wave plan is a **draft**. Teammates refine and judge; they do not blindly execute. Each runs on its own branch (`auto/wave-46`, `auto/wave-48`, `auto/wave-53`), commits stay local, nothing is pushed or merged. Hard stop at `08:45` local.

The detailed per-teammate briefs are at:
- `roadmap/auto-briefs/wave-46.md`
- `roadmap/auto-briefs/wave-48.md`
- `roadmap/auto-briefs/wave-53.md`

---

## Your job in this fresh session

1. **Pre-flight (do these now, before scheduling anything):**

   a. Verify the experimental flag is set in your environment:
   ```bash
   echo "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-unset}"
   ```
   Expected: `1`. If `unset`, **stop immediately** and tell the user — they need to relaunch Claude Code with the env var set. Do not proceed.

   b. Verify your model and effort. Per the user's instruction, you (and the teammates you spawn) should be running **Opus on medium reasoning effort**. Check via `/model` if needed. If you are not on Opus medium, tell the user before scheduling — they may need to relaunch with the right launch flags.

   c. Verify working directory:
   ```bash
   pwd                                    # expect /c/Web App/Agent IDE
   git rev-parse HEAD                     # note this SHA
   git status --short                     # expect ~1 untracked/modified line on tools/__fixtures__/train-context/test-output-weights.json (acceptable; do NOT commit or revert)
   ```

   d. Confirm all three brief files exist and are readable:
   ```bash
   ls roadmap/auto-briefs/wave-46.md roadmap/auto-briefs/wave-48.md roadmap/auto-briefs/wave-53.md
   ```

   If any pre-flight check fails, stop and tell the user. Do not improvise.

2. **Schedule the trigger.** Use `CronCreate` to register a one-shot job that fires at `05:05` local on `2026-04-26`:

   ```
   cron: "5 5 26 4 *"
   recurring: false
   prompt: <the spawn prompt below, verbatim>
   ```

   **Cron is session-only in this runtime** — you must remain alive until it fires. Do not exit. Do not let the user accidentally exit (warn them if they say "good night, see you in the morning" — confirm they're leaving you running).

3. **Confirm to the user** with `CronList`. Show the registered job. Explicitly tell the user:
   - "I am scheduled to fire at 05:05 local. I will remain idle until then."
   - "Your machine must stay awake. Confirm Windows power settings (Settings → System → Power → 'Sleep: Never' on plugged-in)."
   - "Do not close this Claude Code window."

4. **Go idle.** Do not start any work. Do not generate suggestions. Do not test things. Wait for the cron to fire.

---

## The spawn prompt (paste verbatim into `CronCreate.prompt`)

> It is now ~05:05 on 2026-04-26. The user's 5-hour window has just reset (at 05:00). Weekly quota resets at 09:00 — you have ~3h 40m before unused capacity is forfeit. The user is asleep. Spawn an Agent Team and step back.
>
> **Pre-flight (abort cleanly on any failure):**
>
> 1. `echo "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-unset}"` must return `1`. If not, write `roadmap/auto-briefs/abort.md` on a new branch `auto/abort-no-env`, commit, and stop.
> 2. Working directory must be the Ouroboros repo. `git rev-parse HEAD` should match the SHA noted at handoff time (or be a descendant — the user may have committed before bed, that's fine).
> 3. All three briefs must exist: `roadmap/auto-briefs/wave-46.md`, `wave-48.md`, `wave-53.md`. If any missing, write `roadmap/auto-briefs/abort.md`, commit on a new branch `auto/abort-missing-brief`, stop.
>
> **Spawn the team.** Issue this directive verbatim:
>
> ```
> Create an agent team to execute three independent Ouroboros wave plans in parallel. Use Opus on medium reasoning effort for each teammate. Spawn three teammates:
>
> - Teammate 1 — Wave 46 implementer. Read roadmap/auto-briefs/wave-46.md in full and execute exactly as instructed there. Branch: auto/wave-46. Hard stop: 08:45 local.
> - Teammate 2 — Wave 48 implementer. Read roadmap/auto-briefs/wave-48.md in full and execute exactly as instructed there. Branch: auto/wave-48. Hard stop: 08:45 local.
> - Teammate 3 — Wave 53 implementer. Read roadmap/auto-briefs/wave-53.md in full and execute exactly as instructed there. Branch: auto/wave-53. Hard stop: 08:45 local.
>
> Teammates work independently — no peer messaging required, no peer messaging permitted. None push, fetch, or merge. None touch master. Each ends with a roadmap/auto-briefs/wave-NN-result.md commit on its own branch (or a wave-NN-blocked.md if blocked, or a wip(wave-NN): partial commit if stopped at the hard stop).
> ```
>
> **Post-spawn:** Once teammates accept their briefs, write `roadmap/auto-briefs/lead-dispatched.md` with:
> - Timestamp of spawn
> - Master HEAD SHA at dispatch
> - Confirmation each teammate accepted its brief
> - Any pre-flight warnings observed
>
> Commit it on a fresh branch `auto/lead-log`. Do not commit it to master.
>
> Then **go idle.** Do NOT poll teammates. Do NOT enter the chat workbench, monitor, or any UI. Do NOT start your own implementation work. Wait until 09:00 local, then write a brief `roadmap/auto-briefs/lead-final.md` summarizing what each teammate's branch contains based on `git log auto/wave-46`, `git log auto/wave-48`, `git log auto/wave-53`. Commit on `auto/lead-log`. Stop.
>
> **If the spawn itself fails** (feature not enabled, harness rejects the directive): write `roadmap/auto-briefs/lead-failure.md` with the exact error, commit on `auto/lead-failure`, stop. Do NOT fall back to plain subagents — those die when the lead exits, defeating the purpose.

---

## Things to know that the briefs already cover

You don't need to repeat these to the teammates — their briefs already include them — but for your own situational awareness:

- The user's `~/.claude/` config is load-bearing. Catalog routing, model-selection rule, lint-awareness, debug-before-fix, no-secrets, frontend-tokens, lockfile rules — all apply.
- Agent Teams teammates inherit user's custom subagent definitions from `~/.claude/agents/` (haiku-explorer, sonnet-implementer, etc.). They do **not** inherit `skills` or `mcpServers` declarations from those files (per Claude Code docs on agent-teams).
- The codebase-memory MCP graph tools may or may not be available to teammates depending on MCP server inheritance. If teammates need graph queries and don't have them, they fall back to Grep/Read. Their briefs already say this is fine.
- Memory file at `~/.claude/projects/C--Web-App-Agent-IDE/memory/MEMORY.md` documents key constraints: Max subscription / no API key (no direct SDK calls), new boolean feature flags default true, telemetry jsonls dark for claude-code paths.

---

## Stop conditions for you (the lead)

You are done after:
1. Cron is registered and confirmed via `CronList`.
2. User has been told what to expect and has confirmed they're leaving you running.
3. You go idle.

Do not interpret "go idle" as "do speculative prep work." Do not run tests. Do not read the wave plans yourself "to be helpful." The teammates will read them at 05:05. Your job between now and 05:05 is to exist.
