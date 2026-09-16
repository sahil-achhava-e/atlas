'use strict';

/**
 * The audience question is asked in its own dialog and then decides the setup.
 * Two things must hold for that to be honest: the rail cannot count a screen
 * this audience never sees, and a non-technical setup must not offer a choice
 * that simple mode overrides straight afterwards.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { stepsFor, nextStep, prevStep } = loadTs('src/renderer/src/store/onboardingSteps.ts');

test('the persona question is not a step of either setup', () => {
  // It is the dialog that chooses between them, so counting it as "step 1 of 7"
  // made the rail describe a screen that decides the other six.
  for (const audience of ['technical', 'non-technical']) {
    assert.ok(!stepsFor(audience).includes('persona'), audience);
  }
});

test('a technical setup still walks every step it always did', () => {
  assert.deepEqual(stepsFor('technical'),
    ['welcome', 'orchestrator', 'repos', 'permissions', 'away', 'home']);
});

test('a non-technical setup is not asked about permissions', () => {
  // Simple mode runs with autonomy on and folds away the terminal a permission
  // prompt is answered in; asking here and overriding the answer would be a
  // screen that lies. finish() writes autoMode: true for this audience.
  const steps = stepsFor('non-technical');
  assert.ok(!steps.includes('permissions'));
  assert.deepEqual(steps, ['welcome', 'orchestrator', 'repos', 'away', 'home']);
});

test('home is last in both, so the folder is asked for once the rest is known', () => {
  for (const audience of ['technical', 'non-technical']) {
    assert.equal(stepsFor(audience).at(-1), 'home', audience);
  }
});

test('Continue walks the audience own list, skipping what it does not have', () => {
  const steps = stepsFor('non-technical');
  assert.equal(nextStep(steps, 'repos'), 'away', 'permissions is not in this setup');
  assert.equal(nextStep(stepsFor('technical'), 'repos'), 'permissions');
});

test('the last step hands over to the finish screen', () => {
  const steps = stepsFor('technical');
  assert.equal(nextStep(steps, 'home'), 'done');
});

test('Back stops at the first step instead of falling off the front', () => {
  const steps = stepsFor('non-technical');
  assert.equal(prevStep(steps, 'welcome'), 'welcome');
  assert.equal(prevStep(steps, 'away'), 'repos');
});

test('a step this audience does not have is not navigable', () => {
  // A hash left over from the other audience's setup, or a typed one.
  const steps = stepsFor('non-technical');
  assert.equal(nextStep(steps, 'permissions'), 'done');
  assert.equal(prevStep(steps, 'permissions'), 'welcome');
});
