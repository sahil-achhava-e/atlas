'use strict';

/**
 * The Office skill ships with the app, so every agent has it from its first
 * spawn — technical and non-technical alike. It is not fetched, and it is not
 * Anthropic's: those four (docx/xlsx/pptx/pdf in anthropics/skills) carry a
 * licence that forbids redistributing them, creating derivative works, or
 * keeping copies outside Anthropic's own services, so bundling them in this app
 * is not available to us. This one is ours.
 *
 * What is pinned here is delivery and the two claims an agent acts on.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const loadTs = require('./load-ts.cjs');

const { parseSkillFrontmatter } = loadTs('src/main/skills.ts');

const SKILL_PATH = join(__dirname, '..', 'resources/skills/office-docs/SKILL.md');

test('the skill is bundled, so every agent gets it on spawn', () => {
  // copyBundledSkills() copies resources/skills into each agent's
  // .claude/skills per spawn, and electron-builder ships the directory whole —
  // so being in this folder IS the delivery. Nothing to register.
  assert.ok(existsSync(SKILL_PATH), 'office-docs is no longer bundled');
});

test('the app can parse its frontmatter', () => {
  const f = parseSkillFrontmatter(readFileSync(SKILL_PATH, 'utf8'));
  assert.equal(f.name, 'office-docs');
  assert.ok(f.description && f.description.length > 80, 'the Skills tab would show an empty row');
});

test('the description names the extensions it has to trigger on', () => {
  const { description } = parseSkillFrontmatter(readFileSync(SKILL_PATH, 'utf8'));
  for (const ext of ['.xlsx', '.docx', '.pptx', '.pdf']) {
    assert.ok(description.includes(ext), `${ext} would not select this skill`);
  }
});

test('it tells the agent to keep the original', () => {
  // The reason this matters here and not in a general-purpose skill: this app
  // has no undo for a folder that is not a repository, which is the ordinary
  // case for the documents folder simple mode is built around.
  const md = readFileSync(SKILL_PATH, 'utf8');
  assert.match(md, /Protect the original first/);
  assert.match(md, /backup/i);
});

test('it never sends an agent at a library the machine blocks', () => {
  // ThreatLocker (and MDM generally) refuses to load third-party COMPILED
  // extensions on a managed laptop, so python-docx and python-pptx (lxml) and
  // pandas (numpy) fail at import no matter how cleanly they install. The
  // recipes here are stdlib + pure-Python only.
  const md = readFileSync(SKILL_PATH, 'utf8');
  assert.match(md, /Do not reach for `python-docx`, `python-pptx` or `pandas`/);
  assert.match(md, /errno=1/, 'the agent cannot recognise the failure it will hit');
  for (const stdlib of ['zipfile', 'xml.etree']) {
    assert.ok(md.includes(stdlib), `no ${stdlib} route for Word and PowerPoint`);
  }
});

test('it carries the formula warning, which is the one silent wrong answer', () => {
  // Verified against openpyxl 3.1.5: write =SUM(...), read it back with
  // data_only=True, get None. Excel recalculates on open, so the human sees a
  // number and the agent sees an empty cell.
  const md = readFileSync(SKILL_PATH, 'utf8');
  assert.match(md, /data_only=True/);
  assert.match(md, /None/);
});
