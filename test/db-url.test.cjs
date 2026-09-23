'use strict';

// A saved connection shows itself back so it can be checked — with the one part
// that is a secret, and only that part, masked.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { maskDbUrl } = loadTs('src/shared/dbUrl.ts');

test('the password goes, everything you need to verify stays', () => {
  assert.equal(
    maskDbUrl('postgresql://vms_ro:hunter2@localhost:5432/acme_visits'),
    'postgresql://vms_ro:•••@localhost:5432/acme_visits'
  );
});

test('no password means no mask — it must not imply one is there', () => {
  assert.equal(maskDbUrl('postgresql://localhost:5432/visits'), 'postgresql://localhost:5432/visits');
  assert.equal(maskDbUrl('postgresql://vms_ro@localhost/visits'), 'postgresql://vms_ro@localhost/visits');
});

test('an @ or a colon later in the string is not credentials', () => {
  // A query string can carry either, and masking one would corrupt what is shown.
  assert.equal(
    maskDbUrl('postgresql://u:p@host:5432/db?options=-c%20search_path=a:b'),
    'postgresql://u:•••@host:5432/db?options=-c%20search_path=a:b'
  );
});

test('other schemes work the same, and rubbish is returned unchanged', () => {
  assert.equal(maskDbUrl('mysql://root:toor@127.0.0.1:3306/app'), 'mysql://root:•••@127.0.0.1:3306/app');
  assert.equal(maskDbUrl('not a url'), 'not a url');
  assert.equal(maskDbUrl(''), '');
  assert.equal(maskDbUrl(undefined), '');
});
