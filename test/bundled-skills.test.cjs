'use strict';

// The three skills the crew actually works to — reproduce-first bug fixing,
// the pre-commit gate, and the merge-decision review — ship WITH the app.
//
// They started life in ~/Atlas/skills on one machine, which meant a fresh
// install had the copying feature and none of the skills. Anything every crew
// should have belongs in resources/skills, where the packager puts it beside
// the app and copyBundledSkills hands it to each agent at spawn.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'resources', 'skills');
const SHIPPED = ['bug-fix', 'pre-commit-review', 'pr-review'];

function frontmatter(name) {
  const text = fs.readFileSync(path.join(DIR, name, 'SKILL.md'), 'utf8');
  assert.ok(text.startsWith('---\n'), `${name}: SKILL.md must open with frontmatter`);
  return { head: text.slice(4, text.indexOf('\n---', 4)), body: text };
}

test('the crew skills ship with the app', () => {
  for (const name of SHIPPED) {
    assert.ok(fs.existsSync(path.join(DIR, name, 'SKILL.md')), `${name} is not in resources/skills`);
  }
});

test('each one declares the name and description the CLI reads', () => {
  for (const name of SHIPPED) {
    const { head } = frontmatter(name);
    assert.match(head, new RegExp(`^name: ${name}$`, 'm'), `${name}: frontmatter name must match the folder`);
    const desc = /^description: (.+)$/m.exec(head);
    assert.ok(desc, `${name}: no description — the model decides whether to use a skill from this`);
    assert.ok(desc[1].length > 80, `${name}: the description must say WHEN to use it, not just what it is`);
  }
});

test('they are project-agnostic: coordinates come from config, never hardcoded', () => {
  // One skill, every repo. A hardcoded org, branch or path would make it
  // wrong everywhere except the project it was written against.
  for (const name of SHIPPED) {
    const { body } = frontmatter(name);
    // Matched by SHAPE, not by a list of names. The list used to spell out the
    // author's own org and repos, which put them in a public repo to assert
    // they must not be in a public repo. A concrete coordinate is one with
    // real characters where a placeholder (`{org}`, `<repo>`) would be.
    assert.doesNotMatch(body, /\b(?:dev\.azure\.com|[a-z0-9-]+\.visualstudio\.com)\/[A-Za-z0-9._-]+/,
      `${name}: hardcoded Azure DevOps org`);
    assert.doesNotMatch(body, /\bgithub\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/,
      `${name}: hardcoded repo`);
    assert.doesNotMatch(body, /\/Volumes\/|\/Users\//, `${name}: hardcoded machine path`);
    assert.match(body, /\.atlas\/project\.json/, `${name}: must read its coordinates from the project config`);
  }
});

test('none of them tells an agent to spawn a subagent', () => {
  // Task is denied on this floor: work goes to agents the human hired.
  for (const name of SHIPPED) {
    const { body } = frontmatter(name);
    assert.doesNotMatch(body, /\bspawn (a |an )?(sub)?agent\b/i, `${name}: subagents are off`);
  }
});

test('the packager ships the whole skills tree, so a new one needs no build change', () => {
  const yml = fs.readFileSync(path.join(__dirname, '..', 'electron-builder.yml'), 'utf8');
  assert.match(yml, /- from: resources\/skills\n\s*to: skills/);
});
