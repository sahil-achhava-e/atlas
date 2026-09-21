'use strict';

// The human asks Atlas for something in a project, and Atlas does it himself.
// The floor then has ten agents and one of them working.
//
// The chain is human → orchestrator → the project's TEAM LEAD → their
// engineer. The orchestrator's prompt said "delegate" and "do not take on
// grunt implementation", which is advice; it never named the lead layer, and
// the live roster listed a lead as just another agent with a longer role
// string, so "route to someone who fits" picked an engineer or nobody.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');
const src = fs.readFileSync(join(__dirname, '..', 'src/main/hive.ts'), 'utf8');

async function godPrompt() {
  const home = mkdtempSync(join(tmpdir(), 'hive-lead-'));
  const hive = new HiveManager(() => home);
  const inj = await hive.ensureAgent(
    { id: 'god', name: 'Atlas', provider: 'claude', cwd: home, isGod: true }, {});
  return inj.args[inj.args.indexOf('--append-system-prompt') + 1];
}

async function leadPrompt() {
  const home = mkdtempSync(join(tmpdir(), 'hive-lead2-'));
  const hive = new HiveManager(() => home);
  const inj = await hive.ensureAgent(
    { id: 'lead-1', name: 'Luffy', provider: 'claude', cwd: home, isLead: true }, {});
  return inj.args[inj.args.indexOf('--append-system-prompt') + 1];
}

test('the orchestrator is told the chain, and told not to skip a link', async () => {
  const p = await godPrompt();
  assert.match(p, /DELEGATE THROUGH THE LEAD/);
  assert.match(p, /you do not skip a link in it/);
  assert.match(p, /assign it to THAT LEAD/);
  assert.match(p, /do not hand it straight to an engineer over the lead's head/);
});

test('answering a question is still his job — the rule is about doing, not talking', async () => {
  const p = await godPrompt();
  assert.match(p, /ANSWERING IS NOT DOING/);
  assert.match(p, /Changing a repo is not/);
});

test('a project with no lead still gets routed, with the reason said out loud', async () => {
  const p = await godPrompt();
  assert.match(p, /Only where a project has NO lead do you route to an engineer directly/);
});

test('the lead is told that assigning IS the job', async () => {
  const p = await leadPrompt();
  assert.match(p, /ASSIGN IT TO ONE OF YOUR ENGINEERS BY NAME/);
  assert.match(p, /A card sitting in your own queue while engineers are idle/);
  assert.match(p, /it is two cards and you own the merge order/);
});

test('the live roster marks who leads, rather than leaving it in a role string', () => {
  assert.match(src, /leads\.has\(a\.id\)\) bits\.push\('TEAM LEAD — route this project through them'\)/);
  assert.match(src, /const leads = new Set\(Object\.values\(this\.registry\(\)\.agents \?\? \{\}\)/,
    'the flag comes from the registry: fleet.json does not carry it');
});
