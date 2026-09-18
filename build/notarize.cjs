// electron-builder `afterSign` hook — notarize + staple the macOS app.
//
// It runs ONLY when notarization credentials are present in the environment, so
// contributors without an Apple account can still `npm run dist:mac` and get a
// working (unsigned) build — this just no-ops. With a Developer ID cert in the
// keychain + the env vars below, the produced .app/.dmg is signed, notarized,
// and stapled, so end users get a single one-time macOS access prompt.
//
// Credentials (set whichever ONE you use):
//   Keychain profile:       APPLE_KEYCHAIN_PROFILE  (from `xcrun notarytool store-credentials`)
//   App-specific password:  APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
//   App Store Connect key:  APPLE_API_KEY (path to .p8), APPLE_API_KEY_ID, APPLE_API_ISSUER
//
// The profile is first because it is the only one that keeps the secret OUT of the
// build environment: notarytool stores it in the keychain once, and every build
// after that names it. An env var holding an app-specific password ends up in
// shell history, `ps`, and any CI log that echoes its environment.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return; // mac only

  // A UNIVERSAL BUILD PACKS THREE TIMES.
  //
  // electron-builder produces `mac-universal-x64-temp`, then
  // `mac-universal-arm64-temp`, then merges them into `mac-universal` — and
  // afterSign fires on all three. So the same app was submitted to Apple three
  // times over, each submission waiting its own timeout: a 68 minute Package
  // step doing one release's work three times, and the only submission that
  // matters is the last one, because the temp directories are thrown away.
  //
  // Only the merged app ships, so only the merged app is notarized.
  if (/-temp\/?$/.test(appOutDir)) {
    console.log(`[notarize] skipping ${appOutDir} — per-arch temp build, not the app we ship.`);
    return;
  }

  const {
    APPLE_KEYCHAIN_PROFILE,
    APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID,
    APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER
  } = process.env;

  const hasProfile = !!APPLE_KEYCHAIN_PROFILE;
  const hasPassword = !!(APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID);
  const hasApiKey = !!(APPLE_API_KEY && APPLE_API_KEY_ID && APPLE_API_ISSUER);
  if (!hasProfile && !hasPassword && !hasApiKey) {
    console.log('[notarize] no APPLE_* credentials in env — skipping notarization (build stays unsigned).');
    return;
  }

  let notarize;
  try {
    ({ notarize } = require('@electron/notarize'));
  } catch {
    console.warn('[notarize] @electron/notarize not installed — run `npm install`. Skipping.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  const creds = hasProfile
    ? { keychainProfile: APPLE_KEYCHAIN_PROFILE }
    : hasApiKey
      ? { appleApiKey: APPLE_API_KEY, appleApiKeyId: APPLE_API_KEY_ID, appleApiIssuer: APPLE_API_ISSUER }
      : { appleId: APPLE_ID, appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD, teamId: APPLE_TEAM_ID };

  // A CAP ON THE WAIT.
  //
  // `notarytool --wait` polls Apple until it gets an answer, and has no timeout
  // of its own. During an App Store Connect upload incident that meant one build
  // sat for two hours and then died on a dropped connection, and the next was
  // still waiting at fifty minutes — burning runner time to end up exactly where
  // giving up early would have: a signed, un-notarized build.
  //
  // So: lose the race and ship. The app is already signed at this point, which is
  // what gives macOS the stable identity it remembers folder permissions by; the
  // ticket can be added by re-running the job when Apple is healthy.
  const TIMEOUT_MS = Number(process.env.NOTARIZE_TIMEOUT_MS || 15 * 60_000);
  const timeout = (ms) => new Promise((_, reject) =>
    setTimeout(() => reject(new Error(
      `gave up after ${Math.round(ms / 60_000)} min — Apple did not answer. Check `
      + 'https://developer.apple.com/system-status/ and re-run the job.')), ms).unref());

  console.log(`[notarize] submitting ${appName}.app to Apple via notarytool `
    + `(giving up after ${Math.round(TIMEOUT_MS / 60_000)} min)…`);
  try {
    await Promise.race([
      notarize({ tool: 'notarytool', appPath, ...creds }),
      timeout(TIMEOUT_MS)
    ]);
    console.log('[notarize] stapling ticket to the app…');
    execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
    console.log('[notarize] done — app is signed, notarized, and stapled.');
  } catch (err) {
    // Best-effort: notarization talks to Apple's servers and can fail for reasons
    // outside the build (bad/expired app-specific password, unaccepted Developer
    // Program agreement, Apple-side outage, a rejected submission). That must NOT
    // sink the whole cross-platform release — the app is still Developer ID *signed*,
    // which is what gives the stable identity macOS uses to remember folder-access
    // grants (the one-time prompt). So we log loudly and ship the signed build;
    // once the credentials are valid, the next release notarizes with no code change.
    // Un-notarized = users may need a one-time right-click → Open on first launch.
    console.warn('[notarize] ⚠️  NOTARIZATION FAILED — shipping a signed-but-unnotarized build.');
    console.warn('[notarize] Check APPLE_KEYCHAIN_PROFILE (or the APPLE_ID / APPLE_API_KEY credentials) to enable it.');
    console.warn(`[notarize] notarytool said:\n${err && err.message ? err.message : err}`);
  }
};
