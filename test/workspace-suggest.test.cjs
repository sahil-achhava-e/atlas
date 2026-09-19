'use strict';

// New workspaces live under one root, one folder each. Two things have to hold:
// the suggested name is never one already in use (opening that would silently
// reuse a crew instead of starting one), and a typed name stays INSIDE the root.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { suggestWorkspaceName, workspacePath, cleanWorkspaceName, WORKSPACE_ROOT } =
  loadTs('src/shared/workspaceName.ts');

test('the first one is agents-workspace', () => {
  assert.equal(suggestWorkspaceName([]), 'agents-workspace');
  assert.equal(suggestWorkspaceName(['/Users/me/work', '/Users/me/Atlas/spike']), 'agents-workspace');
});

test('a taken name steps to the next free number, filling gaps', () => {
  const a = '/Users/me/Atlas/agents-workspace';
  assert.equal(suggestWorkspaceName([a]), 'agents-workspace-2');
  assert.equal(suggestWorkspaceName([a, `${a}-2`]), 'agents-workspace-3');
  assert.equal(suggestWorkspaceName([a, `${a}-3`]), 'agents-workspace-2');
});

test('a trailing slash is still the same folder', () => {
  assert.equal(suggestWorkspaceName(['/Users/me/Atlas/agents-workspace/']), 'agents-workspace-2');
});

test('a name is a folder in the root, never a path out of it', () => {
  assert.equal(workspacePath('billing'), `${WORKSPACE_ROOT}/billing`);
  assert.equal(workspacePath('../escape'), `${WORKSPACE_ROOT}/escape`);
  assert.equal(workspacePath('a/b'), `${WORKSPACE_ROOT}/a-b`);
  assert.equal(workspacePath('  spaced out  '), `${WORKSPACE_ROOT}/spaced out`);
  assert.equal(cleanWorkspaceName('..'), '');
});

// The name is prefilled from the projects, because "agents" tells you nothing
// once there are three workspaces and the folder is how you will recognise one.

const { workspaceNameFromProjects } = loadTs('src/shared/workspaceName.ts');

test('one project names the workspace after itself', () => {
  assert.equal(workspaceNameFromProjects(['/Users/me/Desktop/epicxp-events']), 'epicxp-events-workspace');
  assert.equal(workspaceNameFromProjects(['/Users/me/code/api/']), 'api-workspace');
});

test('several projects in one folder are named after that folder', () => {
  assert.equal(
    workspaceNameFromProjects(['/Users/me/clients/acme/api', '/Users/me/clients/acme/web']),
    'acme-workspace'
  );
});

test('several projects are never named after whichever came first', () => {
  // The first one added is not more important than the others, and a crew
  // called `api` that also works on `web` reads as a mistake.
  for (const projects of [
    ['/Users/me/Desktop/api', '/Users/me/Desktop/web'],   // a folder everyone uses
    ['/Users/me/api', '/Users/me/web'],                   // the home directory
    ['/Users/me/code/api', '/Users/me/code/web'],         // a generic parent
    ['/Users/me/a/api', '/Users/me/b/web']                // nothing in common
  ]) {
    assert.equal(workspaceNameFromProjects(projects), 'agents-workspace', projects.join(' + '));
  }
});

test('no projects means the plain suggestion', () => {
  assert.equal(workspaceNameFromProjects([]), 'agents-workspace');
  assert.equal(workspaceNameFromProjects([], ['/Users/me/Atlas/agents-workspace']), 'agents-workspace-2');
});

test('a name already in use steps to the next free one', () => {
  assert.equal(
    workspaceNameFromProjects(['/Users/me/code/api'], ['/Users/me/Atlas/api-workspace']),
    'api-workspace-2'
  );
});

test('a project already called something-workspace does not get it twice', () => {
  assert.equal(workspaceNameFromProjects(['/Users/me/code/billing-workspace']), 'billing-workspace');
});
