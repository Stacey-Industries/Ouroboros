---
title: Ouroboros — Product Vision
status: ACTIVE
established: 2026-05-08
---

# Ouroboros — An IDE That Teaches You

## The framing

Agent AI removes the labor of typing code. That's table stakes now — Cursor, Windsurf, Copilot, and Claude Code Desktop all do it competently. What none of them do is **close the comprehension gap**: someone who relies on an agent to write code still needs to understand that code well enough to ship it, debug it, evolve it, and grow as an engineer.

Ouroboros is the IDE that closes that gap. The agent is your hands; the IDE is your interpreter; you grow alongside the codebase you're shipping.

This is not a "side feature" or a "learning mode toggle." It is the product's core job.

## The "amplifier not replacement" axiom

A prior memory entry captures the user's stated philosophy: agent AI is an amplifier of the user, not a replacement. This vision statement is that axiom sharpened into a product position. The agent is not replacing the user — it is pulling them up. The IDE's job is to make that climb visible.

Without the climb being visible, agent AI produces a learned helplessness: code accumulates that the user doesn't understand and can't reason about. The user becomes dependent on the agent in the same way an early-career developer becomes dependent on Stack Overflow — they can ship, but they can't grow. That is a failure of the tooling, not the model.

## How the product expresses the vision

The vision implies three modes that surface different angles on the same comprehension goal. Each is independently usable; they cross-link so users can move between them based on their learning style and the moment.

| Mode | Question it answers | First wave |
|---|---|---|
| **Flow Tracer** | "What happens when X?" — causal/temporal | Wave 85 (in flight 2026-05-08) |
| **Inline captions + diff narrator** | "What is *this*, right where I'm looking?" — moment-to-moment | Wave 86 (planned) |
| **Galaxy Map + cross-linking** | "How is the codebase laid out?" — spatial/architectural | Wave 87 (planned) |

The cross-linking is load-bearing: a galaxy node opens a tracer for flows starting from that file; a tracer step opens the file with its caption already up; an inline caption links to the galaxy zoomed to that node. **Three doors into the same learning surface.** Different users — and the same user on different days — take different doors.

## What this is not

- **Not "AI explains code."** Generic explainers like "this function does X" are commodity. The vision is specifically about making the *system* legible — how layers connect, what fires when, why each piece exists in the context of the user's actual goals.
- **Not a replacement for documentation or mentorship.** Ouroboros doesn't claim to be a substitute for engineering education. It claims to be the *workflow surface* where the user's understanding compounds while they ship.
- **Not pedagogically rigid.** Different users learn differently. The product accommodates spatial learners (galaxy), causal learners (tracer), and contextual learners (inline captions) without privileging one mode.
- **Not finished after Waves 85-87.** The trio is the foundation. Future waves can include: agent narration of its own reasoning, code-change "diary" views, live trace-during-session mode, recorded learning paths, peer-shareable annotated tours.

## The positioning copy

For when this needs to land in a tagline, README, marketing surface, or onboarding flow:

> **Ouroboros — an IDE that teaches you.** Your agent writes the code. The IDE makes sure you understand it.

Or, less terse:

> **Agent AI ships the code. Ouroboros ships the understanding.** Every action your agent takes is annotated, traceable, and navigable in the way that fits how you learn — causal, spatial, or contextual.

The positioning is allowed to evolve as the modes ship. This file is the anchor; commit copy variants in marketing surfaces but cite this file as the source of truth for the framing.

## When to update this file

- A new mode joins the trio (a fourth comprehension surface that doesn't fit Flow Tracer / inline / galaxy).
- The "amplifier not replacement" axiom is challenged or sharpened by user feedback.
- A wave ships that materially changes the user's daily experience of the comprehension surface.

Do not update this file for individual feature additions or polish work. It is a positioning anchor, not a changelog.

---

*Established 2026-05-08 from the brainstorming session captured at `roadmap/docs/superpowers/specs/2026-05-08-flow-tracer-design.md`. Wave 85 ships the first mode (Flow Tracer).*
