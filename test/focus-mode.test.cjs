'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { refocusAfterRemoval, focusOnLoad, restoreFocus } =
  loadTs('src/renderer/src/store/focusMode.ts');

const agents = (...ids) => ids.map((id) => ({ id }));

// --- re-homing focus mode when an agent goes away --------------------------
// Closing an agent is not a request to leave focus mode. Before this, every
// removal path re-homed selectedId and left fullscreenAgentId dangling, so the
// window fell back to the sidebar the moment you closed the agent you were
// focused on.

test('focus stays put when some OTHER agent is removed', () => {
  assert.equal(refocusAfterRemoval('b', agents('a', 'b', 'c'), 'a'), 'b');
});

test('focus follows the selection when the focused agent is removed', () => {
  assert.equal(refocusAfterRemoval('b', agents('a', 'c'), 'c'), 'c',
    'the removal path already picked a new selection, focus mode should honour it');
});

test('focus falls back to the first agent when the selection is also gone', () => {
  assert.equal(refocusAfterRemoval('b', agents('a', 'c'), null), 'a');
});

test('focus mode ends only once the last agent is gone', () => {
  assert.equal(refocusAfterRemoval('b', agents(), null), null);
});

test('a window that was not in focus mode is never dragged into it', () => {
  assert.equal(refocusAfterRemoval(null, agents('a', 'b'), 'a'), null,
    'removing an agent must not turn focus mode ON');
});

// --- restoring the preference on load --------------------------------------
// The preference is a boolean, not an id: the previously focused agent may not
// exist next launch, and restoring a stale id recreates the dangling reference
// above.

test('focus mode is restored against whoever is selected now', () => {
  assert.equal(focusOnLoad(true, 'a'), 'a');
});

test('no preference means the sidebar, as before', () => {
  assert.equal(focusOnLoad(false, 'a'), null);
});

test('the preference resolves to nothing when there is no agent to focus', () => {
  assert.equal(focusOnLoad(true, null), null,
    'first run, or every agent gone: nothing to show in focus mode');
});

// --- re-applying the preference once the roster is live --------------------
// `focusOnLoad` runs once, while the store is being built. At that moment every
// restored agent still carries the PREVIOUS session's PTY id, so the startup
// reconcile prunes them all and focus mode is correctly nulled before god has
// respawned. Nothing re-checked the preference afterwards, so the app opened in
// the sidebar with the flag still set to 1. That was the actual "closing and
// opening did not open in focus mode" bug.

const live = (...ids) => ids.map((id) => ({ id, ptyId: `pty-${id}` }));

test('focus mode re-enters once an agent with a terminal shows up', () => {
  assert.equal(restoreFocus(true, null, live('god'), 'god'), 'god');
});

test('the restore waits for a LIVE terminal, it does not latch onto a corpse', () => {
  assert.equal(restoreFocus(true, null, agents('god'), 'god'), null,
    'a restored agent still holding last session PTY id is not focusable yet');
});

test('no preference means the roster changing never opens focus mode', () => {
  assert.equal(restoreFocus(false, null, live('a', 'b'), 'a'), null);
});

test('an explicit exit stays exited even as the roster keeps changing', () => {
  // Esc / the exit button write prefersFocusMode = false, so every later roster
  // change is a no-op. Without that the restore would fight the user.
  assert.equal(restoreFocus(false, null, live('a'), 'a'), null);
});

test('already in focus mode is left alone', () => {
  assert.equal(restoreFocus(true, 'b', live('a', 'b'), 'a'), 'b',
    'must not yank the view onto the selected agent');
});

test('the restore prefers the selected agent, then falls back to any live one', () => {
  assert.equal(restoreFocus(true, null, live('a', 'b'), 'b'), 'b');
  assert.equal(restoreFocus(true, null, live('a', 'b'), 'missing'), 'a');
  assert.equal(restoreFocus(true, null, live('a', 'b'), null), 'a');
});

test('nothing live yet returns null, and the preference survives for next time', () => {
  assert.equal(restoreFocus(true, null, [], null), null);
});

// --- the bar names agents by SLUG, the store keys them by ID ----------------
// Pressing focus with an agent selected took you to Atlas, out of focus mode:
// App's route effect fed r.agentId (a slug like "wednesday-a1b2") straight into
// setFullscreen, which holds an id. FullscreenTerminal then matched no agent
// and fell through to the first one with a live PTY. Source-level, because the
// effect is inline in the component — same approach as settings-one-save.

const APP = require('node:fs').readFileSync('src/renderer/src/App.tsx', 'utf8');

test('the route effect resolves the slug to an id before setting focus', () => {
  const i = APP.indexOf('const focus = ');
  assert.ok(i > 0, 'the focus line is gone — this test needs rewriting');
  const line = APP.slice(i, APP.indexOf('\n', i));
  assert.match(line, /routedAgent/, 'focus is being set from the raw route slug again');
  assert.doesNotMatch(line, /r\.agentId/, 'focus is being set from the raw route slug again');
});

test('the IDE gets the resolved id too, not the slug', () => {
  const i = APP.indexOf('st.setIdeOpen(ide,');
  assert.ok(i > 0, 'the setIdeOpen call moved — this test needs rewriting');
  const line = APP.slice(i, APP.indexOf('\n', i));
  assert.match(line, /routedAgent/, 'the IDE is being opened on a slug');
});
