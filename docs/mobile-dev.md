# Mobile Development — Capacitor

## Initial Android setup (run once, user's machine)

Prerequisites:

- Android Studio installed
- Android SDK + at least one API level (target 34 recommended)
- JDK 17+

Commands:

```sh
npm run build:web
npx cap add android
npm run cap:sync
```

This creates the `android/` folder (gitignored except for a `.gitkeep`).

## Daily development workflow

```sh
# Rebuild web assets and sync to native project
npm run cap:build:android

# Open Android Studio to run on emulator or device
npm run cap:android
```

## Dev-server mode (Phase B)

Phase B will add a `CAPACITOR_SERVER_URL` env var that, when set, points the
Capacitor WebView at a running `npm run build:web` dev server instead of the
bundled `out/web/` directory. This avoids a full `build:web` round-trip during
active development.

## Project identifiers

| Field   | Value                   |
| ------- | ----------------------- |
| App ID  | `com.stacey.ouroboros`  |
| App Name | Ouroboros              |
| Web dir | `out/web`               |
| Android scheme | `https`        |

## Notes

- `android/` is gitignored. Only `android/.gitkeep` is committed.
  Run `npx cap add android` on your local machine to scaffold the platform folder.
- iOS builds are deferred until Mac access is available (Wave 33c).
  Do not attempt `npx cap add ios` on Windows.
- Keystore files (`*.keystore`, `*.jks`) are gitignored. Back up your release
  keystore to a password manager — losing it permanently prevents Play Store updates.
  See `docs/mobile-release.md` (created in Phase H) for the full signing workflow.
