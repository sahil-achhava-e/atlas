'use strict';

/**
 * SIMPLE MODE decides what the app shows, so the two things that can strand a
 * user are worth pinning: a tab bar that hides the tab you are standing on, and
 * a mode that hides the way back out.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const loadTs = require('./load-ts.cjs');

const {
  SIMPLE_MODE_CC_TABS,
  SIMPLE_MODE_SIDEBAR_TABS,
  visibleTabs,
  coerceTabsForSimpleMode
} = loadTs('src/renderer/src/store/simpleMode.ts');

const CC_TABS = ['terminal', 'human', 'tasks', 'floor', 'memory', 'graph', 'activity', 'workers', 'triggers', 'skills']
  .map((key) => ({ key }));
const SIDEBAR_TABS = ['terminal', 'git', 'messages'].map((key) => ({ key }));

test('technical mode is untouched — every tab still renders', () => {
  assert.deepEqual(visibleTabs(CC_TABS, SIMPLE_MODE_CC_TABS, false), CC_TABS);
  assert.deepEqual(visibleTabs(SIDEBAR_TABS, SIMPLE_MODE_SIDEBAR_TABS, false), SIDEBAR_TABS);
});

test('simple mode drops the tabs about how the crew is wired', () => {
  const keys = visibleTabs(CC_TABS, SIMPLE_MODE_CC_TABS, true).map((tab) => tab.key);
  assert.deepEqual(keys, ['terminal', 'human', 'tasks', 'floor', 'activity']);
  for (const gone of ['memory', 'graph', 'workers', 'triggers', 'skills']) {
    assert.ok(!keys.includes(gone), `${gone} is not for someone who does not code`);
  }
});

test('the composer survives — the terminal tab is never hidden', () => {
  // It is the only way to say anything to an agent. Its BODY folds the raw log
  // away (TechnicalLog); the tab itself has to stay.
  assert.ok(visibleTabs(CC_TABS, SIMPLE_MODE_CC_TABS, true).some((tab) => tab.key === 'terminal'));
  assert.ok(visibleTabs(SIDEBAR_TABS, SIMPLE_MODE_SIDEBAR_TABS, true).some((tab) => tab.key === 'terminal'));
});

test('git goes from the focus view', () => {
  const keys = visibleTabs(SIDEBAR_TABS, SIMPLE_MODE_SIDEBAR_TABS, true).map((tab) => tab.key);
  assert.deepEqual(keys, ['terminal', 'messages']);
});

test('a tab that is about to disappear does not strand the user', () => {
  // Both selections are persisted in localStorage, so without this someone who
  // was last on Skills comes back to a blank pane with no tab lit.
  assert.deepEqual(coerceTabsForSimpleMode('skills', 'git'), { ccTab: 'human', sidebarTab: 'terminal' });
  assert.deepEqual(coerceTabsForSimpleMode('graph', 'messages'), { ccTab: 'human', sidebarTab: 'messages' });
});

test('a tab that survives is left exactly where it was', () => {
  assert.deepEqual(coerceTabsForSimpleMode('tasks', 'terminal'), { ccTab: 'tasks', sidebarTab: 'terminal' });
});

// --- no raw terminal in the docked panes -----------------------------------
// The panes people read are read-only: what the agent is SAYING and what it is
// working on, never the engine's TUI. The terminal lives in focus mode alone,
// and that is the whole rule — counted rather than described, so a fourth mount
// somewhere fails this too.

const COMPONENT = (name) =>
  readFileSync(join(__dirname, '..', 'src/renderer/src/components', name), 'utf8');

const READ_ONLY_PANES = ['AgentDetailPanel.tsx', 'CommandCenterPanel.tsx'];

test('the docked panes mount no terminal at all', () => {
  for (const file of READ_ONLY_PANES) {
    const src = COMPONENT(file);
    assert.equal(src.match(/<PtyTerminalView/g)?.length ?? 0, 0,
      `${file} puts the engine's TUI back in a pane that is meant to be read`);
    assert.match(src, /<TechnicalLog/, `${file} should show the readable log instead`);
  }
});

test('focus mode is the one place the real terminal opens', () => {
  const src = COMPONENT('FullscreenTerminal.tsx');
  assert.ok((src.match(/<PtyTerminalView/g)?.length ?? 0) > 0,
    'there has to be somewhere to see exactly what the engine printed');
});

test('every button that opens the code editor is hidden in simple mode', () => {
  // Three headers carry one: the docked panel, the command centre and the focus
  // view. A deep link (#/ide) is deliberately still honoured.
  for (const file of ['AgentDetailPanel.tsx', 'CommandCenterPanel.tsx', 'FullscreenTerminal.tsx']) {
    const src = COMPONENT(file);
    if (!src.includes('setIdeOpen(true')) continue;
    assert.match(src, /\.\.\.\(simpleMode \? \[\] : \[/,
      `${file} opens Monaco with no check for simple mode`);
  }
});

// --- the dialogs -------------------------------------------------------------
// Each of these hides a block that asks for something only an engineer can
// answer. Source assertions, in the style of avatar-variety.test: these are
// single conditions inside large JSX trees, and a test that renders the tree
// would be a testing-library dependency for one boolean each.

test('Settings hides everything but General in simple mode', () => {
  const src = COMPONENT('SettingsModal.tsx');
  assert.match(src, /const SIMPLE_NAV: Section\[\] = \['General'\];/,
    'simple mode can reach a settings page of keys, ports and model ids');
  // The door out lives in General, so General itself can never be the hidden one.
  assert.match(src, /navSections\.includes\(activeSection\) \? activeSection : 'General'/,
    'a hidden section can still be the one being rendered');
});

test('Settings hides the rows inside General that need a path or a context window', () => {
  const src = COMPONENT('SettingsModal.tsx');
  for (const row of ['homeFolder', 'maintenance']) {
    const at = src.indexOf(`settings.general.${row}`);
    assert.ok(at > 0, row);
    // the guard opening that card sits just above it
    assert.match(src.slice(Math.max(0, at - 600), at), /\{!simpleMode && \(/,
      `the ${row} row is shown to someone who does not code`);
  }
});

test('Edit agent does not offer a provider or a model in simple mode', () => {
  const src = COMPONENT('EditAgentModal.tsx');
  const at = src.indexOf('<Section label="Engine"');
  assert.ok(at > 0, 'the Engine section moved — check this guard still wraps it');
  assert.match(src.slice(Math.max(0, at - 400), at), /\{!simpleMode && \(/);
});

test('Add agent does not offer git isolation in simple mode', () => {
  const src = COMPONENT('AddAgentModal.tsx');
  assert.ok(src.includes("tr('addAgent.gitIsolation')"), 'the isolation block moved');
  // The guard opens the block itself, so anchor on the pair rather than on a
  // character distance that any edit inside the block would change.
  assert.match(src, /\{!simpleMode && \(\s*<label style=\{\{/,
    'git isolation is offered to someone who does not use git');
  // and the spawn never asks for a worktree it would not offer
  assert.match(src, /isolate: resuming \|\| !canIsolate \|\| simpleMode \? false : isolate,/);
});
