'use strict';

/**
 * Add agent has two ways to change step — the Next button and the rail — and
 * they used to disagree: the rail only ever asked about identity, so Briefing
 * and the Hire button were reachable with no project folder chosen, and the
 * check that caught it lived in submit(), three steps later.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { canOpenSection, sectionsFor, SECTION_ORDER } = loadTs('src/renderer/src/components/addAgentGate.ts');

const ready = (over = {}) =>
  ({ identity: true, workspace: true, engine: true, briefing: true, ...over });

test('the first step is always open', () => {
  assert.equal(canOpenSection(ready({ identity: false }), 'identity'), true);
});

test('nothing past identity opens until a face and a name are chosen', () => {
  const r = ready({ identity: false });
  for (const key of ['workspace', 'engine', 'briefing']) {
    assert.equal(canOpenSection(r, key), false, key);
  }
});

test('no folder chosen keeps you on the workspace step', () => {
  // The bug: this used to be true, and the folder was only checked at submit.
  const r = ready({ workspace: false });
  assert.equal(canOpenSection(r, 'workspace'), true, 'the step itself still opens');
  assert.equal(canOpenSection(r, 'engine'), false);
  assert.equal(canOpenSection(r, 'briefing'), false, 'Hire lives here');
});

test('every step opens once the ones before it are answered', () => {
  for (const key of SECTION_ORDER) {
    assert.equal(canOpenSection(ready(), key), true, key);
  }
});

test('an unknown step is not openable', () => {
  assert.equal(canOpenSection(ready(), 'nonsense'), false);
});

// --- what simple mode asks for -----------------------------------------------

test('a technical setup has all five steps, with the desk last', () => {
  assert.deepEqual(sectionsFor(false), ['identity', 'workspace', 'engine', 'briefing', 'desk']);
});

test('simple mode does not ask for an engine, a model or a command', () => {
  // The workspace answered those at setup, and the form still seeds itself from
  // them — what spawns is the same either way, it is just not asked about here.
  const sections = sectionsFor(true);
  assert.ok(!sections.includes('engine'));
  assert.deepEqual(sections, ['identity', 'workspace', 'briefing', 'desk']);
});

test('the gate walks whichever list it is given', () => {
  const simple = sectionsFor(true);
  // Briefing is now the step after workspace, so an unfilled folder still blocks
  // it — the step that vanished must not take the gate with it.
  assert.equal(canOpenSection({ identity: true, workspace: false, engine: true, briefing: true }, 'briefing', simple), false);
  assert.equal(canOpenSection({ identity: true, workspace: true, engine: true, briefing: true }, 'briefing', simple), true);
});
