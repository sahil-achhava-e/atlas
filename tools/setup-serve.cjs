#!/usr/bin/env node
'use strict';
/**
 * Install for a machine that will only ever run browser mode.
 *
 * `ATLAS_SERVE_ONLY=1 npm ci` would do it, but setting an environment variable
 * inline is not the same command on Windows as on macOS, and this has to be one
 * instruction a colleague can paste on either. Node sets it for the child and
 * the difference disappears — no cross-env dependency for one variable.
 */
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const res = spawnSync(npm, ['ci'], {
  cwd: join(__dirname, '..'),
  stdio: 'inherit',
  env: { ...process.env, ATLAS_SERVE_ONLY: '1' }
});
if (res.error) { console.error(res.error.message); process.exit(1); }
process.exit(res.status ?? 1);
