# Code Signing Setup Guide

How to configure code signing for Ouroboros distribution on macOS and Windows.

## macOS — Apple Developer ID + Notarization

### Prerequisites

1. **Apple Developer Program** enrollment ($99/year) — [developer.apple.com](https://developer.apple.com/programs/)
2. A **Developer ID Application** certificate (not "Mac App Distribution" — that's for the Mac App Store)

### Certificate Setup

1. In Xcode or Apple Developer portal, create a "Developer ID Application" certificate
2. Export the certificate as a `.p12` file with a password
3. Base64-encode the `.p12`: `base64 -i certificate.p12 -o certificate-base64.txt`

### electron-builder Configuration

Add to `package.json` under `build.mac`:

```json
{
  "build": {
    "mac": {
      "identity": "Developer ID Application: Your Name (TEAM_ID)",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build-resources/entitlements.mac.plist",
      "entitlementsInherit": "build-resources/entitlements.mac.plist"
    },
    "afterSign": "scripts/notarize.js"
  }
}
```

### Entitlements File

Create `build-resources/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key><true/>
</dict>
</plist>
```

### Notarization Script

Create `scripts/notarize.js`:

```js
const { notarize } = require('@electron/notarize');
exports.default = async function notarizing(context) {
  if (process.platform !== 'darwin') return;
  await notarize({
    appBundleId: 'com.ouroboros.ide',
    appPath: `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
```

### CI Secrets (GitHub Actions)

| Secret                        | Value                                         |
| ----------------------------- | --------------------------------------------- |
| `APPLE_ID`                    | Your Apple Developer email                    |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com  |
| `APPLE_TEAM_ID`               | 10-character Team ID from developer.apple.com |
| `CSC_LINK`                    | Base64-encoded `.p12` certificate             |
| `CSC_KEY_PASSWORD`            | Password for the `.p12` file                  |

---

## Windows — EV Code Signing Certificate

### Prerequisites

1. **EV Code Signing Certificate** from a trusted CA (DigiCert, Sectigo, GlobalSign)
2. The certificate is typically stored on a hardware USB token (YubiKey, SafeNet)

### electron-builder Configuration

Add to `package.json` under `build.win`:

```json
{
  "build": {
    "win": {
      "signingHashAlgorithms": ["sha256"],
      "sign": null
    }
  }
}
```

For cloud-based signing (e.g., DigiCert KeyLocker):

```json
{
  "build": {
    "win": {
      "signingHashAlgorithms": ["sha256"],
      "sign": "scripts/sign-windows.js"
    }
  }
}
```

### CI Secrets (GitHub Actions)

| Secret                 | Value                                             |
| ---------------------- | ------------------------------------------------- |
| `WIN_CSC_LINK`         | Base64-encoded `.pfx` certificate (if file-based) |
| `WIN_CSC_KEY_PASSWORD` | Certificate password                              |

For hardware token signing, use a cloud signing service (DigiCert KeyLocker, Azure Trusted Signing) with additional secrets as per the provider's docs.

---

## CI Integration (GitHub Actions)

### Conditional Signing on Tagged Releases

```yaml
- name: Build and Sign
  env:
    CSC_LINK: ${{ secrets.CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
    WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
  run: npm run dist
  if: startsWith(github.ref, 'refs/tags/v')
```

### Skip Signing in Non-Release Builds

electron-builder automatically skips signing when `CSC_LINK` is not set. No code changes needed — just don't configure the secrets for non-release workflows.

---

## Checklist

- [ ] Enroll in Apple Developer Program
- [ ] Create Developer ID Application certificate
- [ ] Export and base64-encode `.p12`
- [ ] Create entitlements.mac.plist
- [ ] Create notarize.js script
- [ ] Purchase EV code signing certificate (Windows)
- [ ] Configure CI secrets in GitHub repository settings
- [ ] Test signed build locally before pushing to CI
- [ ] Verify notarization: `spctl --assess -v /path/to/Ouroboros.app`
- [ ] Verify Windows signature: right-click .exe → Properties → Digital Signatures
