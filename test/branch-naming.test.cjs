'use strict';

/**
 * Branch names. Two things create branches on this floor and only one of them
 * is work:
 *
 *   - the harness, when it provisions an agent's worktree. That branch exists
 *     before any card does, so it cannot be named after the work. It is the
 *     agent's parking spot.
 *   - the agent, per card. Named after the work.
 *
 * The parking branch used to be `agent/<id>`, which sat in the branch list
 * beside real branches and got copied as if it were the convention.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { addWorktree } = loadTs('src/main/git.ts');

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-branch-'));
  const run = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 'test@example.com');
  run('config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# repo\n');
  run('add', '.'); run('commit', '-qm', 'first');
  return dir;
}
const branchOf = (wt) =>
  execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: wt, encoding: 'utf8' }).trim();

test('a worktree parks on atlas/home/<name>, not on the agent id', async () => {
  const dir = repo();
  const wt = path.join(dir, '..', `wt-${Date.now()}`);
  const res = await addWorktree(dir, wt, 'main', 'Sasuke');
  assert.equal(res.ok, true, res.error);
  assert.equal(branchOf(wt), 'atlas/home/sasuke');
});

test('no name given falls back to the worktree folder, still under atlas/home', async () => {
  const dir = repo();
  const wt = path.join(dir, '..', `sasuke-mua8z2co-${Date.now()}`);
  assert.equal((await addWorktree(dir, wt, 'main')).ok, true);
  assert.match(branchOf(wt), /^atlas\/home\/sasuke-mua8z2co-\d+$/);
});

test('a second agent with the same name still gets a worktree', async () => {
  // Two Sasukes, or one remade after a crash. The home branch is taken, and a
  // worktree that fails to provision is an agent with nowhere to work.
  const dir = repo();
  const a = path.join(dir, '..', `same-a-${Date.now()}`);
  const b = path.join(dir, '..', `same-b-${Date.now()}`);
  assert.equal((await addWorktree(dir, a, 'main', 'Sasuke')).ok, true);
  assert.equal((await addWorktree(dir, b, 'main', 'Sasuke')).ok, true);
  assert.equal(branchOf(a), 'atlas/home/sasuke');
  assert.notEqual(branchOf(b), 'atlas/home/sasuke');
});

test('nothing in the app still makes an agent/<id> branch', () => {
  const git = fs.readFileSync(path.join(__dirname, '..', 'src/main/git.ts'), 'utf8');
  assert.doesNotMatch(git, /`agent\/\$\{/, 'the old parking-branch name is gone');
  assert.match(git, /atlas\/home\//);
});

test('every agent is told to name the branch after the work', () => {
  const hive = fs.readFileSync(path.join(__dirname, '..', 'src/main/hive.ts'), 'utf8');
  const line = hive.slice(hive.indexOf('const branchLine ='));
  const body = line.slice(0, line.indexOf("\n    //"));
  assert.match(body, /BRANCHES ARE NAMED AFTER THE WORK, NEVER AFTER YOU/);
  assert.match(body, /feature\/<short-title>/);
  assert.match(body, /git fetch origin && git checkout -b feature/);
  assert.match(body, /never from your local copy of that branch/);
  assert.match(body, /atlas\/home\/<you>/, 'and told what the parking branch is, so it is not copied');
  assert.match(body, /`branch` field/, 'the card records where the work is');
  // And it reaches every agent, not just leads.
  assert.match(hive, /\n      laneLine,\n      branchLine,/);
});

test('PROTOCOL.md says the same thing, for every user', () => {
  const hive = fs.readFileSync(path.join(__dirname, '..', 'src/main/hive.ts'), 'utf8');
  const proto = hive.slice(hive.indexOf('const protocolMd ='));
  assert.match(proto, /\| \\`branch\\` \| \\`feature\/<short-title>\\`/);
  assert.match(proto, /cuts \\`feature\/<short-title>\\` from the freshly fetched integration branch/);
  assert.match(proto, /never the worktree's own \\`atlas\/home\/<name>\\`/);
});
