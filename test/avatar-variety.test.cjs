'use strict';

/**
 * THIRTY FACES THAT WERE TEN FACES.
 *
 * The first avatar library was borrowed from film and television, and the names
 * carried all the difference while the drawing carried none. Nine of the last
 * ten were tan-skinned, eight had black hair, nine had a beard or a moustache —
 * four were literally `skin: tan, hairc: BLACK, beard: BLACK` with a different
 * shirt. At 18px wide, that is one face with four labels, and the complaint that
 * started this was exactly "they all look the same, big beard and all".
 *
 * A picker is only useful if you can tell its options apart, so the set has a
 * budget now and this is what holds it. Parsed from the source, because the
 * library is a literal and there is nothing to run.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const SRC = readFileSync(
  join(__dirname, '..', 'src/renderer/src/scene/office/avatarLibrary.ts'), 'utf8');
const BODY = SRC.slice(SRC.indexOf('AVATAR_LIBRARY: LibraryFace[] = ['));

const FACES = [...BODY.matchAll(/\{ id: '([^']+)', name: '([^']+)', recipe: \{(.*?)\} \},/g)]
  .map(([, id, name, recipe]) => ({ id, name, recipe }));

const has = (f, re) => re.test(f.recipe);
const share = (n) => n / FACES.length;
const count = (pred) => FACES.filter(pred).length;

test('the library is thirty faces with unique ids and names', () => {
  assert.equal(FACES.length, 30, `expected thirty faces, parsed ${FACES.length}`);
  assert.equal(new Set(FACES.map((f) => f.id)).size, 30, 'duplicate id');
  assert.equal(new Set(FACES.map((f) => f.name)).size, 30, 'duplicate name');
});

test('no skin tone takes more than a third of the set', () => {
  const tones = {};
  for (const f of FACES) {
    const m = /skin: '(\w+)'/.exec(f.recipe);
    assert.ok(m, `${f.name} has no skin`);
    tones[m[1]] = (tones[m[1]] ?? 0) + 1;
  }
  assert.equal(Object.keys(tones).length, 4, `all four tones should appear, got ${Object.keys(tones)}`);
  for (const [tone, n] of Object.entries(tones)) {
    assert.ok(share(n) <= 0.34, `${tone} is ${n}/30 of the set (${Math.round(share(n) * 100)}%)`);
  }
});

test('facial hair is a quarter of the set at most', () => {
  const n = count((f) => has(f, /beard:|facial: '/));
  assert.ok(share(n) <= 0.25, `${n}/30 faces have facial hair — that was the original complaint`);
});

test('no hairstyle takes more than a third of the set', () => {
  const styles = {};
  for (const f of FACES) {
    const m = /hair: '(\w+)'/.exec(f.recipe);
    assert.ok(m, `${f.name} has no hair style`);
    styles[m[1]] = (styles[m[1]] ?? 0) + 1;
  }
  for (const [style, n] of Object.entries(styles)) {
    assert.ok(share(n) <= 0.34, `${style} is ${n}/30 of the set`);
  }
});

test('roughly half the set is recognised by something worn on the head', () => {
  const n = count((f) => has(f, /helmet:|faceMask:|headwear:|facePaint:/));
  assert.ok(n >= 8 && n <= 18, `${n}/30 wear something — too few and the set flattens, too many and it is all costume`);
});

test('no two UNCOVERED faces share skin, hair colour, hair style and facial hair', () => {
  // The exact shape of the old bug: four entries identical on every axis that
  // reads at this size, distinguished only by a shirt colour and a name.
  //
  // Faces under a helmet, a mask or paint are excluded, and that is not a
  // loophole: those cover the hair and most of the skin, so the covering IS the
  // silhouette and what is underneath cannot be seen to clash. They get their
  // own check below.
  const seen = new Map();
  for (const f of FACES.filter((x) => !has(x, /helmet:|faceMask:|facePaint:/))) {
    const key = [
      /skin: '(\w+)'/.exec(f.recipe)[1],
      /hairc: ([A-Z]+|\[[^\]]+\])/.exec(f.recipe)?.[1] ?? '?',
      /hair: '(\w+)'/.exec(f.recipe)[1],
      /beard:/.test(f.recipe) ? 'beard' : (/facial: '(\w+)'/.exec(f.recipe)?.[1] ?? '-'),
    ].join('/');
    assert.ok(!seen.has(key), `${f.name} and ${seen.get(key)} are the same face: ${key}`);
    seen.set(key, f.name);
  }
});

test('every covered face is covered in its own colour', () => {
  // A helmet hides the person, so two helmets of the same colour are two
  // identical agents however different the recipes under them are.
  const covers = FACES
    .map((f) => ({ name: f.name, c: /(?:helmet|faceMask|facePaint): \{ (?:c|skin): (\[[^\]]+\])/.exec(f.recipe)?.[1] }))
    .filter((x) => x.c);
  assert.ok(covers.length >= 4, `expected several covered faces, found ${covers.length}`);
  const seen = new Map();
  for (const { name, c } of covers) {
    assert.ok(!seen.has(c), `${name} and ${seen.get(c)} wear the same colour: ${c}`);
    seen.set(c, name);
  }
});

test('nothing is named after a character from a film or a show', () => {
  // The set is birds, stars, minerals and trees on purpose. This is a tripwire
  // for the next person adding a face, not a complete list of fiction.
  const borrowed = [
    'vader', 'neo', 'joker', 'deadpool', 'gandalf', 'geralt', 'jinx', 'eleven',
    'hopper', 'wednesday', 'morpheus', 'trooper', 'indiana', 'sparrow', 'tommy',
    'professor', 'baahubali', 'krrish', 'gabbar', 'mogambo', 'khilji', 'sardar',
  ];
  for (const f of FACES) {
    assert.ok(!borrowed.includes(f.name.toLowerCase()), `${f.name} is borrowed`);
  }
});
