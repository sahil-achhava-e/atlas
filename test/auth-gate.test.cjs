'use strict';

/**
 * Signing back in to Claude Code from inside Atlas.
 *
 * When the CLI's credentials expire an agent still SPAWNS: the binary is there,
 * the PTY opens, and the TUI sits on "Not logged in · Please run /login"
 * forever. On 2026-09-23 fifteen agents sat like that behind a token that had
 * expired the day before, and the only way out was a terminal outside the app
 * and a restart by hand.
 *
 * The safety rule this whole feature hangs on: `out` is the ONLY state that
 * gates a spawn. A probe that failed is not evidence of being signed out.
 *
 * Run: node --test test/auth-gate.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { parseAuthStatus, buildLoginScript, AUTH_CACHE_MS } = loadTs('src/main/authGate.ts');

// The real thing, captured from `claude auth status --json` on 2026-09-23.
const SIGNED_IN = JSON.stringify({
  loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty',
  analyticsDisabled: false, configDirectory: '/Users/x/.claude', subscriptionType: 'team'
});

test('the shape the CLI actually prints reads as signed in', () => {
  assert.equal(parseAuthStatus(SIGNED_IN, 0), 'in');
});

test('an explicit false is the only thing that means signed out', () => {
  assert.equal(parseAuthStatus('{"loggedIn":false}', 0), 'out');
  assert.equal(parseAuthStatus('{"loggedIn": false, "authMethod": null}', 0), 'out');
});

test('anything unreadable is unknown, never out', () => {
  // This is the safety rule. A CLI release that renames the field, a stack
  // trace on stdout, an empty pipe — none of them mean the user is signed out,
  // and treating them that way would strand every agent behind a sign-in
  // screen they cannot dismiss.
  for (const [out, code] of [
    ['', 0], ['   ', 0], ['not json', 0], ['<html>error</html>', 0],
    ['{"loggedIn":"yes"}', 0], ['{"loggedIn":null}', 0], ['{}', 0],
    ['[]', 0], ['null', 0], ['"a string"', 0], ['42', 0]
  ]) {
    assert.equal(parseAuthStatus(out, code), 'unknown', `${JSON.stringify(out)} must be unknown`);
  }
});

test('a non-zero exit is unknown even when stdout looks like an answer', () => {
  // The exit status is the more trustworthy of the two signals: a CLI that
  // failed to run can still have printed something JSON-shaped.
  assert.equal(parseAuthStatus(SIGNED_IN, 1), 'unknown');
  assert.equal(parseAuthStatus('{"loggedIn":false}', 1), 'unknown');
  // null = killed by a signal, or the 3s timeout fired.
  assert.equal(parseAuthStatus(SIGNED_IN, null), 'unknown');
});

test('the probe cache is short enough to notice an expiry, long enough for a team', () => {
  // Spawning fifteen agents must cost one subprocess, not fifteen; the poll is
  // 60s, so a cache longer than that would hide a change from it entirely.
  assert.ok(AUTH_CACHE_MS >= 10_000, 'too short to cover a fleet spawn');
  assert.ok(AUTH_CACHE_MS <= 60_000, 'longer than the poll interval hides changes');
});

// ── the script that runs in the terminal ────────────────────────────────────

test('the unix script asks the CLI whether the sign-in took, and fails if not', () => {
  const sh = buildLoginScript('claude', 'darwin');
  assert.match(sh, /claude auth login/);
  // The exit code is the contract: index.ts respawns the parked agents only on
  // a clean exit, so a cancelled browser flow must NOT report success.
  assert.match(sh, /claude auth status --json \| grep -q/);
  assert.match(sh, /exit 0/);
  assert.match(sh, /exit 1/);
  assert.ok(sh.indexOf('exit 0') < sh.indexOf('exit 1'), 'success is the guarded branch');
});

test('the unix script cannot be tripped by a shell metacharacter', () => {
  const sh = buildLoginScript('claude', 'darwin');
  // Single-quoted echo text, and no `!` anywhere — history expansion fires in
  // some interactive shells and would break the whole script.
  assert.doesNotMatch(sh, /!/);
  assert.doesNotMatch(sh, /\$\(/);
});

test('a hostile binary name is sanitized before it reaches the shell', () => {
  const sh = buildLoginScript('claude; rm -rf ~', 'darwin');
  assert.doesNotMatch(sh, /rm -rf/);
});

test('the windows branch is one cmd.exe line with no double quotes', () => {
  // It is wrapped verbatim in `/d /s /c "..."`, so a double quote inside it
  // ends the command early.
  const cmd = buildLoginScript('claude', 'win32');
  assert.doesNotMatch(cmd, /"/);
  assert.doesNotMatch(cmd, /\n/);
  assert.match(cmd, /claude auth login/);
});

// ── the wiring ──────────────────────────────────────────────────────────────

const src = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const main = src('src/main/index.ts');

test('the sign-in gate runs AFTER the missing-CLI ladder', () => {
  // A binary that is not installed cannot be asked whether it is signed in.
  const missing = main.indexOf('buildMissingCliScript(bin, provider');
  const auth = main.indexOf("checkAuth(ptyManager.commandPath(bin)) === 'out'");
  assert.ok(missing > 0 && auth > 0, 'both gates are present');
  assert.ok(missing < auth, 'missing-CLI must come first');
});

test('only `out` gates a spawn', () => {
  assert.match(main, /checkAuth\(ptyManager\.commandPath\(bin\)\) === 'out'/);
  assert.doesNotMatch(main, /checkAuth\([^)]*\) !== 'in'/, 'that would gate on a failed probe');
});

test('the gate is Claude-only and skipped on the relaunch', () => {
  // Codex/Gemini/Grok have their own auth and Atlas knows nothing about it.
  // `noAutoInstall` is what stops the respawn re-entering the gate forever.
  assert.match(main, /if \(claudeProvider && !opts\.noAutoInstall && checkAuth/);
});

test('fifteen blocked agents produce ONE sign-in', () => {
  assert.match(main, /if \(authLoginPtyId\) \{/, 'a second blocked spawn parks instead of spawning');
  assert.match(main, /pendingAuthRelaunch\.set\(opts\.id, \{ opts, owner \}\)/);
});

test('a successful sign-in respawns everything that was parked', () => {
  assert.match(main, /if \(authLoginPtyId === id\) \{/);
  assert.match(main, /spawnAgentCore\(\{ \.\.\.p\.opts, noAutoInstall: true \}, p\.owner\)/);
  // Both cleared together: a stale id would park the next logged-out spawn
  // forever behind a terminal that no longer exists.
  assert.match(main, /authLoginPtyId = null;[\s\S]{0,200}pendingAuthRelaunch\.clear\(\)/);
});

test('an unknown probe is reported to the renderer as signed IN', () => {
  // A failed probe must not throw a modal over someone's work.
  assert.match(main, /loggedIn: state !== 'out'/);
});

test('the poll is armed and torn down with the other timers', () => {
  assert.match(main, /authTimer = setInterval/);
  assert.match(main, /if \(authTimer\) clearInterval\(authTimer\)/);
});

test('the renderer never sends a shell string across the bridge', () => {
  const preload = src('src/preload/index.ts');
  assert.match(preload, /authLogin: \(\): Promise/, 'takes no arguments');
  assert.match(main, /shellScript: buildLoginScript\('claude', process\.platform\)/);
});

test('browser mode gets the three methods too', () => {
  // Regenerated from preload by build:server — a hand-maintained second copy is
  // how browser mode shipped twice with the renderer calling a name the bridge
  // did not know.
  const map = src('src/server/bridgeMap.generated.ts');
  assert.match(map, /authCurrent: 'auth:current'/);
  assert.match(map, /authLogin: 'auth:login'/);
  assert.match(map, /onAuthStatus: 'auth:status'/);
});

test('the dialog renders nothing while signed in', () => {
  const dlg = src('src/renderer/src/components/AuthLoginDialog.tsx');
  assert.match(dlg, /if \(loggedIn\) return null;/);
  // Assume signed in until told otherwise: a dialog that flashes on every boot
  // before the first probe lands is worse than one that arrives a second late.
  assert.match(dlg, /useState\(true\)/);
});

test('every locale can render the dialog', () => {
  const dir = path.join(__dirname, '..', 'src/renderer/src/i18n/locales');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(j.authLogin, `${f} is missing authLogin`);
    for (const k of ['title', 'body', 'running', 'signIn', 'starting', 'failed']) {
      assert.ok(j.authLogin[k], `${f} is missing authLogin.${k}`);
    }
  }
});
