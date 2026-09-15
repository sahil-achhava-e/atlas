'use strict';

/**
 * "Explain things simply" — the audience question in onboarding, and the switch
 * in Settings → General — used to write a config value nothing ever read. The
 * copy promised that agents would brief you in plain language; no agent was ever
 * told. The register now rides the injected system prompt, so these two asserts
 * are what fails if that thread is cut again.
 *
 * The other half of the fix (telling agents that are ALREADY running, over the
 * inbox) lives in the config:update handler in src/main/index.ts, which needs
 * Electron to load and is not covered here.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

async function promptFor(t, injectOpts) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-register-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  const inj = await hive.ensureAgent(
    { id: 'god-1', name: 'Michael', provider: 'claude', cwd: home, isGod: true },
    injectOpts
  );
  const i = inj.args.findIndex((a) => a === '--append-system-prompt' || a === '--prompt');
  assert.ok(i >= 0, 'the hive protocol must be on argv');
  return inj.args[i + 1];
}

test('plainLanguage puts the register instruction in the prompt', async (t) => {
  const prompt = await promptFor(t, { plainLanguage: true });
  assert.match(prompt, /PLAIN LANGUAGE:/);
  // Scoped to what the agent says to the human — turning this on must not tell it
  // to write different code or talk to its siblings differently.
  assert.match(prompt, /messages to other agents/);
});

test('the default prompt says nothing about register', async (t) => {
  for (const opts of [{}, { plainLanguage: false }]) {
    const prompt = await promptFor(t, opts);
    assert.doesNotMatch(prompt, /PLAIN LANGUAGE:/);
  }
});
