'use strict';

// Edit agent's "Save & restart" must restart the agent from any screen.
//
// The restart lived inside the Command Center's Floor tab and Edit agent asked
// for it with a window event, so pressed from the agent's own panel, focus mode
// or any other tab it saved the new model and restarted nothing. Seen
// 2026-09-24: ten agents saved on Sonnet 5, all still running Opus. The
// renderer's import graph cannot load under node:test, so these pin the wiring.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('Save & restart asks by event', () => {
  assert.match(read('src/renderer/src/components/EditAgentModal.tsx'),
    /dispatchEvent\(new CustomEvent\('cth:restart-agent'/);
});

test('the listener is installed by App, which is always mounted', () => {
  assert.match(read('src/renderer/src/App.tsx'), /useEffect\(\(\) => installRestartListener\(/);
  assert.match(read('src/renderer/src/components/restartAgent.ts'),
    /addEventListener\('cth:restart-agent', onRestart\)/);
});

test('no panel listens as well, so one press is one restart', () => {
  const panels = ['CommandCenterPanel.tsx', 'AgentDetailPanel.tsx', 'FullscreenTerminal.tsx', 'EditAgentModal.tsx'];
  for (const f of panels) {
    assert.doesNotMatch(read(`src/renderer/src/components/${f}`), /addEventListener\('cth:restart-agent'/, f);
  }
});

test('a failed restart is shown on the row, not only stored', () => {
  assert.match(read('src/renderer/src/components/CommandCenterPanel.tsx'),
    /restartErrors\[a\.id\] && \(/);
});

test('agent terminals keep 300 lines, not 100,000', () => {
  // Fifteen live terminals at 100,000 lines each stalled the page (2026-09-24).
  assert.match(read('src/renderer/src/components/terminalPool.ts'), /scrollback: 300,/);
});

test('Edit agent offers a restart when the RUNNING model differs, not only the saved one', () => {
  // Saved as Sonnet without a restart, still on Opus: the saved model already
  // matched the pick, so the dialog only offered Save (2026-09-24, Naruto).
  const modal = read('src/renderer/src/components/EditAgentModal.tsx');
  assert.match(modal, /ptys\.find\(\(p\) => p\.id === agent\.ptyId\)\?\.model/);
  assert.match(modal, /\(model \?\? ''\) !== \(runningModel \?\? agent\.model \?\? ''\)/);
  const pty = read('src/main/pty.ts');
  assert.match(pty, /model: modelArg\(opts\.args\)/);
  assert.match(pty, /model: s\.model/);
});

test('modelArg reads the value after --model', () => {
  const src = read('src/main/pty.ts');
  const body = src.slice(src.indexOf('export function modelArg'), src.indexOf('export function buildCmdCommandLine'));
  const js = require('typescript').transpileModule(body, { compilerOptions: { module: 1 } }).outputText;
  const m = { exports: {} }; new Function('module', 'exports', js)(m, m.exports);
  const { modelArg } = m.exports;
  assert.equal(modelArg(['--model', 'claude-sonnet-5', '--permission-mode', 'x']), 'claude-sonnet-5');
  assert.equal(modelArg(['--resume', 'abc']), undefined);
  assert.equal(modelArg(undefined), undefined);
});
