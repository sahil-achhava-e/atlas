'use strict';

// Skills the human writes for the crew live in ~/Atlas/skills — beside the
// workspaces, so deleting a workspace does not delete them. Claude Code never
// looks there: it reads ~/.claude/skills and the working directory's own
// .claude/skills, and an agent's working directory is its project. So a skill
// meant for the whole floor has to be copied where every agent reads, and kept
// in step when the human edits it.
//
// The rule that makes that safe: we only ever touch a copy we made. A skill the
// human installed themselves is left alone, even when the name collides.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { planSkillSync, syncAtlasSkills, atlasSkillsDir, ATLAS_SKILL_MARKER } =
  loadTs('src/main/skills.ts');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-skills-'));
}

/** A skill folder with a SKILL.md, as the scanner requires. */
function writeSkill(root, name, body = 'hello') {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\n---\n\n${body}\n`);
  return dir;
}

test('a new skill is installed, and a source that went away is removed', () => {
  const plan = planSkillSync(['bug-fix', 'pr-review'], [
    { name: 'pr-review', ours: true },
    { name: 'retired', ours: true }
  ]);
  assert.deepEqual(plan.install, ['bug-fix', 'pr-review']); // new + refresh
  assert.deepEqual(plan.remove, ['retired']);
  assert.deepEqual(plan.skipped, []);
});

test("a skill we did not install is never touched, even on a name collision", () => {
  const plan = planSkillSync(['azure-devops'], [{ name: 'azure-devops', ours: false }]);
  assert.deepEqual(plan.install, []);
  assert.deepEqual(plan.skipped, ['azure-devops']);
  assert.deepEqual(plan.remove, [], 'someone else\'s skill is not ours to delete');
});

test('an unmarked skill with no source is left alone', () => {
  // Everything in ~/.claude/skills that we did not put there stays there.
  const plan = planSkillSync([], [{ name: 'their-own', ours: false }]);
  assert.deepEqual(plan, { install: [], remove: [], skipped: [] });
});

test('syncing copies the skill and marks the copy', () => {
  const src = tmp();
  const dest = tmp();
  writeSkill(src, 'bug-fix', 'reproduce first');

  const plan = syncAtlasSkills(src, dest);
  assert.deepEqual(plan.install, ['bug-fix']);
  const installed = path.join(dest, 'bug-fix');
  assert.match(fs.readFileSync(path.join(installed, 'SKILL.md'), 'utf8'), /reproduce first/);
  assert.equal(fs.readFileSync(path.join(installed, ATLAS_SKILL_MARKER), 'utf8'),
    path.join(src, 'bug-fix'), 'the marker names where it came from');
});

test('editing the source updates the copy, and a deleted file disappears', () => {
  const src = tmp();
  const dest = tmp();
  writeSkill(src, 'bug-fix', 'first draft');
  fs.writeFileSync(path.join(src, 'bug-fix', 'extra.md'), 'scratch');
  syncAtlasSkills(src, dest);
  assert.ok(fs.existsSync(path.join(dest, 'bug-fix', 'extra.md')));

  writeSkill(src, 'bug-fix', 'second draft');
  fs.rmSync(path.join(src, 'bug-fix', 'extra.md'));
  syncAtlasSkills(src, dest);

  assert.match(fs.readFileSync(path.join(dest, 'bug-fix', 'SKILL.md'), 'utf8'), /second draft/);
  assert.equal(fs.existsSync(path.join(dest, 'bug-fix', 'extra.md')), false,
    'a file the human deleted must not survive in the copy');
});

test('deleting the source removes the installed copy', () => {
  const src = tmp();
  const dest = tmp();
  writeSkill(src, 'bug-fix');
  syncAtlasSkills(src, dest);
  fs.rmSync(path.join(src, 'bug-fix'), { recursive: true });

  const plan = syncAtlasSkills(src, dest);
  assert.deepEqual(plan.remove, ['bug-fix']);
  assert.equal(fs.existsSync(path.join(dest, 'bug-fix')), false);
});

test("a hand-installed skill of the same name survives a sync", () => {
  const src = tmp();
  const dest = tmp();
  writeSkill(src, 'azure-devops', 'ours');
  writeSkill(dest, 'azure-devops', 'THEIRS — do not clobber'); // no marker

  const plan = syncAtlasSkills(src, dest);
  assert.deepEqual(plan.skipped, ['azure-devops']);
  assert.match(fs.readFileSync(path.join(dest, 'azure-devops', 'SKILL.md'), 'utf8'), /THEIRS/);
});

test('a folder without a SKILL.md is not a skill', () => {
  const src = tmp();
  const dest = tmp();
  fs.mkdirSync(path.join(src, 'notes'));
  fs.writeFileSync(path.join(src, 'notes', 'README.md'), 'just notes');
  assert.deepEqual(syncAtlasSkills(src, dest).install, []);
});

test('no source directory at all is a no-op, not a crash', () => {
  const dest = tmp();
  const plan = syncAtlasSkills(path.join(tmp(), 'nope'), dest);
  assert.deepEqual(plan, { install: [], remove: [], skipped: [] });
});

test('skills live beside the workspaces, not inside one', () => {
  // Deleting a workspace takes its whole folder now. A skill kept inside one
  // would go with it.
  assert.equal(atlasSkillsDir('/Users/x'), '/Users/x/Atlas/skills');
});
