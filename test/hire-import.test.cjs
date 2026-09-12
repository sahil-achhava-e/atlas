'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const loadTs = require('./load-ts.cjs');

const { readHireManifestFiles } = loadTs('src/main/hire.ts');

const manifest = (name) => ({ spec: 'munder-difflin/hire@1', name });

test('batch import keeps every valid manifest and reports invalid files independently', () => {
  const dir = mkdtempSync(join(tmpdir(), 'munder-hire-import-'));
  try {
    const jim = join(dir, '01-jim.json');
    const brokenJson = join(dir, '02-broken.json');
    const invalidManifest = join(dir, '03-missing-name.json');
    const pam = join(dir, '04-pam.json');
    writeFileSync(jim, JSON.stringify(manifest('Jim')));
    writeFileSync(brokenJson, '{ definitely not json');
    writeFileSync(invalidManifest, JSON.stringify({ spec: 'munder-difflin/hire@1' }));
    writeFileSync(pam, JSON.stringify(manifest('Pam')));

    const result = readHireManifestFiles([jim, brokenJson, invalidManifest, pam]);

    assert.deepEqual(result.manifests.map((m) => m.name), ['Jim', 'Pam']);
    assert.equal(result.errors.length, 2);
    assert.match(result.errors[0], /02-broken\.json/);
    assert.match(result.errors[1], /03-missing-name\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty file selection is a valid empty batch', () => {
  assert.deepEqual(readHireManifestFiles([]), { manifests: [], errors: [] });
});

test('batch errors identify the file without exposing its parent directory', () => {
  const path = join(tmpdir(), 'private-project-name', 'missing-hire.json');
  const result = readHireManifestFiles([path]);
  assert.equal(result.manifests.length, 0);
  assert.match(result.errors[0], /missing-hire\.json/);
  assert.doesNotMatch(result.errors[0], /private-project-name/);
});

test('Electron picker and IPC validate the full selection rather than file zero', () => {
  const source = readFileSync('src/main/index.ts', 'utf8');
  const start = source.indexOf("ipcMain.handle('hire:openFile'");
  const end = source.indexOf('\n/**', start);
  const handler = source.slice(start, end);
  assert.ok(start >= 0 && end > start, 'hire import IPC handler is present');
  assert.match(handler, /properties:\s*\['openFile', 'multiSelections'\]/);
  assert.match(handler, /readHireManifestFiles\(res\.filePaths\)/);
  assert.doesNotMatch(handler, /res\.filePaths\[0\]/);
});

test('renderer wiring appends every cold-start and runtime arrival', () => {
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8');
  assert.match(app, /enqueuePendingHires\(\[m\]\)/);
  assert.match(app, /enqueuePendingHires\(queued\)/);
  assert.doesNotMatch(app, /queued\[queued\.length\s*-\s*1\]/);
});

test('closing a hire review clears the remaining batch', () => {
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8');
  assert.match(app, /const closeAddAgentReview = \(\) => \{[\s\S]*?clearPendingHires\(\);[\s\S]*?setAddAgentOpen\(false\);[\s\S]*?\}/);
  assert.match(app, /<AddAgentModal[\s\S]*?onClose=\{closeAddAgentReview\}/);
});

test('review UI exposes progress and an explicit skip without auto-spawn', () => {
  const modal = readFileSync('src/renderer/src/components/AddAgentModal.tsx', 'utf8');
  assert.match(modal, /hireQueueProgress\(hireQueue\)/);
  assert.match(modal, /addAgent\.skipHire/, 'the review has no explicit skip');
  assert.match(modal, /finishPendingHire\(\)/);

  // The import itself moved out of the modal: a manifest now arrives by deep
  // link or file and is queued in App, which opens the modal for review. The
  // property that matters is unchanged — arriving is never spawning.
  const app = readFileSync('src/renderer/src/App.tsx', 'utf8');
  const start = app.indexOf('const unsub = window.cth.onHireImport');
  const end = app.indexOf('}, [enqueuePendingHires, setAddAgentOpen]);', start);
  assert.ok(start >= 0 && end > start, 'the hire intake effect is gone');
  const intake = app.slice(start, end);
  assert.match(intake, /enqueuePendingHires\(/, 'an arriving hire is not queued for review');
  assert.match(intake, /setAddAgentOpen\(true\)/, 'an arriving hire does not open the review');
  assert.doesNotMatch(intake, /spawnPty/, 'an arriving hire spawns without review');
});

test('batch token caps persist atomically before review advances', () => {
  const modal = readFileSync('src/renderer/src/components/AddAgentModal.tsx', 'utf8');
  const start = modal.indexOf('const submit = async');
  const end = modal.indexOf('\n  return (', start);
  const submitFlow = modal.slice(start, end);
  const persistCap = submitFlow.indexOf('await window.cth.setAgentTokenCap');
  const advance = submitFlow.indexOf('advanceHireReview()');

  assert.ok(persistCap >= 0, 'submit must use the atomic single-agent config IPC');
  assert.ok(advance > persistCap, 'the current cap must persist before the batch advances');
  assert.match(submitFlow.slice(persistCap, advance), /onConfigChange\?\.\(updated\)/,
    'the latest config must be returned to App before the next review');
  assert.doesNotMatch(submitFlow, /agentTokenCaps:\s*\{\s*\.\.\.\(config\.agentTokenCaps/,
    'renderer must never replace the cap map from a stale config snapshot');
});

test('a cap is written through the atomic IPC, never by rewriting the map', () => {
  // The Command Center no longer OFFERS a per-agent cap — that control was
  // removed from the agent row — but it still reads one to draw the meter, and
  // an imported hire can still carry one. Whoever writes it must use the
  // per-agent IPC: updateConfig({ agentTokenCaps }) would rewrite the whole map
  // and drop every other agent's cap.
  const panel = readFileSync('src/renderer/src/components/CommandCenterPanel.tsx', 'utf8');
  assert.match(panel, /agentTokenCaps\[a\.id\]/, 'the meter no longer reads a cap');
  assert.doesNotMatch(panel, /window\.cth\.setAgentTokenCap\(/, 'the Command Center is setting caps again');

  const addAgent = readFileSync('src/renderer/src/components/AddAgentModal.tsx', 'utf8');
  assert.match(addAgent, /window\.cth\.setAgentTokenCap\(/, 'a hire can no longer carry a cap');
  assert.doesNotMatch(addAgent, /updateConfig\(\{\s*agentTokenCaps/, 'a hire rewrites the whole cap map');
});
