'use strict';

// A1: one Save button. Settings used to persist three different ways — toggles
// wrote on click, some sections had their own Save, a couple of fields saved on
// blur — and nothing told the user which kind they were looking at.
//
// SettingsModal is a 2000-line TSX with a wide import graph, so these read the
// source rather than mounting it. That is the existing house pattern for this
// file, and it holds the RULE, which is what actually regressed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const MODAL = read('src/renderer/src/components/SettingsModal.tsx');

test('there is exactly one writer of config in the whole modal', () => {
  const calls = MODAL.match(/window\.cth\.updateConfig\(/g) ?? [];
  assert.equal(calls.length, 1,
    `${calls.length} updateConfig calls — every setting must go through saveAll`);
});

test('the one writer is saveAll, and it sends a single merged patch', () => {
  const i = MODAL.indexOf('const saveAll');
  assert.ok(i > 0, 'saveAll is gone');
  const body = MODAL.slice(i, MODAL.indexOf('\n  };', i));
  assert.match(body, /window\.cth\.updateConfig\(patch\)/,
    'saveAll must write one patch, not several calls');
  for (const part of ['maxTurnsPatch()', 'budgetPatch()', '...pending']) {
    assert.ok(body.includes(part), `saveAll does not include ${part}`);
  }
});

test('toggles stage their change instead of writing it', () => {
  // The toggles that used to persist the instant you clicked them. The list is
  // the ones this modal still owns: semanticMemory moved to the Memory tab with
  // its own switch, and auto-update and telemetry were removed in 3ff81c2
  // because neither governed anything in this build.
  for (const key of ['strongKeepalive', 'autoMode', 'orchestratorMaySpawn']) {
    const re = new RegExp(`stage\\(\\{ ${key}:`);
    assert.match(MODAL, re, `${key} is not staged`);
  }
});

test('closing with staged changes asks first, instead of dropping them', () => {
  assert.match(MODAL, /const requestClose/, 'no close guard');
  const i = MODAL.indexOf('const requestClose');
  const body = MODAL.slice(i, i + 300);
  assert.match(body, /dirty/, 'the guard does not check for staged changes');
  // It used to assert window.confirm. The ask is a ConfirmDialog now — the
  // browser's alert was the one piece of UI in the app no token reached — so
  // this pins the same INTENT against the mechanism that replaced it.
  assert.match(body, /setUnsavedOpen\(true\)/, 'the guard does not actually ask');
  assert.match(MODAL, /<ConfirmDialog/, 'the guard opens nothing');
  assert.match(MODAL, /onConfirm=\{\(\) => \{ setUnsavedOpen\(false\); onClose\(\); \}\}/,
    'confirming does not close the modal');
  // And the footer button must use it, not raw onClose.
  assert.match(MODAL, /onClick=\{requestClose\}/, 'the footer Close bypasses the guard');
});

test('the footer offers Save, and it is the only Save left in the modal', () => {
  assert.match(MODAL, /onClick=\{\(\) => void saveAll\(\)\}/, 'no footer Save');
  // The per-section Save buttons this replaced are gone.
  assert.doesNotMatch(MODAL, /onClick=\{saveBudget\}/, 'the budget Save button is back');
  assert.doesNotMatch(MODAL, /onBlur=\{\(\) => void saveMaxTurns\(\)\}/, 'maxTurns saves on blur again');
});

// --- the two deliberate exceptions ------------------------------------------

test('API keys still save immediately: there is no staged value to hold', () => {
  // The broker is write-only — nothing can read a key back to diff it — so a
  // key cannot participate in a staged form. The per-provider panel went with
  // the engines tab; the OpenAI voice key is the only one Settings still asks
  // for, and it must still write on its own.
  assert.match(MODAL, /saveOpenAiVoiceKey/, 'the voice key save was folded into saveAll');
  assert.match(MODAL, /brokerSet\(|apikey:openai/, 'the voice key no longer reaches the broker');
});

test('Free Flow is gone, and nothing in Settings still arms its hotkey', () => {
  // It went through Groq Whisper and needed its own key for something macOS
  // Dictation does free and offline, into the same box. The test that guarded
  // its immediate-save now guards its absence, so it cannot come back by
  // accident with a staged write that would desync main's hotkey.
  assert.doesNotMatch(MODAL, /freeflow/i, 'Free Flow is back in Settings');
});

// --- A2: Connections tidying -------------------------------------------------

test('the section heading is defined once, not written out seventeen times', () => {
  // The heading's own styling changed with the redesign; what this test is for
  // is that ONE definition exists and no call site re-declares it.
  assert.match(MODAL, /const sectionHead = \{/);
  const inline = MODAL.match(/fontFamily: 'var\(--cth-font-ui\)', fontWeight: 700, fontSize: 13,/g) ?? [];
  assert.equal(inline.length, 1, `${inline.length} inline copies remain — only the const should define it`);
});

test('the divider between Connections sections is defined once too', () => {
  assert.match(MODAL, /const sectionRule = \{/);
  const inline = MODAL.match(/\{\{ height: 2, background: 'var\(--cth-ink-300\)' \}\}/g) ?? [];
  assert.equal(inline.length, 0, 'an inline divider survived the extraction');
});

test('Connections is the MCP server list, and only that', () => {
  // This used to assert the opposite: "nothing is deleted from this tab". That
  // instruction was overtaken by ae56e41, which removed the integrations
  // registry, the Slack pipe, webhook endpoints and the organisation key — the
  // last of which configured a messaging service that does not exist. The test
  // now guards the decision that replaced it, so none of them creep back.
  assert.match(MODAL, /McpDefaultsSettings/, 'the MCP list is no longer rendered');
  for (const gone of ['settings.connections.slack', 'settings.connections.webhooks',
                      'slackStart', 'slackStop', 'IntegrationsRegistry']) {
    assert.ok(!MODAL.includes(gone), `${gone} is back in Connections`);
  }
});
