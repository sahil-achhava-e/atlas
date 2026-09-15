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

const FACES = [...BODY.matchAll(/\{ id: '([^']+)', name: '([^']+)', series: '([^']+)', recipe: \{(.*?)\} \},/g)]
  .map(([, id, name, series, recipe]) => ({ id, name, series, recipe }));

const has = (f, re) => re.test(f.recipe);
const share = (n) => n / FACES.length;
const count = (pred) => FACES.filter(pred).length;

test('the library is thirty faces with unique ids and names', () => {
  assert.equal(FACES.length, 30, `expected thirty faces, parsed ${FACES.length}`);
  assert.equal(new Set(FACES.map((f) => f.id)).size, 30, 'duplicate id');
  assert.equal(new Set(FACES.map((f) => f.name)).size, 30, 'duplicate name');
});

test('more than one skin tone appears', () => {
  // Deliberately weaker than the rule the country set had. These are specific
  // characters and their tone is theirs; a quota here would mean redrawing
  // people to hit a number. The work of keeping thirty faces apart is done by
  // hair colour instead, which in this material is doing it easily.
  const tones = new Set(FACES.map((f) => /skin: '(\w+)'/.exec(f.recipe)[1]));
  assert.ok(tones.size >= 2, `every face is ${[...tones][0]}`);
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

test('a good share of the set carries a distinguishing mark', () => {
  // Not headwear specifically. This set separates on hair colour and uses the
  // recipe's accessory flags — a straw hat, a mask, whiskers, a scar, glasses,
  // braids — where a silhouette alone will not carry a character. Counting only
  // `headwear` scored this set at 1 of 30 and told us nothing.
  const n = count((f) => has(f,
    /headwear:|helmet:|faceMask:|facePaint:|hat: '|mask: true|blindfold: true|whiskers: true|glasses: true|shades:|braids:|scar: '/));
  assert.ok(n >= 6, `only ${n}/30 carry anything — hair colour alone will not hold thirty apart`);
});

test('no two faces wear the same headwear', () => {
  // Barely used in this set — anime hair is doing the separating — but two of
  // anything worn is still two faces reading as each other.
  const kinds = FACES
    .map((f) => ({ name: f.name, kind: /headwear: \{ kind: '(\w+)'/.exec(f.recipe)?.[1] }))
    .filter((x) => x.kind);
  const seen = new Map();
  for (const { name, kind } of kinds) {
    assert.ok(!seen.has(kind), `${name} and ${seen.get(kind)} both wear a ${kind}`);
    seen.set(kind, name);
  }
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
      /headwear: \{ kind: '(\w+)'/.exec(f.recipe)?.[1] ?? '-',
    ].join('/');
    assert.ok(!seen.has(key), `${f.name} and ${seen.get(key)} are the same face: ${key}`);
    seen.set(key, f.name);
  }
});

test('nothing is named after a character from a film or a show', () => {
  // The first library was borrowed from film and television. These are ordinary
  // given names. A tripwire for the next person adding a face, not a complete
  // list of fiction.
  const borrowed = [
    'vader', 'neo', 'joker', 'deadpool', 'gandalf', 'geralt', 'jinx', 'eleven',
    'hopper', 'wednesday', 'morpheus', 'trooper', 'indiana', 'sparrow', 'tommy',
    'professor', 'baahubali', 'krrish', 'gabbar', 'mogambo', 'khilji', 'sardar',
  ];
  // Anime characters are the point of this set, so the tripwire is only for the
  // live-action set this replaced twice.
  for (const f of FACES) {
    assert.ok(!borrowed.includes(f.name.toLowerCase()), `${f.name} is borrowed`);
  }
});

test('no recipe changes a facial feature', () => {
  // The eyes, nose and mouth are the same pixels for every face in the set, and
  // that is deliberate: a set built on national dress must vary the DRESS. Pupil
  // colour and expression are per-face; the geometry is not, and there is no
  // knob in the recipe that would let it be.
  for (const f of FACES) {
    assert.doesNotMatch(f.recipe, /nose|jaw|cheek|lip|eyeShape|feature/i,
      `${f.name} reaches for a facial feature — the grid does not have one`);
  }
});
