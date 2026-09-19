'use strict';
/**
 * Keep browser mode up.
 *
 * The server is the whole backend for a browser tab: when it dies, the page says
 * "127.0.0.1 refused to connect" and every agent it was running is gone with it.
 * Node can die in ways no `try` reaches — a native addon aborting the process is
 * the one we have actually seen ("RemoveEnvironmentCleanupHook … Assertion
 * failed", twice, from inside an HTTP request). That crash is not understood
 * yet. This does not fix it; it stops it being the end of the session.
 *
 * WHAT THIS IS NOT. It is not a way to ignore crashes. Every restart is printed
 * with the exit signal and the count, because a supervisor that restarts
 * silently turns a bug into a mystery — and a crash loop must look like a crash
 * loop, which is why a run that dies immediately, repeatedly, gives up.
 */

const { spawn } = require('node:child_process');
const { join } = require('node:path');

const SERVER = join(__dirname, '..', 'out', 'server', 'index.cjs');

/** A restart is only reasonable if the last run got somewhere. Six deaths
 *  inside a minute is a process that cannot start, and restarting it forever
 *  hides the reason. */
const WINDOW_MS = 60_000;
const MAX_IN_WINDOW = 5;

let deaths = [];
let child = null;
let stopping = false;

function start() {
  child = spawn(process.execPath, [SERVER, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env
  });

  child.on('exit', (code, signal) => {
    child = null;
    // A clean exit is the operator's decision (Ctrl-C reaches the child too),
    // and a refusal to start — the instance lock — exits 1 on purpose.
    if (stopping || code === 0) { process.exit(code ?? 0); return; }

    const now = Date.now();
    deaths = deaths.filter((t) => now - t < WINDOW_MS);
    deaths.push(now);

    if (deaths.length > MAX_IN_WINDOW) {
      console.error(`\n[serve] the server died ${deaths.length} times in a minute — not restarting again.`);
      console.error('[serve] the output above is the reason. Fix it, then run this again.\n');
      process.exit(1);
    }

    const why = signal ? `signal ${signal}` : `exit code ${code}`;
    console.error(`\n[serve] the server died (${why}). Restarting — ${deaths.length} time(s) this minute.\n`);
    setTimeout(start, 500);
  });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopping = true;
    try { child?.kill(sig); } catch { /* already gone */ }
  });
}

start();
