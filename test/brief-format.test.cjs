/**
 * Asked in chat for a new hire's brief, Atlas writes the three parts Add Agent
 * asks for, with the reporting line to the project's lead, instead of one
 * generic paragraph.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/hive.ts'), 'utf8');

test('the orchestrator is told how to write a brief, and only the orchestrator', () => {
  const m = /const briefLine = meta\.isGod\s*\? '([^\n]*)'\s*: '';/.exec(src);
  assert.ok(m, 'briefLine exists and is orchestrator-only');
  for (const part of ['**Title**', '**What does it do?**', '**When is it finished?**', 'WHO YOU REPORT TO', 'LEAD from the live roster', 'EVERY FACT COMES FROM THE PROJECT']) {
    assert.ok(m[1].includes(part), `brief rule names ${part}`);
  }
  assert.ok(/godLine,\s*briefLine,/.test(src), 'briefLine is in the assembled prompt');
});

test('every agent gets the token-saving tool rules', () => {
  const m = /const toolLine = '([^\n]*)';/.exec(src);
  assert.ok(m, 'toolLine is a static line for every agent');
  assert.ok(m[1].includes('SEARCH, DO NOT DUMP') && m[1].includes('NEVER RE-READ A FILE YOU JUST WROTE'));
  assert.ok(/craftLine,\s*toolLine,/.test(src), 'toolLine is in the assembled prompt');
});
