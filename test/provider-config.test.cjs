'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const loadTs = require('./load-ts.cjs');

const {
  inferAgentProvider,
  isAgentProvider,
  providerPreset
} = loadTs('src/shared/agentProvider.ts');
const {
  buildSpawnCommand,
  decodeProviderModel,
  encodeProviderModel,
  modelProvidersForAgent,
  modelsForProvider,
  onboardingEngineChoices
} = loadTs('src/renderer/src/store/config.ts');

const autoConfig = { defaultCommand: 'claude', autoMode: true };

test('Kimi is a first-class inferred provider with autonomous defaults', () => {
  assert.equal(isAgentProvider('kimi'), true);
  assert.equal(inferAgentProvider('kimi --auto'), 'kimi');
  const preset = providerPreset('kimi');
  assert.equal(preset.defaultCommand, 'kimi');
  assert.equal(preset.autoFlag, '--auto');
  assert.equal(preset.supportsModel, true);
  assert.equal(preset.canReceiveInbox, false);
  assert.equal(preset.positionalInitialPrompt, undefined);
});

test('Gemini CLI has hooks, interactive seeding, resume, and current yolo mode', () => {
  assert.equal(isAgentProvider('gemini'), true);
  assert.equal(inferAgentProvider('/usr/local/bin/gemini --model pro'), 'gemini');
  const preset = providerPreset('gemini');
  assert.equal(preset.defaultCommand, 'gemini');
  assert.equal(preset.autoFlag, '--approval-mode=yolo');
  assert.equal(preset.supportsModel, true);
  assert.equal(preset.canReceiveInbox, true);
  assert.deepEqual(preset.bridge, { kind: 'hooks', shim: 'gemini' });
  assert.equal(preset.initialPromptFlag, '-i');
  assert.equal(preset.resumeFlag, '--resume');
  assert.equal(preset.installCommand, 'npm install -g @google/gemini-cli');
});

test('Grok is a first-class inferred provider with hooks, resume, and always-approve', () => {
  assert.equal(isAgentProvider('grok'), true);
  assert.equal(inferAgentProvider('/Users/test/.local/bin/grok --model grok-4.5'), 'grok');
  const preset = providerPreset('grok');
  assert.equal(preset.defaultCommand, 'grok');
  assert.equal(preset.autoFlag, '--permission-mode bypassPermissions');
  assert.equal(preset.supportsModel, true);
  assert.equal(preset.canReceiveInbox, true);
  assert.equal(preset.hookBridge, 'grok');
  assert.equal(preset.positionalInitialPrompt, true);
  assert.equal(preset.resumeFlag, '--resume');
});

test('provider commands use matching models and equivalent bypass modes', () => {
  assert.equal(
    buildSpawnCommand(autoConfig, 'claude-sonnet-5', 'claude'),
    'claude --model claude-sonnet-5 --permission-mode bypassPermissions'
  );
  assert.equal(
    buildSpawnCommand(autoConfig, 'gpt-5.6-sol', 'codex'),
    'codex --model gpt-5.6-sol -a never -s workspace-write'
  );
  assert.equal(
    buildSpawnCommand(autoConfig, 'grok-4.5', 'grok'),
    'grok --model grok-4.5 --permission-mode bypassPermissions'
  );
  assert.equal(
    buildSpawnCommand(autoConfig, 'kimi-code/k3', 'kimi'),
    'kimi --model kimi-code/k3 --auto'
  );
  assert.equal(
    buildSpawnCommand(autoConfig, 'pro', 'gemini'),
    'gemini --model pro --approval-mode=yolo'
  );
});

test('model picker options stay provider-specific', () => {
  assert.equal(
    modelsForProvider('claude').find((model) => model.id === 'claude-opus-5')?.label,
    'Opus 5 · 1M'
  );
  assert.deepEqual(
    modelsForProvider('codex').map((model) => model.id),
    [undefined, 'gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']
  );
  assert.deepEqual(
    modelsForProvider('grok').map((model) => model.id),
    [undefined, 'grok-4.6', 'grok-4.5']
  );
  assert.deepEqual(
    modelsForProvider('kimi').map((model) => model.id),
    [
      undefined,
      'kimi-code/k3',
      'kimi-code/kimi-for-coding',
      'kimi-code/kimi-for-coding-highspeed'
    ]
  );
  assert.deepEqual(
    modelsForProvider('gemini').map((model) => model.id),
    [undefined, 'auto', 'pro', 'flash', 'flash-lite']
  );
  assert.deepEqual(modelsForProvider('custom'), []);
});

test('Command Center model choices round-trip provider and model', () => {
  const encoded = encodeProviderModel('antigravity', 'Gemini 3.1 Pro (High)');
  assert.deepEqual(
    decodeProviderModel(encoded),
    { provider: 'antigravity', model: 'Gemini 3.1 Pro (High)' }
  );
  assert.deepEqual(
    decodeProviderModel(encodeProviderModel('kimi')),
    { provider: 'kimi', model: undefined }
  );
  assert.equal(decodeProviderModel('unknown:model'), null);
});

test('onboarding offers the engines it can install, and hides none of the rest', () => {
  // Issue #355 asked that inbox-less engines be SHOWN as disabled rather than
  // omitted, so "not offered" never reads as "not supported". That still holds.
  // What changed in d81e0c4: the selectable set is no longer every god-eligible
  // engine. Setup offers the ones a first run can actually get working —
  // grok, antigravity and qwen carry no installCommand and no docsUrl, so
  // picking one lands on "not installed" with nothing to click. Every engine is
  // still available per agent afterwards.
  const { eligible, workersOnly } = onboardingEngineChoices();
  assert.deepEqual(eligible.map((preset) => preset.id), ['claude', 'codex', 'gemini']);
  for (const preset of eligible) {
    assert.ok(preset.installCommand || preset.nativeInstallCommand || preset.docsUrl,
      `${preset.id} is offered at setup with no way to install it`);
  }
  // workersOnly is empty because all three offered engines can orchestrate.
  // #355's point — that omitting an engine reads as "not supported" — is now
  // carried by the step's own copy instead of by disabled rows: it says every
  // other agent can run a different engine. If that sentence ever goes, the
  // disabled rows have to come back.
  assert.deepEqual(workersOnly.map((preset) => preset.id), []);
  assert.ok(!eligible.concat(workersOnly).some((preset) => preset.id === 'custom'));

  const en = JSON.parse(readFileSync('src/renderer/src/i18n/locales/en.json', 'utf8'));
  assert.match(en.onboarding.orchestrator.desc ?? '', /every other agent|different one/i,
    'the engine step no longer says other engines are available per agent');
});

test('God only sees providers that can drain hive inbox messages', () => {
  // God-eligible = supportsModel && canReceiveInbox: kimi and copilot are
  // excluded (no inbox drain path), custom is excluded (no model picker).
  // Cursor is interactive (no -p) so it IS god-eligible.
  assert.deepEqual(
    modelProvidersForAgent(true).map((preset) => preset.id),
    ['claude', 'codex', 'grok', 'gemini', 'antigravity', 'qwen', 'opencode', 'crush', 'pi', 'cursor']
  );
  assert.deepEqual(
    modelProvidersForAgent(false).map((preset) => preset.id),
    ['claude', 'codex', 'grok', 'kimi', 'gemini', 'antigravity', 'qwen', 'opencode', 'crush', 'pi', 'copilot', 'cursor']
  );
});
