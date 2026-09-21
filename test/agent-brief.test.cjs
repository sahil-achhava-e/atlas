'use strict';

// A briefing is written as three answers and stored as one string. Edit Agent
// showed that string raw, in a box labelled "Goal" — so the human could not
// find what they had written under "When is it finished?" and reasonably
// concluded the app had thrown it away.
//
// The format and the parser live together so they cannot drift apart. If the
// composed wording changed and the parser did not, the section would go
// missing again, silently.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { composeBrief, splitBrief, projectLine, DEFAULT_ASK, DEFAULT_DONE } =
  loadTs('src/shared/agentBrief.ts');

test('what the hire dialog writes, the editor can take apart', () => {
  const brief = {
    job: 'You own the Outlook add-in task pane.\n\nTHE STACK. React 18, Fluent UI.',
    project: 'visits-outlook-addin',
    done: 'a PR against staging with the tsc output quoted'
  };
  const back = splitBrief(composeBrief(brief));
  assert.equal(back.job, brief.job);
  assert.equal(back.project, brief.project);
  assert.equal(back.done, brief.done);
  assert.equal(back.ask, DEFAULT_ASK);
  assert.equal(back.raw, undefined, 'a composed briefing is editable field by field');
});

test('a round trip changes nothing', () => {
  const original = composeBrief({ job: 'Do the thing.', project: 'repo', done: DEFAULT_DONE });
  const again = composeBrief(splitBrief(original));
  assert.equal(again, original);
});

test('the project sentence is lifted out, not left in the job text', () => {
  // Otherwise editing and saving would add a second copy of it every time.
  const text = composeBrief({ job: 'Work.', project: 'vms-backend', done: 'a PR' });
  const back = splitBrief(text);
  assert.doesNotMatch(back.job, /You work only in/);
  assert.equal(back.project, 'vms-backend');
  assert.equal(composeBrief(back).match(/You work only in/g).length, 1);
});

test('a briefing that is not in that shape is handed back whole', () => {
  // Pasted in, or from a hire manifest. Guessing where to cut it would lose a
  // paragraph, so the editor shows one box instead.
  const pasted = 'Just do good work.\n\nAnd be nice about it.';
  const back = splitBrief(pasted);
  assert.equal(back.raw, pasted);
  assert.equal(back.job, pasted);
});

test('an empty briefing is empty, not raw', () => {
  assert.deepEqual(splitBrief(undefined), { job: '' });
  assert.deepEqual(splitBrief('   '), { job: '' });
});

test('a briefing with no project sentence still splits', () => {
  const text = composeBrief({ job: 'Roam free.', done: 'a summary' });
  const back = splitBrief(text);
  assert.equal(back.job, 'Roam free.');
  assert.equal(back.project, undefined);
  assert.equal(back.done, 'a summary');
});

test('a custom ask survives the round trip', () => {
  const text = composeBrief({ job: 'x', done: 'y', ask: 'only on fire' });
  assert.equal(splitBrief(text).ask, 'only on fire');
  assert.match(text, /Ask the human when: only on fire/);
});

test('the project sentence names the folder', () => {
  assert.match(projectLine('vms-frontend'), /^You work only in vms-frontend\./);
});
