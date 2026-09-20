'use strict';

// What the crew can read about its own settings. Two things matter: the file
// exists and is current, and it never carries a secret — an agent asking "which
// databases are there" must get labels, never connection strings.

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

const withHive = () => {
  const home = mkdtempSync(join(tmpdir(), 'hive-'));
  mkdirSync(join(home, 'hive'), { recursive: true });
  return { home, hive: new HiveManager(() => home, () => true) };
};

const ENV = {
  autoMode: true,
  orchestratorMaySpawn: false,
  maxConcurrentWorkers: 4,
  defaultModel: 'claude-sonnet-5',
  projects: ['/r/api', '/r/web'],
  mcpEnabled: ['git', 'db'],
  databases: [{ label: 'epicxp_venue', project: 'epicxp-events' }],
  skills: [{ name: 'azure-devops' }, { name: 'create-migration', project: 'epicxp-events' }],
  semanticMemory: true,
  knowledgeGraph: false,
  missions: [{ id: 'ops-standup', enabled: true }]
};

test('the settings land where the crew is told to look', () => {
  const { home, hive } = withHive();
  hive.writeEnvironment(ENV);
  const path = join(home, 'hive', 'environment.json');
  assert.ok(existsSync(path), 'hive/environment.json is the documented path');
  const read = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(read.defaultModel, 'claude-sonnet-5');
  assert.deepEqual(read.skills,
    [{ name: 'azure-devops' }, { name: 'create-migration', project: 'epicxp-events' }]);
  // A skill with a project lives in that repo's .claude/skills and only an agent
  // working there can invoke it. Listed flat, a lead planned around a migration
  // skill that belonged to the other project.
  assert.equal(read.skills[0].project, undefined, 'a machine-wide skill names no project');
  assert.deepEqual(read.databases, [{ label: 'epicxp_venue', project: 'epicxp-events' }]);
});

test('it is stamped, so a stale read is detectable', () => {
  const { home, hive } = withHive();
  hive.writeEnvironment(ENV);
  const read = JSON.parse(readFileSync(join(home, 'hive', 'environment.json'), 'utf8'));
  assert.ok(typeof read.ts === 'number' && read.ts > 0);
});

test('a rewrite replaces it rather than accumulating', () => {
  const { home, hive } = withHive();
  hive.writeEnvironment(ENV);
  hive.writeEnvironment({ ...ENV, autoMode: false, skills: [] });
  const read = JSON.parse(readFileSync(join(home, 'hive', 'environment.json'), 'utf8'));
  assert.equal(read.autoMode, false);
  assert.deepEqual(read.skills, []);
});

test('no hive, no file — and no throw', () => {
  const hive = new HiveManager(() => null, () => true);
  assert.doesNotThrow(() => hive.writeEnvironment(ENV));
});
