# macOS Release Guide — RestBro

End-to-end guide for producing a signed, notarized, universal macOS release of RestBro.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **macOS** | Building must happen on a Mac (code signing + notarytool are macOS-only) |
| **Xcode Command Line Tools** | `xcode-select --install` |
| **Node.js ≥ 18** | `node -v` |
| **npm** | Comes with Node.js |
| **Developer ID Application certificate** | Installed in your Keychain (see below) |
| **Apple Developer account** | Required for notarization |

### Verify your certificate

```bash
security find-identity -v -p codesigning
```

You should see a line like:

```
"Developer ID Application: Shivam Anand (244JV2VL85)"
```

If you don't see it, import your `.p12` certificate into Keychain Access, or download it from the [Apple Developer portal](https://developer.apple.com/account/resources/certificates/list).

---

## Environment Variables

### Apple ID method (recommended for solo developers)

```bash
export APPLE_ID="your@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="244JV2VL85"
```

**How to get an app-specific password:**

1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign in → Security → App-Specific Passwords → Generate
3. Name it something like "RestBro Notarization"
4. Copy the generated password

> **Tip:** Add the exports to a **private** shell profile file (e.g. `~/.restbro-release-env`) and `source` it before running the release. Never commit credentials.

### API key method (alternative)

```bash
export APPLE_API_KEY="/path/to/AuthKey_XXXXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

If both sets of variables are present, the API key method takes precedence.

### Optional: Override signing identity

```bash
export CSC_NAME="Developer ID Application: Your Name (TEAMID)"
```

Usually not needed — electron-builder auto-detects the certificate from Keychain.

---

## Running the Release

### One command

```bash
npm run release:mac
```

This runs `scripts/release-mac.sh` which does **everything** in order:

| Step | What happens |
|---|---|
| 0 | Validates environment (macOS, tools, credentials, certificate) |
| 1 | **Cleans** old `release/` and `dist/` directories |
| 2 | **Builds** the app (TypeScript + Webpack) |
| 3 | **Packages** a universal macOS app with electron-builder (signs the .app) |
| 4 | **Locates** artifacts and checks freshness (rejects stale files) |
| 5 | **Verifies** code signature with `codesign` and `spctl` |
| 6 | **Notarizes** the DMG (and ZIP) with Apple via `notarytool` |
| 7 | **Staples** the notarization ticket to the DMG and .app |
| 8 | **Final verification** — validates staple, signature, and Gatekeeper |

At the end, it prints the exact artifact path, SHA-256 hash, and file size.

---

## Output Artifacts

After a successful release, you'll find:

```
release/
├── Restbro-1.0.0-universal.dmg          ← Upload this to restbro.com
├── Restbro-1.0.0-universal-mac.zip      ← For auto-updater / alternate
├── mac-universal/
│   └── Restbro.app                       ← The signed universal app bundle
└── ...
```

### Which file to upload to restbro.com?

**Upload the `.dmg` file.** It is:

- ✅ Signed with Developer ID Application
- ✅ Hardened Runtime enabled
- ✅ Notarized by Apple
- ✅ Stapled (works offline without Apple server check)
- ✅ Universal (runs natively on both Intel and Apple Silicon)

The `.zip` is produced for auto-updater compatibility (Electron's `electron-updater`). You generally don't need to upload it to your website unless you use the auto-update feature.

---

## Development vs. Release Builds

| Command | Purpose | Signing | Notarization |
|---|---|---|---|
| `npm run dev` | Local development | None | No |
| `npm run dist` | Test packaging | Auto (if cert in Keychain) | No |
| `npm run dist:unsigned` | Test packaging without signing | None | No |
| `npm run release:mac` | **Full production release** | **Yes** | **Yes** |

Development workflows are unaffected. Signing and notarization only happen when you explicitly run `release:mac`.

---

## Troubleshooting

### "No 'Developer ID Application' certificate found"

```bash
security find-identity -v -p codesigning
```

Make sure your certificate is installed and not expired. If you see `CSSMERR_TP_CERT_REVOKED` or no Developer ID, re-download from the Apple Developer portal.

### Notarization fails with "Invalid credentials"

- Double-check `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD`
- Generate a **new** app-specific password if the old one was revoked
- Verify `APPLE_TEAM_ID` matches your certificate (e.g. `244JV2VL85`)

### Notarization fails with "The software is not signed"

- Run `codesign --verify --deep --strict --verbose=2 release/mac-universal/Restbro.app`
- Check that the certificate is "Developer ID Application" (not "Mac Developer" or "Apple Distribution")
- Ensure `hardenedRuntime: true` is set in `package.json` build config

### "STALE ARTIFACT DETECTED"

The script detected that the DMG file is older than expected. This safety guard prevents you from accidentally notarizing an old build. Fix: just re-run `npm run release:mac` — it cleans everything first.

### spctl says "rejected" after notarization

This can happen if Apple's servers haven't propagated the ticket yet. Wait a minute and try:

```bash
spctl -a -vv release/mac-universal/Restbro.app
```

The stapled ticket means it will pass Gatekeeper on end-user machines regardless.

### "The upload ... was not signed with a signing certificate"

You're likely signing with the wrong identity. Check:

```bash
codesign -dvv release/mac-universal/Restbro.app 2>&1 | grep Authority
```

It should show `Developer ID Application: Shivam Anand (244JV2VL85)`.

### Build succeeds but the app crashes on another Mac

Run on the target Mac:

```bash
codesign --verify --deep --strict --verbose=2 /Applications/Restbro.app
```

If you see entitlement issues, check that `build/entitlements.mac.plist` includes the required entries for Electron (JIT, unsigned memory, network).

### How to check notarization status manually

```bash
xcrun notarytool log <submission-id> \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --team-id "$APPLE_TEAM_ID"
```

---

## Entitlements

The app ships with two entitlement files in `build/`:

**`entitlements.mac.plist`** (main process):
- `com.apple.security.cs.allow-jit` — V8 JIT compiler
- `com.apple.security.cs.allow-unsigned-executable-memory` — Node.js native modules
- `com.apple.security.cs.disable-library-validation` — Third-party dylibs
- `com.apple.security.network.client` — Outbound HTTP/HTTPS
- `com.apple.security.files.user-selected.read-write` — Open/save dialogs

**`entitlements.mac.inherit.plist`** (helper processes / renderers):
- Same JIT + memory + library-validation entitlements (subset of parent)

> **Note:** `com.apple.security.cs.debugger` (`get-task-allow`) is intentionally **not** included. That entitlement is for development builds only and would cause notarization to fail.

---

## Security Notes

- Secrets are **never** hardcoded — all credentials come from environment variables
- The release script validates freshness to prevent uploading stale/old artifacts
- `afterSign` hook in electron-builder is disabled — notarization runs post-packaging with full visibility
- SHA-256 hashes are printed for every artifact for integrity verification
