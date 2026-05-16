# Git hooks

This directory holds repo-tracked git hooks. To install them in your clone, run once:

```
git config core.hooksPath scripts/hooks
```

Git will look here for hook scripts instead of `.git/hooks/`. Any file with executable bit set whose name matches a known hook (`pre-push`, `pre-commit`, etc.) will fire.

## `pre-push`

Blocks pushes that change `package-lock.json` without a valid `.lockfile-sync.marker`. The marker is written by `npm run lockfile:sync`; if you edited the lockfile by hand or via a non-sanctioned npm install, the marker won't match and the push is blocked with a message naming the fix command.

Advisory bypass for legitimate exceptions: `LOCKFILE_SYNC_GUARD_BYPASS=1 git push`.

Background: see `roadmap/wave-92-cross-platform-lockfile-stryker/`.
