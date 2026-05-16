---
vendor: 'wsl2 + node + windows'
sdkVersion: 'WSL2 Ubuntu 24.04 + nvm 0.40.4 + Node 20.20.2 / npm 10.8.2'
firstWritten: 2026-05-16
lastVerified: 2026-05-16
relatedPaths:
  - scripts/lockfile-sync.mjs
  - scripts/hooks/pre-push
  - scripts/wave-92-phase-3.acceptance.mjs
notes: 'Gotchas building Windows-side tooling that drives WSL2 + spawns child processes; surfaced during Wave 9 cross-platform lockfile work.'
---

# WSL2 + Windows-side child-process gotchas

Gotchas that bite when a Windows-side Node script orchestrates a WSL2 install pipeline or spawns external commands. Source: ported from Gamify Wave 9 + verified by Agent IDE Wave 92 Phase 1 walking skeleton (2026-05-16, Node 20.20.2 install: 2m25s, single-pass complete lockfile, no per-platform passes needed).

## Bash quoting

### `~` does NOT expand inside double quotes in bash

**Symptom:** A bash command like `mkdir -p "~/lockgen/gamify"` inside `wsl.exe -d Ubuntu -e bash -lc '...'` creates a literal `~/` directory in the cwd (which on `wsl.exe -e bash -lc` invoked from a Windows cwd is `/mnt/c/<your windows cwd>/`). The command "succeeds" but the install proceeds against the wrong filesystem.

**Why:** POSIX shells (bash, dash, sh) only perform tilde expansion when `~` is an unquoted token at the start of a word. Inside double quotes, `"~/foo"` is the literal three-character string `~/foo`. `mkdir -p` happily creates a directory named `~` in the current cwd.

**Fix:** Use `$HOME` instead. Variables ARE expanded inside double quotes: `"$HOME/lockgen/gamify"` resolves correctly. Equivalently, unquoted `~/lockgen/gamify` works for paths without spaces — but `$HOME` is the safer idiom when JavaScript-templates the command string.

**Source:** Gamify Wave 9 Phase 2, surfaced 2026-05-15. First implementer attempt used `WSL_LOCKGEN = '~/lockgen/gamify'` interpolated into double-quoted bash commands. Caught by the 9-minute cold-install timing signal (cross-fs penalty per research-9 §2) before the wave shipped.

## `wsl.exe` invocation from Windows

### Run `wsl.exe` from a normal Windows cwd, not a `\\wsl$\...` UNC path

**Symptom:** Running `wsl.exe -d Ubuntu -e bash -lc '...'` from a cwd inside the `\\wsl$\Ubuntu\...` UNC path produces inconsistent failures — npm and other tools error on path resolution, or the WSL2 process can't read files passed by absolute path.

**Why:** [npm/cli#6280](https://github.com/npm/cli/issues/6280) — Windows path handling regressions when the process cwd is a UNC path. Microsoft's guidance is to invoke WSL2 commands from a normal Windows cwd; the Linux process inherits that cwd as `/mnt/<drive>/<path>` and operates normally.

**Fix:** Set the `cwd` option to a Windows path (e.g. the repo root `C:\Web App\Agent IDE`) when calling `wsl.exe` from Node:

```js
spawnSync('wsl.exe', ['-d', 'Ubuntu', '-e', 'bash', '-lc', bashCmd], {
  cwd: REPO_ROOT, // a Windows path, NOT \\wsl$\...
  stdio: 'inherit',
  shell: false,
});
```

Inside the bash command, reference paths via `/mnt/c/...` (or use `$HOME` for the WSL2 user's home).

**Source:** Gamify Wave 9 research-9 §2 + `scripts/lockfile-sync.mjs` (Phase 2 implementation).

## Cross-filesystem cost

### Running `npm install` against `/mnt/c/...` is 3-5× slower

**Symptom:** A WSL2-side `npm install` operating on files under `/mnt/c/...` takes 3-5× longer than the same install on a WSL2-native path like `$HOME/lockgen/`. Historically up to 27.8× for repos with heavy small-file IO.

**Why:** `/mnt/c/...` is implemented via `9p` / `drvfs` — a filesystem-in-userspace protocol bridging Windows NTFS to Linux. Every syscall crosses the 9p boundary, which adds per-op latency. npm's tarball extraction does many small writes per package; cumulative penalty is 3-5×.

**Fix:** Always run heavy IO operations (npm install, builds) on a WSL2-native filesystem like `$HOME/...` (typically ext4). Only the final artifacts you need on the Windows side get copied back via `cp` across the `/mnt/c/` boundary. The Windows `node_modules/` is managed separately by Windows-side npm; never have WSL2-side npm write to it.

**Source:** [Microsoft Learn — Node.js on WSL2](https://learn.microsoft.com/en-us/windows/dev-environment/javascript/nodejs-on-wsl). Confirmed in Gamify Wave 9: Phase 1 native install was 1m14s; Phase 2 cross-fs install (the `~/lockgen/gamify` bug) was 9 minutes — exactly the 7× penalty.

## npm install scripts in lockgen pipelines

### Use `--ignore-scripts` when the lockgen dir is manifest-only

**Symptom:** `npm install` in a directory that only contains `package.json` + workspace manifests (no source files) fails with errors like `Error: Could not load --schema from provided path prisma/schema.prisma`. The install fails before producing `package-lock.json`.

**Why:** Workspace `package.json` files may declare `install` / `postinstall` / `prepare` scripts that reference source files (e.g. `apps/server`'s `prisma generate --schema prisma/schema.prisma`). A manifest-only lockgen dir doesn't have those source files, so the scripts fail.

**Fix:** Pass `--ignore-scripts` to the lockgen install. Lockfile resolution is independent of install-script execution — the resolver only reads `package.json` files. `--ignore-scripts` is also the canonical security defense for installing from untrusted deps (defeats supply-chain attacks via `postinstall`).

```bash
npm install --ignore-scripts --no-audit --no-fund
```

`--no-audit --no-fund` are unrelated; they just suppress cosmetic output for a cleaner log.

**Source:** Gamify Wave 9 Phase 1 walking skeleton, 2026-05-15. First lockgen attempt failed on `apps/server`'s prisma postinstall; `--ignore-scripts` fixed it.

## Spawning `.cmd` shims on Windows

### `spawnSync('npm.cmd', { shell: false })` is broken since Node 18.20

**Symptom:** Calling `child_process.spawnSync('npm.cmd', ['run', 'foo'], { shell: false })` on Windows always returns `{ status: null, error: { code: 'EINVAL' } }` regardless of whether the script exists. Same for `pwsh.cmd`, `yarn.cmd`, any other `.cmd` shim launcher.

**Why:** CVE-2024-27980 hardened Node's `child_process` against command-injection attacks via batch-file argument parsing. Since Node 18.20 / 20.12, `spawn` refuses to directly exec `.cmd` files because Windows requires going through `cmd.exe` to interpret them, and the Node maintainers couldn't safely escape arguments. The error is intentional, not a bug.

**Fix:** Pass `shell: true` when spawning `.cmd` files. This routes through the platform shell (cmd.exe on Windows), which handles `.cmd` correctly:

```js
spawnSync('npm run lockfile:sync', {
  cwd: REPO_ROOT,
  shell: true, // <-- required for npm.cmd on Windows since Node 18.20
  stdio: 'inherit',
});
```

Alternatively, invoke `cmd.exe /c npm.cmd run lockfile:sync` directly, but `shell: true` is simpler. **Be aware**: `shell: true` enables shell metacharacter parsing, so never pass untrusted user input as the command — that's the original CVE.

For non-`.cmd` executables (raw `node.exe`, `git.exe`), `shell: false` works as expected.

**Source:** [Node CVE-2024-27980 release notes](https://nodejs.org/en/blog/vulnerability/april-2024-security-releases). Gamify Wave 9 Phase 2 acceptance test originally used `shell: false` and failed every run — surfaced 2026-05-15.
