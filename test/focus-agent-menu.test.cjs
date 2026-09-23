'use strict';

/**
 * Changing agent from inside focus mode.
 *
 * There was no way: Esc, find the agent in the sidebar, click it, press focus
 * again. The first attempt at fixing it was a permanent chip strip across the
 * top, which was rejected for costing height on every screen forever. This one
 * spends no space at all — the title bar sits above the focus overlay in both
 * of its branches, and its centre already held a readout that was
 * `pointerEvents: 'none'`.
 *
 * Run: node --test test/focus-agent-menu.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { switchOptions, canSwitch } = loadTs('src/renderer/src/components/agentSwitcher.ts');

const agent = (id, extra = {}) => ({
  id, name: id, character: 'jim', accent: 'lilac', status: 'idle', ptyId: `pty-${id}`, ...extra
});

test('only agents with a terminal are offered', () => {
  // FullscreenTerminal renders nothing for an agent with no ptyId — it re-homes
  // away from one — so listing it would be a dead control.
  const o = switchOptions([agent('a'), { ...agent('b'), ptyId: undefined }, agent('c')], 'a');
  assert.deepEqual(o.map((x) => x.id), ['a', 'c']);
});

test('an archived agent is not a switch target', () => {
  const o = switchOptions([agent('a'), agent('b', { archived: true })], 'a');
  assert.deepEqual(o.map((x) => x.id), ['a']);
});

test('the orchestrator is pinned first wherever it sits in the roster', () => {
  const o = switchOptions([agent('naruto'), agent('god', { isGod: true }), agent('sakura')], 'naruto');
  assert.equal(o[0].id, 'god');
});

test('everyone else keeps roster order, so the menu agrees with the sidebar', () => {
  const o = switchOptions(
    [agent('god', { isGod: true }), agent('naruto'), agent('sasuke'), agent('sakura')], 'god');
  assert.deepEqual(o.map((x) => x.id), ['god', 'naruto', 'sasuke', 'sakura']);
});

test('status never reorders the list', () => {
  // A switch target that moves under the cursor is worse than no switcher, and
  // status changes on every heartbeat.
  const before = switchOptions([agent('a'), agent('b'), agent('c')], 'a');
  const after = switchOptions(
    [agent('a'), { ...agent('b'), status: 'blocked' }, { ...agent('c'), status: 'working' }], 'a');
  assert.deepEqual(after.map((x) => x.id), before.map((x) => x.id));
});

test('exactly one entry is current, and an unknown id marks none', () => {
  assert.deepEqual(
    switchOptions([agent('a'), agent('b')], 'b').filter((x) => x.current).map((x) => x.id), ['b']);
  // Mid re-home: the store has dropped the agent and not yet picked the next.
  assert.equal(switchOptions([agent('a'), agent('b')], 'gone').some((x) => x.current), false);
});

test('blocked is the status that means YOU are the hold-up', () => {
  const o = switchOptions(
    [agent('a', { status: 'blocked' }), agent('b', { status: 'waiting' }), agent('c', { status: 'working' })], 'a');
  assert.deepEqual(o.filter((x) => x.needsYou).map((x) => x.id), ['a']);
});

test('one switchable agent is a readout, not a menu', () => {
  assert.equal(canSwitch(switchOptions([agent('a')], 'a')), false);
  assert.equal(canSwitch(switchOptions([agent('a'), { ...agent('b'), ptyId: undefined }], 'a')), false);
  assert.equal(canSwitch(switchOptions([], null)), false);
  assert.equal(canSwitch(switchOptions([agent('a'), agent('b')], 'a')), true);
});

// ── the wiring a unit test cannot reach ─────────────────────────────────────

const src = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('it costs no new chrome: the title bar readout is reused, not added to', () => {
  const app = src('src/renderer/src/App.tsx');
  assert.match(app, /<FocusAgentMenu \/>/);
  // The old readout hides in focus mode rather than the menu sitting beside it.
  assert.match(app, /display: fullscreenAgentId \? 'none' : 'inline-flex'/);
});

test('it renders only in focus mode', () => {
  const menu = src('src/renderer/src/components/FocusAgentMenu.tsx');
  assert.match(menu, /if \(!fullscreenAgentId \|\| !current\) return null;/);
});

test('Escape closes the menu before it closes focus mode', () => {
  // Focus mode owns Escape. Without joining its guard, opening the menu and
  // pressing Escape would drop you out of focus mode entirely.
  const term = src('src/renderer/src/components/FullscreenTerminal.tsx');
  const guard = term.indexOf('focusMenuOpen');
  const exit = term.indexOf('setFullscreen(null);');
  assert.ok(guard > 0, 'the handler knows about the menu');
  assert.ok(guard < exit, 'the menu is checked before focus mode is left');
});

test('the open flag lives in the store, like the other Esc guards', () => {
  const store = src('src/renderer/src/store/store.ts');
  assert.match(store, /focusMenuOpen: boolean;/);
  assert.match(store, /setFocusMenuOpen: \(open\) => set\(\{ focusMenuOpen: open \}\)/);
});

test('leaving focus mode does not strand the flag open', () => {
  // A stranded flag would make the next Escape a no-op, guarded for a menu
  // nobody can see.
  const menu = src('src/renderer/src/components/FocusAgentMenu.tsx');
  assert.match(menu, /if \(!fullscreenAgentId && open\) setOpen\(false\);/);
});

test('every locale can label it', () => {
  const dir = path.join(__dirname, '..', 'src/renderer/src/i18n/locales');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(j.focusMenu, `${f} is missing focusMenu`);
    assert.match(j.focusMenu.label, /\{\{name\}\}/, `${f} label must name the agent`);
    assert.ok(j.focusMenu.needsYou, `${f} is missing focusMenu.needsYou`);
  }
});
