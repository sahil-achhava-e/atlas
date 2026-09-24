/**
 * Every question that offers a choice, from any agent, says what each option
 * affects and which one it recommends. Both the live prompt and the COMMANDS
 * guide teach it, so a fresh install gets it without anyone's personal config.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/hive.ts'), 'utf8');

test('ask format requires what each option affects and a recommendation', () => {
  assert.strictEqual(src.match(/\*\*Recommended:\*\*/g)?.length, 4, 'orchestrator prompt, COMMANDS guide, every-agent line and PROTOCOL all name it');
  assert.ok(/what it AFFECTS/.test(src), 'live prompt asks for what each option affects');
  assert.ok(/each saying what it \*\*affects\*\*/.test(src), 'COMMANDS guide asks for what each option affects');
  assert.ok(/HOW YOU WRITE:[^']*A QUESTION THAT OFFERS A CHOICE[^']*\*\*Recommended:\*\*/.test(src), 'every agent gets the format in HOW YOU WRITE');
  assert.ok(/saying what it \*\*affects\*\* \(what changes/.test(src), 'PROTOCOL.md carries it');
});
