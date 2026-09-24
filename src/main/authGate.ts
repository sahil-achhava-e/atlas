/**
 * The Claude Code sign-in gate.
 *
 * When the CLI's credentials expire, an agent still SPAWNS — the binary is
 * there, the PTY opens, and then the TUI sits on "Not logged in · Please run
 * /login" forever. Nothing in Atlas noticed, so the only way out was a terminal
 * outside the app and a full restart by hand (2026-09-23: fifteen agents stuck
 * behind a token that had expired the day before).
 *
 * Split out of index.ts for the same reason cliInstall.ts was: the decision
 * ("is this machine signed in?") and the script it emits are both testable
 * without booting an app.
 */
import { spawnSync } from 'node:child_process';
import { buildPtyEnv } from './ptyEnv';
import { userShellPath } from './shellEnv';

/**
 * `out` is the ONLY value that ever blocks a spawn.
 *
 * `unknown` means the probe itself failed — the binary moved, the 3s budget
 * expired, the JSON changed shape. That is not evidence of being logged out,
 * and treating it as such would strand every agent behind a sign-in screen the
 * moment a CLI release renames a field. A failed probe lets the agent start.
 */
export type AuthState = 'in' | 'out' | 'unknown';

/** ms a probe result is trusted. Long enough that spawning a whole team costs
 *  one subprocess instead of fifteen, short enough that the 60s poll still sees
 *  an expiry promptly. */
export const AUTH_CACHE_MS = 30_000;

/** ms before a probe is abandoned as `unknown`. */
const PROBE_TIMEOUT_MS = 3000;

/**
 * Read `claude auth status --json`.
 *
 * Logged in, it prints an object whose first field is the one we want:
 *   {"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty",…}
 *
 * Only an explicit boolean counts. `loggedIn:true` is `in`, an explicit false
 * is `out`, and anything we cannot read as that object — empty output, a stack
 * trace, a future format — is `unknown`, never `out`.
 *
 * `exitCode` is checked FIRST and separately: a CLI that failed to run at all
 * can still have printed something JSON-shaped on stdout, and its exit status
 * is the more trustworthy of the two signals. A null code (killed by signal,
 * or timed out) is a failed probe.
 */
export function parseAuthStatus(stdout: string, exitCode: number | null): AuthState {
  if (exitCode !== 0) return 'unknown';
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    return 'unknown';
  }
  if (typeof parsed !== 'object' || parsed === null) return 'unknown';
  const flag = (parsed as { loggedIn?: unknown }).loggedIn;
  if (flag === true) return 'in';
  if (flag === false) return 'out';
  return 'unknown';
}

let cached: { state: AuthState; at: number } | null = null;

/** Throw away the cached probe so the next `checkAuth()` re-runs the CLI.
 *  Called when a sign-in starts and when one finishes — the two moments the
 *  answer is guaranteed to be stale. */
export function clearAuthCache(): void {
  cached = null;
}

/**
 * Probe, with a short cache.
 *
 * `binaryPath` comes from the caller (PtyManager.commandPath('claude')) rather
 * than being resolved here, so the probe and the agents agree on which binary
 * they mean. Null — no claude on this machine — is `unknown`, not `out`: a
 * missing CLI is the install path's problem, and it runs before this one.
 *
 * The env is `buildPtyEnv`'s, the same layering an agent PTY gets, so the probe
 * cannot disagree with the sessions it is gating: same PATH, same
 * CLAUDE_CONFIG_DIR, same parent-session markers stripped.
 */
export function checkAuth(binaryPath: string | null, now: number = Date.now()): AuthState {
  if (cached && now - cached.at < AUTH_CACHE_MS) return cached.state;
  const state = probeAuth(binaryPath);
  cached = { state, at: now };
  return state;
}

function probeAuth(binaryPath: string | null): AuthState {
  if (!binaryPath) return 'unknown';
  try {
    const res = spawnSync(binaryPath, ['auth', 'status', '--json'], {
      encoding: 'utf8',
      timeout: PROBE_TIMEOUT_MS,
      env: buildPtyEnv(process.env, userShellPath())
    });
    if (res.error) return 'unknown';
    return parseAuthStatus(res.stdout ?? '', res.status);
  } catch {
    return 'unknown';
  }
}

/**
 * The script the blocked agent's own terminal runs IN PLACE of the CLI.
 *
 * Same shape as buildMissingCliScript: print a banner saying what happened, run
 * the real fix where the user can watch it, then hand back. `claude auth login`
 * opens a browser and waits, which is exactly why this belongs in a PTY rather
 * than behind a spinner.
 *
 * The exit code is the contract. index.ts relaunches the agent in this same
 * terminal only on a clean exit, so the script ends by ASKING the CLI whether
 * the sign-in actually took, rather than trusting `auth login`'s own status —
 * a cancelled browser flow must not be reported as success and respawn an agent
 * that will sit on the same "Not logged in" screen.
 *
 * `platform` is a parameter only so the Windows branch is reachable from a test
 * on macOS, the trick ptyEnv.ts and cliInstall.ts both use.
 */
export function buildLoginScript(
  binary: string,
  platform: string = process.platform
): string {
  // Trusted constant in practice (always 'claude'), sanitized anyway: it is
  // interpolated into a shell script.
  const bin = (binary || 'claude').replace(/[^A-Za-z0-9._/\\-]/g, '') || 'claude';
  const rule = '------------------------------------------------------------';

  if (platform === 'win32') {
    // ONE cmd.exe line, `&`-chained, no double quotes — it is wrapped verbatim
    // in `/d /s /c "..."`. `^&` would print a literal ampersand; none needed here.
    return [
      'echo.',
      `echo ${rule}`,
      'echo   Claude Code is signed out.',
      'echo.',
      'echo   Signing in now so you can watch. This opens your browser —',
      'echo   finish there, then come back to this terminal.',
      `echo ${rule}`,
      'echo.',
      `${bin} auth login`,
      'echo.',
      // findstr in REGEX mode with an unquoted, space-free pattern: `.*`
      // spans the `": "` the CLI pretty-prints, and the whole script is
      // wrapped verbatim in `/d /s /c "..."`, so a double quote anywhere in
      // here would end the command early. findstr is line-based and the JSON
      // is multi-line, so `.*` cannot reach a `true` on a different key.
      `${bin} auth status --json | findstr /R ${'loggedIn.*true'} >nul`,
      'if errorlevel 1 (echo   [x] Still signed out — the agent will not start.) else (echo   [done] Signed in — launching the agent…)'
    ].join(' & ');
  }

  // unix ($SHELL -lc <script>): one statement per line, single-quoted echo text
  // so no shell metacharacter expands, and no `!` anywhere so history expansion
  // never fires.
  return [
    `echo ''`,
    `echo '${rule}'`,
    `echo '  Claude Code is signed out.'`,
    `echo ''`,
    `echo '  Signing in now so you can watch. This opens your browser —'`,
    `echo '  finish there, then come back to this terminal.'`,
    `echo '${rule}'`,
    `echo ''`,
    `${bin} auth login`,
    `echo ''`,
    // Ask the CLI, do not trust the flow: a cancelled browser sign-in can still
    // leave `auth login` exiting 0.
    `if ${bin} auth status --json | grep -q '"loggedIn":[[:space:]]*true'; then`,
    `  echo '  [done] Signed in — launching the agent…'`,
    `  exit 0`,
    `fi`,
    `echo '  [x] Still signed out — the agent will not start.'`,
    `echo '  Run this again, or sign in with: ${bin} auth login'`,
    `exit 1`
  ].join(String.fromCharCode(10));
}
