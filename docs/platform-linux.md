# Linux Platform Guide — Install, Run & Troubleshoot

Ouroboros runs on Linux (Electron + AppImage). This document covers manual setup,
a smoke-test checklist, and known Linux-specific quirks.

---

## Prerequisites

### Ubuntu 22.04+ / Debian-based

```sh
sudo apt-get update
sudo apt-get install -y \
  build-essential python3 \
  libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 \
  libasound2t64   # Ubuntu 24.04+; use libasound2 on 22.04
```

Node 20+ is required. Install via [NodeSource](https://github.com/nodesource/distributions) or `nvm`:

```sh
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Fedora 39+ / RPM-based

```sh
sudo dnf install nodejs-npm make gcc-c++ python3 \
  nss atk libdrm libxkbcommon mesa-libgbm alsa-lib
```

For Node 20:

```sh
sudo dnf module install nodejs:20
```

### Shared: verify Node version

```sh
node --version   # must be >= 20.0.0
npm --version    # must be >= 9.0.0
```

---

## Install

```sh
git clone https://github.com/hesnotsoharry/Ouroboros.git
cd Ouroboros
npm ci
```

`npm ci` triggers the `postinstall` hook which runs `electron-rebuild` to compile
`node-pty` and `better-sqlite3` against Electron's Node ABI. If this fails, run:

```sh
npm rebuild
```

---

## Build

```sh
npm run build        # Electron (main + preload + renderer)
npm run build:web    # Web/remote-access build (optional smoke test)
```

---

## Run in development

```sh
npm run dev
```

This starts electron-vite dev server and opens the Electron window. HMR is active
for the renderer — reload with `Ctrl+R` inside the IDE without restarting.

---

## Run tests

```sh
# Install a system-Node build of better-sqlite3 (vitest uses system Node, not Electron's ABI)
mkdir -p /tmp/Temp/sqlite-fresh
cd /tmp/Temp/sqlite-fresh && npm init -y && npm install better-sqlite3
cd -

npm test
```

---

## Smoke checklist (manual)

Run through these after a fresh build on any new Linux machine or distro:

- [ ] App launches — Electron window opens without crash
- [ ] Chat panel renders — text input is visible and accepts typing
- [ ] New terminal — `+` button opens a PTY session; commands execute
- [ ] File tree — opening a project folder populates the tree
- [ ] File viewer — clicking a file opens it with syntax highlighting
- [ ] Settings — gear icon or `Ctrl+,` opens the Settings panel
- [ ] Web build — `npm run build:web` completes without error and `out/web/index.html` exists
- [ ] No console errors on startup (check DevTools: `Ctrl+Shift+I`)

---

## Known Linux-specific issues

### Wayland compositor

Electron on Wayland may render a blank window or fail to position pop-overs correctly.
Force XWayland compatibility:

```sh
ELECTRON_OZONE_PLATFORM_HINT=auto npm run dev
# or when launching the AppImage:
./Ouroboros.AppImage --ozone-platform-hint=auto
```

Alternatively, set `WAYLAND_DISPLAY=` to force X11 mode if XWayland is available.

### HiDPI / fractional scaling

Electron may render at the wrong scale on HiDPI displays under X11:

```sh
./Ouroboros.AppImage --force-device-scale-factor=2
```

Adjust the value to match your display's actual scale factor (e.g. `1.5`, `2`, `2.5`).

### Clipboard (X11)

Under X11, Electron uses the `CLIPBOARD` selection by default. Copy/paste may not
work across apps if no clipboard manager is running. Install one:

```sh
sudo apt-get install -y xclip   # or xdotool, parcellite, copyq
```

Start the clipboard manager before launching Ouroboros. Under Wayland this is not
typically needed — the compositor handles clipboard persistence.

### AppImage sandbox (SUID sandbox error)

Some distributions disable the Chrome sandbox. If the app refuses to launch with:

```
The SUID sandbox helper binary was found, but is not configured correctly.
```

Run with `--no-sandbox` as a temporary workaround and file an issue with your distro:

```sh
./Ouroboros.AppImage --no-sandbox
```

### Fedora SELinux

SELinux may block Electron's GPU process. If the app launches but shows a blank
renderer, run:

```sh
ausearch -c 'chrome' --raw | audit2allow -M ouroboros
semodule -X 300 -i ouroboros.pp
```

Or temporarily disable SELinux enforcement for testing:

```sh
sudo setenforce 0
```

### node-pty compile failure

If `npm ci` fails on the `electron-rebuild` step with a node-pty compile error:

```sh
sudo apt-get install -y build-essential python3   # Debian/Ubuntu
sudo dnf install make gcc-c++ python3             # Fedora
npm rebuild
```

---

## CI

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs typecheck, lint,
vitest, and `npm run build` on `ubuntu-latest`, `windows-latest`, and `macos-latest`.
Ubuntu additionally runs a `build:web` smoke test after the main build.

The CI installs native build prerequisites explicitly and runs `npm rebuild` after
`npm ci` to ensure node-pty and better-sqlite3 compile correctly in the GitHub
Actions runner environment.
