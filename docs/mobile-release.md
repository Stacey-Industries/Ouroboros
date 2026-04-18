# Android Release Build — Signing, CI, and Distribution

Cross-reference: see `docs/mobile-dev.md` for daily development workflow and emulator setup.

---

## Prerequisites

- **Android Studio** — [https://developer.android.com/studio](https://developer.android.com/studio)
- **JDK 17** — bundled with Android Studio, or install separately (e.g. Eclipse Temurin)
- **Android SDK** — installed via Android Studio SDK Manager (API 34 recommended target)
- **Capacitor platform scaffolded** — run `npx cap add android` once before any build

---

## Generate a release keystore (one time — MUST back up)

Run this command once. Store the output file somewhere safe before doing anything else:

```sh
keytool -genkey -v \
  -keystore ouroboros-release.jks \
  -alias ouroboros \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

You will be prompted for a keystore password, your name/org, and a key password.
Use strong, unique passwords and record them immediately.

> **CRITICAL — keystore loss is permanent.**
> Google Play enforces signing continuity: every update to a published app must be
> signed with the same key. If you lose the keystore or forget its password, you
> **cannot publish updates** to an existing Play Store listing. You would have to
> create a new listing and lose all existing installs and reviews.

---

## Backup procedure

Back up the keystore file and both passwords using **at least two of** the following:

1. **Password manager** (Bitwarden, 1Password, etc.) — store the `.jks` file as an
   attachment and record both passwords as secure notes.
2. **Offline cold storage** — copy the `.jks` to an encrypted USB drive or encrypted
   archive (e.g. `gpg --symmetric ouroboros-release.jks`) stored physically separate
   from your primary machine.
3. **Google Play App Signing** — enroll via Play Console → Setup → App signing.
   Google then holds an upload key and re-signs with their key. This allows key
   rotation in emergencies but requires enrolment before first submission.

The `.jks` file and passwords are **not** committed to the repository (see `.gitignore`).
Never add them to version control.

---

## Building a release APK locally

### 1. Set required environment variables

```sh
# Linux / macOS
export ANDROID_KEYSTORE_PATH=/path/to/ouroboros-release.jks
export ANDROID_KEY_ALIAS=ouroboros
export ANDROID_KEYSTORE_PASSWORD=<keystore-password>
export ANDROID_KEY_PASSWORD=<key-password>

# Windows (PowerShell)
$env:ANDROID_KEYSTORE_PATH = "C:\path\to\ouroboros-release.jks"
$env:ANDROID_KEY_ALIAS     = "ouroboros"
$env:ANDROID_KEYSTORE_PASSWORD = "<keystore-password>"
$env:ANDROID_KEY_PASSWORD      = "<key-password>"
```

### 2. Add the signing config to android/app/build.gradle

After running `npx cap add android`, paste the `android { signingConfigs { ... } }` block
from `capacitor-resources/android-app-build.gradle.signing-snippet.txt` into
`android/app/build.gradle` inside the existing `android { ... }` closure.

The snippet reads credentials from environment variables at build time — no passwords
are embedded in source.

### 3. Run the release builder

```sh
npm run cap:build:android:release
```

This script (`tools/build-android-release.js`):

1. Validates all four env vars are set — exits with a clear error if any are missing.
2. Runs `npm run build:web` (produces `out/web/`).
3. Runs `npx cap sync android` (copies web assets into the Android project).
4. Invokes `gradlew assembleRelease bundleRelease` in `android/` with signing args.
   On Windows it uses `gradlew.bat`; on Linux/macOS it uses `./gradlew`.

Output artifacts:
- APK: `android/app/build/outputs/apk/release/`
- AAB: `android/app/build/outputs/bundle/release/`

> The script never prints secret values to stdout or stderr.

---

## CI release — GitHub Actions

The workflow `.github/workflows/mobile-android-release.yml` runs automatically on any tag
matching `v*.*.*`, and can also be triggered manually via `workflow_dispatch`.

### Pipeline stages

| Job | Runner | What it does |
|-----|--------|--------------|
| `build-web` | ubuntu-latest | `npm ci` + `npm run build:web` → uploads `out/web/` artifact |
| `build-android` | ubuntu-latest | Downloads web artifact, scaffolds Android, syncs Capacitor, signs + builds APK + AAB |

### Configure GitHub Secrets

In your repository: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret name | Value |
|-------------|-------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded keystore (see below) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias (e.g. `ouroboros`) |
| `ANDROID_KEY_PASSWORD` | Key password |

### Encode the keystore for the secret

```sh
# Linux / macOS
base64 -w 0 ouroboros-release.jks

# macOS (BSD base64 — no -w flag needed)
base64 ouroboros-release.jks

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("ouroboros-release.jks"))
```

Copy the output (a single long line) and paste it as the value of
`ANDROID_KEYSTORE_BASE64`. The workflow decodes it into a temp file at build time.

### Trigger a release

```sh
git tag v2.2.0
git push origin v2.2.0
```

The workflow starts, builds web assets, then builds and signs the Android APK + AAB.
Artifacts are retained for 30 days under **Actions → the triggered run → Artifacts**.

### Fork / unsigned fallback

If the signing secrets are absent (e.g. an unauthorized fork or a contributor's PR),
the workflow falls back to an unsigned debug build. Artifacts are labeled
`android-debug-only` and retained for 7 days. The workflow summary includes a warning.

---

## Debug-only build (no keystore required)

For development and testing on a local device or emulator — no signing needed:

```sh
npm run cap:build:android:debug
```

This runs `build:web` + `cap sync android`. Open Android Studio and run on your target
device from there (it builds and signs with the debug keystore automatically).

---

## Store submission

Store submission (Google Play Console — screenshots, listing copy, privacy policy,
content rating questionnaire) is out of scope for this wave and is a manual process.

Key checklist before submitting:
- Every item in the Phase G "native-feel" acceptance gate in `roadmap/wave-33b-plan.md`
  is checked off.
- 2-week author daily-use period completed.
- QR pairing tested on at least 3 physical Android devices.
- Release keystore is backed up in at least two locations.
- Privacy policy URL is live and accessible.
