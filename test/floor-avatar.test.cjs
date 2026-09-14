'use strict';

// EVERY HIRED AGENT LOOKED LIKE ATLAS.
//
// The Add agent picker offers Atlas plus the thirty faces in the avatar
// library, and the picker drew all thirty-one correctly, because it paints
// through portraitArt — which resolves a cast recipe, then a LIBRARY recipe,
// then generates a face from whatever string it is handed.
//
// The floor did not. It gated the sprite on `theme.cast.byName`, which is the
// fifteen-strong Office cast only, and sent anything missing to
// `defaultCharacter` — 'michael', the boss's own face. A library id is never a
// key in that map, so every agent hired with a library face walked to its desk
// as Atlas. The picker said Neo; the floor said Atlas; and the floor is the
// main view.
//
// These tests hold the two halves together: the picker's vocabulary is WIDER
// than the cast (which is why a cast-keyed gate is wrong), and the floor no
// longer applies one.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const castSrc = read('src/renderer/src/scene/office/cast.ts');
const librarySrc = read('src/renderer/src/scene/office/avatarLibrary.ts');
const floorSrc = read('src/renderer/src/scene/office/OfficeFloor.tsx');

/** The cast keys, from the OFFICE_CAST literal. */
const castNames = [...castSrc.matchAll(/\{\s*name:\s*'([a-z0-9_-]+)'/g)].map((m) => m[1]);
/** The library ids, from the AVATAR_LIBRARY literal. */
const libraryIds = [...librarySrc.matchAll(/\{\s*id:\s*'([a-z0-9_-]+)'/g)].map((m) => m[1]);

test('the picker offers faces the cast does not contain', () => {
  // The cast was fifteen borrowed characters; it is Atlas alone now, and every
  // other face a person can pick comes from the library. The gap this file
  // guards got WIDER, not narrower.
  assert.equal(castNames.length, 1, `the cast should be Atlas alone, got ${castNames.length}`);
  assert.ok(libraryIds.length >= 20, `expected the avatar library, got ${libraryIds.length}`);
  const outsiders = libraryIds.filter((id) => !castNames.includes(id));
  // If this ever hits zero the two vocabularies have merged and the rest of
  // this file is describing a bug that can no longer happen — but until then,
  // every one of these is a face a cast-keyed lookup would silently replace.
  assert.equal(outsiders.length, libraryIds.length,
    'library ids are supposed to be a separate vocabulary from the cast keys');
});

test('the floor draws the character it was given, not the cast default', () => {
  // The exact shape of the bug: consult the cast map, fall back when missing.
  assert.ok(!/byName\[agent\.character\]\s*\?\s*agent\.character\s*:/.test(floorSrc),
    'OfficeFloor gates the sprite on the cast map again — every library face will render as Atlas');
  // A non-empty character has to reach getFrames untouched.
  assert.match(floorSrc, /const charName = agent\.character\?\.trim\(\) \|\| theme\.cast\.defaultCharacter/,
    'OfficeFloor should fall back only when the character is missing');
});

test('the selection glow survives a face that is not in the cast', () => {
  // `byName[charName]` is undefined for a library or generated face, so reading
  // `.shirt` off it throws — which is what made the cast gate load-bearing and
  // would make any future fix look like it broke the floor.
  // Inside glowFor the same call is correct — it runs only when `member` is
  // present. What must not come back is the UNGUARDED read at the call site.
  assert.ok(!/accentNumber\(agent\.accent\) \?\? hexToNumber\(member\.shirt\)/.test(floorSrc),
    'the glow reads member.shirt directly, which is undefined for a library face');
  assert.match(floorSrc, /function glowFor\(/, 'the glow helper is gone');
  assert.match(floorSrc, /glowFor\(charName, member\)/,
    'the glow should go through the helper that handles a non-cast face');
});

test('a spawn from main keeps the character it asked for', () => {
  // The same bug through a different door: main hands the renderer a character
  // string verbatim, and the renderer used to narrow it to a cast key or fall
  // back to DEFAULT_CHARACTER — so a voice hire asking for a library face got
  // the boss's. castMember may canonicalise a display name; it may not filter.
  const hive = read('src/renderer/src/hooks/useHive.ts');
  assert.ok(!/castMember\(rec\.character\?\.trim\(\)\.toLowerCase\(\)\) \?\?/.test(hive),
    'useHive filters an explicit character through the cast again');
  assert.match(hive, /const asked = rec\.character\?\.trim\(\);/,
    'useHive should honour an explicit character as given');
});

test('every face the picker can offer has something to draw', () => {
  // A library entry with no recipe would fall through to the generated face —
  // drawable, but not the character whose name is on the tile.
  for (const id of libraryIds) {
    const entry = librarySrc.slice(librarySrc.indexOf(`id: '${id}'`));
    const upto = entry.slice(0, entry.indexOf('\n'));
    assert.match(upto, /recipe:\s*\{/, `library face ${id} has no recipe`);
  }
});
