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
//
// ─── Why this calls notarytool directly ─────────────────────────────────────
// It used to go through @electron/notarize, which spawns `xcrun notarytool
// submit --wait` and waits on it. That call has no timeout of its own, and
// during an App Store Connect upload outage one build waited two hours before
// dying on a dropped connection.
//
// Racing that promise against a timer did NOT fix it, and that is the part worth
// remembering: losing a race does not kill a child process. The build printed
// "gave up after 15 min", went on to build its dmg — and then sat for another 45
// minutes, because notarytool was still polling Apple and node will not exit
// while a child of its own is alive.
//
// notarytool has `--timeout`, which actually ends the submission. So the three
// steps happen here — zip, submit, staple — and the limit is enforced by the
// tool doing the waiting.
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** How long Apple gets to answer before the build ships signed-but-unnotarized.
 *  Passed straight to notarytool, which enforces it. */
const TIMEOUT = process.env.NOTARIZE_TIMEOUT || '20m';

/** notarytool's credential flags, or null when nothing is configured. */
function credentialArgs(env) {
  if (env.APPLE_KEYCHAIN_PROFILE) {
    return ['--keychain-profile', env.APPLE_KEYCHAIN_PROFILE];
  }
  if (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER) {
    return ['--key', env.APPLE_API_KEY, '--key-id', env.APPLE_API_KEY_ID, '--issuer', env.APPLE_API_ISSUER];
  }
  if (env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID) {
    return ['--apple-id', env.APPLE_ID, '--password', env.APPLE_APP_SPECIFIC_PASSWORD, '--team-id', env.APPLE_TEAM_ID];
  }
  return null;
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return; // mac only

  // A universal build packs three times — mac-universal-x64-temp, then
  // mac-universal-arm64-temp, then the merge — and afterSign can fire on each.
  // Only the merged app ships; the temp directories are deleted after it.
  if (/-temp\/?$/.test(appOutDir)) {
    console.log(`[notarize] skipping ${appOutDir} — per-arch temp build, not the app we ship.`);
    return;
  }

  const creds = credentialArgs(process.env);
  if (!creds) {
    console.log('[notarize] no APPLE_* credentials in env — skipping notarization (build stays unsigned).');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  // notarytool takes an archive, not a bundle. `ditto` is what Apple documents:
  // it preserves the symlinks and extended attributes a .app depends on, which
  // a plain `zip` does not.
  const zipPath = path.join(os.tmpdir(), `${appName}-notarize-${Date.now()}.zip`);

  console.log(`[notarize] submitting ${appName}.app to Apple (notarytool --timeout ${TIMEOUT})…`);
  try {
    execFileSync('ditto', ['-c', '-k', '--keepParent', appPath, zipPath], { stdio: 'inherit' });

    // spawnSync, not execFileSync: a non-zero exit has to be READ, not thrown,
    // so a refusal or a timeout ends in the warning below with Apple's own words
    // rather than a stack trace that sinks the cross-platform release.
    const res = spawnSync('xcrun', [
      'notarytool', 'submit', zipPath, ...creds, '--wait', '--timeout', TIMEOUT
    ], { encoding: 'utf8', maxBuffer: 1 << 24 });

    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim();
    // `--wait` exits 0 for a submission that was REJECTED as well as one that was
    // accepted, so the status line is the thing to check, not the exit code.
    if (res.status !== 0 || !/status:\s*Accepted/i.test(out)) {
      throw new Error(out || `notarytool exited ${res.status}`);
    }
    console.log('[notarize] accepted — stapling the ticket to the app…');
    execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
    console.log('[notarize] done — app is signed, notarized, and stapled.');
  } catch (err) {
    // Best-effort: notarization talks to Apple's servers and can fail for reasons
    // outside the build — an outage, a rejected submission, an expired password.
    // That must NOT sink the release: the app is still Developer ID *signed*,
    // which is what gives macOS the stable identity it remembers folder-access
    // grants by. Un-notarized costs users a one-time "Open Anyway" in System
    // Settings, and re-running the job adds the ticket with no code change.
    console.warn('[notarize] ⚠️  NOTARIZATION FAILED — shipping a signed-but-unnotarized build.');
    console.warn(`[notarize] ${err && err.message ? err.message : err}`);
    console.warn('[notarize] Check https://developer.apple.com/system-status/ and re-run the job.');
  } finally {
    try { fs.rmSync(zipPath, { force: true }); } catch { /* temp file */ }
  }
};
