# Optimizing Agent Context: Lessons Learned

## The Problem We Solved

We had a repo (Contractor App) with **86 markdown files** across `ai/` and `docs/` directories — agent contracts, governance rules, enforcement docs, workflow guides, architecture references, audit reports, and meta-documentation about documentation. This was built over weeks using Windsurf, and the intent was good: give AI agents comprehensive instructions so they produce high-quality, architecturally sound code.

**It didn't work as intended.** Here's why, and what actually works.

---

## Why Heavy Documentation Fails

### 1. Agents learn from code, not prose

AI agents pattern-match from existing code more reliably than from written instructions. If your codebase has clean `Transport → Service → Repository` layering, agents replicate that pattern by reading the adjacent files. If the codebase is messy, no amount of documentation will override what the agent sees — it'll match the code, not the docs.

**The implication:** The single most effective thing you can do for agent code quality is maintain clean existing code. One well-structured service file teaches more than a 90-line governance enforcement document.

### 2. Documentation has diminishing — then negative — returns

A 20-line CLAUDE.md with hard constraints (security rules, gotchas, import boundaries) is highly effective. Every line gets read and followed. At 86 files and thousands of lines, the agent spends context window budget navigating documentation instead of reading code. Worse, when docs conflict with each other (which happens inevitably at scale), the agent has to guess which one is authoritative.

In the Contractor App, `AGENT_CONTRACT.md` defined governance rules. `rules/90_governance_enforcement.md` repeated them with slight variations. `reference/ENFORCEMENT.md` pointed back to `AGENT_CONTRACT.md`. Three files saying roughly the same thing, consuming context, and occasionally diverging.

### 3. Most documentation duplicates what's already enforced elsewhere

| What the doc said | What already enforced it |
|---|---|
| "Don't cross import boundaries" | `repo-guard.mjs` (CI script) |
| "Run lint before handoff" | CI pipeline (`verify:pr`) |
| "Use Zod contracts for validation" | Existing contract files in `packages/contracts/` |
| "Follow architecture layers" | The code itself — agents see the pattern |
| "Run tests" | `package.json` scripts |

Documentation that restates what code/CI already enforces is pure overhead. The script IS the rule. The types ARE the contract. The doc is a stale duplicate.

### 4. Documentation rots immediately

Every doc file is a maintenance liability. Code changes but docs don't get updated. Within days of writing them, accuracy starts degrading. We experienced this firsthand in the Ouroboros project: docs pointed to files that had been renamed, described patterns that had been refactored, and listed APIs that no longer existed.

The Contractor App had `docs/product/API_CONTRACT.md` describing API endpoints — but the actual contracts lived in `packages/contracts/`. Any divergence between the two was a source of agent confusion, not clarity.

### 5. Tooling compensation creates unnecessary overhead

The `ai/` directory structure (index.md, README.md, workflow chooser, agent troubleshooting guide, multi-agent execution guide) existed because Windsurf doesn't auto-load context files. Agents needed explicit instructions on where to find information. This is a tooling limitation, not a documentation need.

Claude Code's CLAUDE.md system eliminates this entirely — root files load automatically, subdirectory files load lazily when relevant. No navigation index needed.

---

## What Actually Works

### The effective context stack (in priority order)

**1. Clean code (highest impact, zero maintenance)**
Agents clone patterns from existing files. If `apps/api/src/routes/pipeline/estimates.ts` follows the Transport → Service → Repository pattern, agents will follow it when creating `quotes.ts`. No documentation needed.

**2. Deterministic enforcement (linters, CI, type system)**
Rules that are checked by machines don't need to be written for agents. ESLint complexity limits, TypeScript strict mode, Zod contract validation, import boundary guards — these catch violations that documentation can only ask agents to avoid. Machines are better enforcers than prose.

**3. Auto-generated CLAUDE.md files (~5-15 lines per module)**
A generator that analyzes code and produces structural summaries per directory. These load lazily when agents work in that directory. They describe what's there (key files, patterns, dependencies) so agents orient quickly. They're auto-maintained, so they don't rot.

**4. Root CLAUDE.md (~50-100 lines of hard rules)**
The stuff that can't be derived from code or enforced by tools:
- Security constraints ("never trust renderer input", "validate all paths through assertPathAllowed")
- Gotchas born from painful experience ("no WebGL addon — causes ghost cursor artifacts")
- Meta-development rules ("never kill Electron processes — that's the host IDE")
- Import/architecture boundaries (if not enforced by a guard script)

**5. Two human-written docs (vision + security)**
- `vision.md` — Product direction and design principles. Helps you (the human) steer agent suggestions that are locally correct but strategically wrong.
- `security.md` — Trust boundaries, auth model, input validation rules. These are invisible in code and critical to get right.

### What this looks like in practice

```
CLAUDE.md                        <- Auto-loaded. Conventions, gotchas, hard rules. ~80 lines.
docs/
  vision.md                      <- Human doc. Product direction.
  security.md                    <- Human doc. Trust boundaries.
src/main/CLAUDE.md               <- Auto-generated. Module structure + patterns.
src/renderer/components/CLAUDE.md <- Auto-generated. Component patterns.
(etc — one per significant module)
```

**~10 files replacing 86.** No navigation index. No meta-documentation. No enforcement docs that duplicate CI scripts. No workflow choosers. No agent contracts.

---

## The Automated CLAUDE.md Generator

We built an automated system that maintains subdirectory CLAUDE.md files:

**How it works:**
1. Discovers directories with 3+ code files under `src/`
2. For each, builds a prompt with file listing + key file excerpts + parent context
3. Spawns `claude -p --output-format text --model <model>` to generate content
4. Writes results using section markers (`<!-- claude-md-auto:start -->` / `<!-- claude-md-auto:end -->`)
5. Human-written content outside the markers is preserved across regenerations

**Trigger options:**
- Manual (button in Settings)
- Post-session with idle debounce (generates after you stop working, not after every interaction)
- Post-commit

**Key design decisions:**
- Uses section markers so human-written gotchas are never overwritten
- Processes directories sequentially to avoid spawning too many Claude processes
- Has a 3-minute cooldown to prevent recursive triggers (the generator's own `claude -p` calls fire `session_stop` hooks)
- Scoped to the correct project via `cwd` in hook payloads (not a global default)

---

## The Anti-Patterns to Avoid

### Don't: Write documentation that restates code
If `packages/contracts/src/estimates.ts` defines the estimate schema with Zod, don't also describe it in `docs/product/DATA_MODEL.md`. The Zod schema IS the documentation. When they diverge, agents trust the wrong one.

### Don't: Write enforcement docs for things CI enforces
If `repo-guard.mjs` blocks cross-app imports, don't also write "Apps do NOT import other apps" in a governance doc. The guard catches violations. The doc just adds maintenance burden.

### Don't: Create navigation indexes for agent context
Files like `ai/index.md` ("jump to task-relevant docs") exist because the tooling can't auto-discover context. With Claude Code's CLAUDE.md lazy loading, subdirectory context is discovered automatically when the agent touches files there.

### Don't: Write rules you can enforce with tools
"No blanket lint suppression" is better enforced with an ESLint plugin that blocks `eslint-disable` comments than with a paragraph in an agent contract. Deterministic enforcement > prose rules.

### Don't: Duplicate the same rule in multiple files
Having the governance rules in `AGENT_CONTRACT.md`, repeated in `rules/90_governance_enforcement.md`, and referenced from `reference/ENFORCEMENT.md` creates three maintenance points and three potential sources of divergence. One authoritative location, loaded automatically.

### Do: Write down what's invisible in code
Security constraints, design rationale ("why we chose X over Y"), painful gotchas, product principles. These can't be derived from reading code or running tools. They're the 20% of documentation that provides 80% of the value.

---

## Summary

| Approach | Files | Maintenance | Agent effectiveness |
|---|---|---|---|
| Heavy documentation (Contractor App) | 86 | Constant, error-prone | Moderate — context window bloat, stale docs, conflicts |
| Auto-generated CLAUDE.md + minimal rules | ~10 | Automated + minimal manual | High — fresh context, no bloat, loaded exactly when relevant |

The best agent context system has three properties:
1. **Small enough to always be read** (not skimmed or skipped)
2. **Auto-maintained where possible** (structure/patterns from code analysis)
3. **Human-written only for what humans uniquely know** (security, gotchas, vision)

Everything else is either enforced by tools or learned from code.
