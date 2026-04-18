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

## Dev workflow — live web server

For a fast edit-debug cycle on the Android emulator or a physical phone:

1. Start the web server: `npm run dev:web` (or whichever script serves `out/web/` over HTTP on a port reachable from the phone — typically 4173 for `vite preview`).
2. Note your desktop's LAN IP (e.g. `192.168.1.50`).
3. Sync Capacitor pointing at the live server:
   ```
   CAPACITOR_SERVER_URL=http://192.168.1.50:4173 npm run cap:sync
   ```
4. Open the Android project: `npm run cap:android` (or `npx cap run android --target <device-id>`).

Changes to the web renderer are picked up on app refresh (no rebuild of the Android shell needed). Only native-plugin changes require `cap sync` + reinstall.

## Release workflow

For release APK/AAB builds, **do not** set `CAPACITOR_SERVER_URL`. Capacitor bundles `out/web/` into the APK:

```
npm run build:web
npm run cap:sync
# Then sign + build in Android Studio or via Gradle (see docs/mobile-release.md — Phase H)
```

## Key Reminders

- `CAPACITOR_SERVER_URL=http://...` requires `cleartext: true` (Android blocks non-HTTPS by default). Set automatically by `capacitor.config.ts` when the URL starts with `http://`.
- Phone must be on the same LAN (or tailscale / equivalent) to reach the dev server.
- Desktop firewall may need to allow inbound on the dev port from LAN.
- Never ship a release build with `CAPACITOR_SERVER_URL` set — defense-in-depth: `capacitor.config.ts` reads from env at build time, so a clean build environment (no leaked env var) produces a bundled build.

## Project identifiers

| Field   | Value                   |
| ------- | ----------------------- |
| App ID  | `com.stacey.ouroboros`  |
| App Name | Ouroboros              |
| Web dir | `out/web`               |
| Android scheme | `https`        |

## Deep-link setup — Android manifest (one-time)

After `npx cap add android`, edit `android/app/src/main/AndroidManifest.xml`. Inside the
`<activity android:name=".MainActivity">` block, add:

```xml
<intent-filter android:autoVerify="false">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="ouroboros" android:host="pair" />
</intent-filter>
```

This enables `ouroboros://pair?host=...&port=...&code=...&fingerprint=...` deep links.
Scanning the QR code shown in Desktop → Settings → Mobile Access with any third-party
QR scanner will launch Ouroboros with the pairing fields pre-filled.

The full XML snippet is also available in `capacitor-resources/android-intent-filter.xml`
for easy copy-paste.

**Verify after adding:**

```sh
adb shell am start -a android.intent.action.VIEW \
  -d "ouroboros://pair?host=192.168.1.50&port=4173&code=123456&fingerprint=abc"
```

The app should open and the pairing screen should have the fields pre-filled (but NOT
auto-submitted — always requires the user to tap Pair).

## Notes

- `android/` is gitignored. Only `android/.gitkeep` is committed.
  Run `npx cap add android` on your local machine to scaffold the platform folder.
- iOS builds are deferred until Mac access is available (Wave 33c).
  Do not attempt `npx cap add ios` on Windows.
- Keystore files (`*.keystore`, `*.jks`) are gitignored. Back up your release
  keystore to a password manager — losing it permanently prevents Play Store updates.
  See `docs/mobile-release.md` (created in Phase H) for the full signing workflow.
