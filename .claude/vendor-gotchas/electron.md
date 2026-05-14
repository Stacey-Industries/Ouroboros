---
vendor: "electron"
sdkVersion: "electron 41.1.0"
firstWritten: 2026-05-14
lastVerified: 2026-05-14
relatedPaths:
  - .github/workflows/ci.yml
  - package.json
notes: "electron's postinstall (binary download) interaction with npm ci --ignore-scripts in CI."
---

# electron gotchas

> First written 2026-05-14 (Wave 88 wave-end CI investigation). Re-check when `electron` bumps major or the CI install strategy changes.

## CI / install

### `npm ci --ignore-scripts` skips electron's postinstall — the binary never downloads

**Symptom:** On a cold-cache CI runner, every test file that imports `electron`, `electron-log`, or `electron-store` fails at collection with `Error: Electron failed to install correctly, please delete node_modules/electron and try installing again`. macOS CI hits this hardest (no npm cache hit); Windows can mask it if `actions/setup-node`'s npm cache preserved the binary from a prior run.
**Why:** electron's `postinstall` script (`node node_modules/electron/install.js`) is what downloads the platform Electron binary and writes `node_modules/electron/path.txt`. `npm ci --ignore-scripts` (used in CI to skip *other* unwanted postinstalls, e.g. a changelog generator) suppresses electron's postinstall too. Without `path.txt`, `electron/index.js` throws on require.
**Fix:** Run the install script explicitly after the ignore-scripts install, before anything that imports electron:
```yaml
- run: npm ci --ignore-scripts
- name: Download Electron binary (postinstall replacement)
  run: node node_modules/electron/install.js
```
`install.js` is idempotent (checks `isInstalled()` first) and handles macOS arm64/Rosetta detection. Mirror this for any other postinstall the `--ignore-scripts` flag suppresses (this repo also runs `node tools/build-changelog.js` and `electron-rebuild` as explicit replacement steps for the same reason).
**Source:** Wave 88 wave-end (commit `d77b3a00`). Pre-existing master-CI failure surfaced during the Wave 88 ship; diagnosed from the CI log (`Electron failed to install correctly` across 146 macOS test files).
