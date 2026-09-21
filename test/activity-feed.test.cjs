'use strict';

// The readable half of the app. Someone who does not want a terminal reads this
// instead, so a row that is noise, or a row that is missing, is the whole
// feature failing quietly.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { activityRows, lastSaid } = loadTs('src/shared/activityFeed.ts');

const line = (o) => JSON.stringify(o);
const assistant = (...content) => line({ type: 'assistant', timestamp: '2026-09-19T10:00:00Z', message: { content } });

test('prose is kept as prose', () => {
  const rows = activityRows([assistant({ type: 'text', text: 'Found it: the token expires early.' })]);
  assert.deepEqual(rows.map((r) => [r.kind, r.text]), [['say', 'Found it: the token expires early.']]);
});

test('a tool call becomes a verb and the thing it acted on', () => {
  const rows = activityRows([
    assistant({ type: 'tool_use', name: 'Read', input: { file_path: '/repo/src/auth.ts' } }),
    assistant({ type: 'tool_use', name: 'Bash', input: { command: 'npm test', description: 'Run the tests' } })
  ]);
  assert.deepEqual(rows, [
    { kind: 'do', text: 'Reading', tone: 'read', detail: '/repo/src/auth.ts', at: Date.parse('2026-09-19T10:00:00Z') },
    { kind: 'do', text: 'Running a command', tone: 'run', detail: 'Run the tests', at: Date.parse('2026-09-19T10:00:00Z') }
  ]);
});

test('an unknown tool still gets a row, under its own name', () => {
  // An agent doing something unnamed is still an agent doing something.
  const rows = activityRows([assistant({ type: 'tool_use', name: 'Sharpen', input: {} })]);
  assert.deepEqual(rows.map((r) => [r.text, r.tone]), [['Sharpen', 'other']]);
});

test('a helper inside the session is not a hire', () => {
  // Task starts a helper in the agent's OWN session: no desk, no card, gone when
  // the step is. Calling it "handing work to a helper" read as delegating to a
  // worker who did not exist, on a floor with nobody on it.
  const rows = activityRows([assistant({ type: 'tool_use', name: 'Task', input: { description: 'Brief the repo' } })]);
  assert.equal(rows[0].text, 'Side task');
  assert.ok(!/helper|agent|hire/i.test(rows[0].text));
});

test('reading and changing are not the same colour', () => {
  // The two carry different risk, so they must not look alike at a glance.
  const tone = (name) => activityRows([assistant({ type: 'tool_use', name, input: {} })])[0].tone;
  assert.equal(tone('Read'), 'read');
  assert.equal(tone('Edit'), 'write');
  assert.equal(tone('Write'), 'write');
  assert.equal(tone('Bash'), 'run');
  assert.equal(tone('Grep'), 'search');
  assert.equal(tone('Task'), 'delegate');
  assert.equal(tone('TodoWrite'), 'plan');
});

test('thinking never reaches the page', () => {
  // It is the model's scratchpad. Someone who asked for less noise gets less.
  const rows = activityRows([assistant({ type: 'thinking', thinking: 'hmm, maybe the cache' })]);
  assert.deepEqual(rows, []);
});

test('the engine talking to itself is dropped', () => {
  const rows = activityRows([
    assistant({ type: 'text', text: 'API Error: Connection lost mid-response.' }),
    assistant({ type: 'text', text: '<system-reminder>do the thing</system-reminder>' }),
    assistant({ type: 'text', text: '   ' }),
    assistant({ type: 'text', text: 'Right, that is done.' })
  ]);
  assert.deepEqual(rows.map((r) => r.text), ['Right, that is done.']);
});

test("the engine's bookkeeping is skipped, and the human's turn is kept", () => {
  // The human's own message became a row of its own — see
  // test/activity-owner-side.test.cjs for which user entries count and why.
  // Everything else the engine writes about itself still goes.
  const rows = activityRows([
    line({ type: 'user', message: { content: [{ type: 'text', text: 'please fix it' }] } }),
    line({ type: 'mode', mode: 'normal' }),
    line({ type: 'file-history-snapshot' }),
    assistant({ type: 'text', text: 'On it.' })
  ]);
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.text}`), ['ask:please fix it', 'say:On it.']);
});

test('a half-written line does not lose the rest of the file', () => {
  // The transcript is appended to WHILE this reads it, so the last line is
  // routinely incomplete.
  const rows = activityRows([assistant({ type: 'text', text: 'first' }), '{"type":"assis']);
  assert.deepEqual(rows.map((r) => r.text), ['first']);
});

test('only the tail is kept', () => {
  const many = Array.from({ length: 50 }, (_, i) => assistant({ type: 'text', text: `line ${i}` }));
  const rows = activityRows(many, 5);
  assert.deepEqual(rows.map((r) => r.text), ['line 45', 'line 46', 'line 47', 'line 48', 'line 49']);
});

test('a long detail is cut to one line', () => {
  const rows = activityRows([assistant({ type: 'tool_use', name: 'Bash', input: { description: 'x'.repeat(200) } })]);
  assert.ok(rows[0].detail.length <= 120);
  assert.ok(rows[0].detail.endsWith('…'));
});

test('the last thing SAID skips over the work', () => {
  const rows = activityRows([
    assistant({ type: 'text', text: 'Looking now.' }),
    assistant({ type: 'tool_use', name: 'Read', input: { file_path: '/a.ts' } })
  ]);
  assert.equal(lastSaid(rows), 'Looking now.');
  assert.equal(lastSaid([]), undefined);
});

// The floor's thought bubble. It said "using Bash" — the tool's name, to
// everyone, including the person who chose the plain register. What someone
// watching a floor wants is whether an agent is reading, writing or stuck.

const { toolPhrase } = loadTs('src/shared/activityFeed.ts');

test('an agent is doing something, not using something', () => {
  assert.equal(toolPhrase('Bash'), 'running a command');
  assert.equal(toolPhrase('Read'), 'reading a file');
  assert.equal(toolPhrase('Edit'), 'editing a file');
  assert.equal(toolPhrase('Grep'), 'searching the code');
  assert.equal(toolPhrase('Task'), 'on a side task');
});

test('an unknown tool says the honest minimum, never its own name', () => {
  for (const t of ['Sharpen', 'mcp__weird__thing', '']) {
    assert.equal(toolPhrase(t), 'working', t);
  }
});

test('the phrases land mid-sentence, so they are lowercase', () => {
  for (const t of ['Bash', 'Read', 'Write', 'Glob', 'WebSearch', 'TodoWrite', 'Nope']) {
    const p = toolPhrase(t);
    assert.equal(p, p.toLowerCase(), t);
  }
});
