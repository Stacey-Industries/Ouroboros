# Auto-Execution Briefs

This directory holds standalone briefs for autonomous overnight wave execution by Agent Teams teammates. Each `wave-NN.md` file is a self-contained instruction set for one teammate.

These files are **not part of the wave planning canon** — they are operational scripts. The authoritative wave plans live at `roadmap/wave-NN-plan.md`.

## What runs here

A `CronCreate(durable: true)` job set up on the night of 2026-04-25/26 fires at 05:05 local on 2026-04-26. The cron prompt instructs the lead session to spawn an Agent Team with three teammates, each pointed at one of the brief files in this directory.

## Branch policy

Each teammate works on its own branch (`auto/wave-NN`) off whatever `master` HEAD was when it started. **No teammate pushes, fetches, or merges.** All commits stay local for review on wake.

## On completion

Each teammate writes a `wave-NN-result.md` summary file as its final commit on its branch (NOT on `master`). If a teammate hits a true blocker, it writes `wave-NN-blocked.md` with the question instead of guessing.

## Cleanup after the run

After review, delete this directory or move briefs to a results archive. The briefs are not durable artifacts — they're for one specific overnight run.
