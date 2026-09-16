# macOS code signing & notarization (maintainer runbook)

Signing binds the app's TCC grants (Documents/Desktop/Downloads access) to a
**stable code signature**, so users are prompted for folder access **once**
instead of on every agent action. Notarization clears Gatekeeper so the app
opens without the "unidentified developer" warning.

The build is wired so this is **entirely optional**: with no credentials present,
`npm run dist:mac` and the release CI both produce a working *unsigned* build
(`build/notarize.cjs` no-ops, electron-builder falls back to no identity). You
only need the steps below to ship a *signed* release.

## One-time Apple setup

1. Enrol in the Apple Developer Program ($99/yr) and note your **Team ID**
   (Apple Developer → Membership).
2. Create a **Developer ID Application** certificate (Apple Developer →
   Certificates → +), download it, and double-click to import into your login
   keychain.
3. Create an **app-specific password** for notarization at
   <https://appleid.apple.com> → Sign-In and Security → App-Specific Passwords.

## Local signed build

```sh
# Export the cert from Keychain Access → My Certificates → "Developer ID
# Application: …" → right-click → Export → .p12 (set an export password).
export CSC_LINK="$(base64 -i DeveloperIDApplication.p12)"   # or a file path
export CSC_KEY_PASSWORD="<the .p12 export password>"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
npm run dist:mac
```

Keep these out of git — `.env.signing`, `*.p12`, and `*.p8` are gitignored.
Source them from a local `.env.signing` if you like.

## Publishing a signed release

There is no CI in this repo. Build on a machine where `electron-builder` can run,
with the credentials above in the environment:

```sh
export CSC_LINK=/absolute/path/DeveloperIDApplication.p12
export CSC_KEY_PASSWORD=...
export APPLE_ID=... APPLE_APP_SPECIFIC_PASSWORD=... APPLE_TEAM_ID=...
npm run dist:mac
```

`build/notarize.cjs` runs after signing and no-ops when the `APPLE_*` variables are
absent, so a build without credentials still succeeds — unsigned.

Then create the GitHub release and upload the installers **plus `latest*.yml` and the
`.blockmap` files**. Those channel files are what electron-updater polls; without
them an existing install never sees the update.

## Verify a build is properly signed

```sh
codesign --verify --deep --strict --verbose=2 "dist/mac-universal/Atlas.app"
spctl --assess --type execute --verbose "dist/mac-universal/Atlas.app"   # → "accepted, source=Notarized Developer ID"
xcrun stapler validate "dist/mac-universal/Atlas.app"
```

See `electron-builder.yml` (the `mac:` block) and `build/notarize.cjs` for how
these credentials are consumed.
