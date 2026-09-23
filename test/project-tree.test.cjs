'use strict';

// A registered project is not always a repo. ~/Desktop/Acme-VMS is a folder
// holding three of them, and the hire dialog offered only the folder the human
// registered — so an agent meant for vms-backend could not be pointed at
// vms-backend, and git isolation had no repository to make a worktree from.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { listProjectTree } = loadTs('src/main/projects.ts');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'md-proj-')); }
function dir(...parts) { const p = path.join(...parts); fs.mkdirSync(p, { recursive: true }); return p; }
function repo(...parts) { const p = dir(...parts); fs.mkdirSync(path.join(p, '.git')); return p; }

test('a container folder lists itself and the repos inside it', () => {
  const root = tmp();
  const vms = dir(root, 'Acme-VMS');
  repo(vms, 'vms-backend');
  repo(vms, 'vms-frontend');
  repo(vms, 'visits-outlook-addin');

  const out = listProjectTree([vms]);
  assert.deepEqual(out.map((e) => e.name),
    ['Acme-VMS', 'visits-outlook-addin', 'vms-backend', 'vms-frontend']);
  assert.equal(out[0].isRepo, false, 'the container is not a repo');
  assert.equal(out[0].parent, undefined);
  for (const child of out.slice(1)) {
    assert.equal(child.isRepo, true);
    assert.equal(child.parent, vms, 'a child names the folder it was found in');
  }
});

test('the registered folder is always listed, repo or not', () => {
  // A lead sits at the container root on purpose: the API contract and the
  // cross-repo docs live there, and an engineer inside one repo cannot see them.
  const root = tmp();
  const plain = dir(root, 'just-a-folder');
  assert.deepEqual(listProjectTree([plain]).map((e) => e.name), ['just-a-folder']);
});

test('a registered repo with no repos inside is one entry', () => {
  const root = tmp();
  const only = repo(root, 'acme-events');
  dir(only, 'backend');       // a normal subdirectory, not a repo
  const out = listProjectTree([only]);
  assert.equal(out.length, 1);
  assert.equal(out[0].isRepo, true);
});

test('node_modules and dotfolders are never scanned', () => {
  const root = tmp();
  const proj = dir(root, 'p');
  repo(proj, 'node_modules');
  repo(proj, '.cache');
  repo(proj, 'real');
  assert.deepEqual(listProjectTree([proj]).map((e) => e.name), ['p', 'real']);
});

test('a worktree counts as a repo (.git is a file there, not a folder)', () => {
  const root = tmp();
  const proj = dir(root, 'p');
  const wt = dir(proj, 'worktree');
  fs.writeFileSync(path.join(wt, '.git'), 'gitdir: /somewhere/else');
  assert.deepEqual(listProjectTree([proj]).map((e) => e.name), ['p', 'worktree']);
});

test('only one level down — a repo nested deeper is not crawled to', () => {
  const root = tmp();
  const proj = dir(root, 'p');
  repo(proj, 'a', 'deep');
  assert.deepEqual(listProjectTree([proj]).map((e) => e.name), ['p']);
});

test('a folder listed twice, or listed after being found as a child, appears once', () => {
  const root = tmp();
  const vms = dir(root, 'vms');
  const backend = repo(vms, 'backend');
  const out = listProjectTree([vms, backend, vms]);
  assert.deepEqual(out.map((e) => e.name), ['vms', 'backend']);
});

test('a path that does not exist is skipped rather than listed', () => {
  assert.deepEqual(listProjectTree([path.join(tmp(), 'gone'), '']), []);
});

test('a trailing slash does not make a second entry', () => {
  const root = tmp();
  const proj = repo(root, 'p');
  assert.equal(listProjectTree([proj, `${proj}/`]).length, 1);
});
