'use strict';

// Repainting the office is an exact colour swap on the tileset pixels.
//
// Two things must hold. 'original' must swap nothing — it is the way back, and a
// palette that quietly altered a pixel would make "revert" a lie. And every
// source colour a palette names must actually EXIST in the tilesets: a swap keyed
// on a colour that is not there is not an error anywhere, it is a setting that
// silently does nothing, which is the worst kind of theme.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const loadTs = require('./load-ts.cjs');

const { TILE_PALETTES, DEFAULT_PALETTE, resolvePalette, paletteIsNoop, swapTable, applySwap } =
  loadTs('src/renderer/src/scene/office/tilePalette.ts');

const TILESETS = path.join(__dirname, '..', 'src/renderer/src/assets/tilesets');

/** Minimal 8-bit RGBA PNG reader: IHDR + inflated IDAT + per-scanline unfilter.
 *  Enough for these tilesets, and it keeps the test dependency-free. */
function readPng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, width = 0, height = 0, depth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  assert.equal(depth, 8, `${path.basename(file)}: expected 8-bit`);
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = Buffer.alloc(width * height * ch);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { width, height, ch, data: out };
}

const colourSet = (() => {
  const seen = new Set();
  for (const f of ['office-tileset.png', 'a5-office-floors-walls.png', 'interiors.png']) {
    const png = readPng(path.join(TILESETS, f));
    for (let i = 0; i < png.data.length; i += png.ch) {
      if (png.ch === 4 && png.data[i + 3] === 0) continue;
      seen.add('#' + [0, 1, 2].map((k) => png.data[i + k].toString(16).padStart(2, '0')).join(''));
    }
  }
  return seen;
})();

test("'original' is first and swaps nothing", () => {
  assert.equal(TILE_PALETTES[0].id, 'original');
  assert.equal(DEFAULT_PALETTE.id, 'original');
  assert.ok(paletteIsNoop(DEFAULT_PALETTE));
  assert.equal(DEFAULT_PALETTE.background, null);
  assert.equal(swapTable(DEFAULT_PALETTE).size, 0);
});

test('an unknown or missing id falls back to the original art', () => {
  for (const bad of ['nope', '', null, undefined, 'NIGHT']) {
    assert.equal(resolvePalette(bad).id, 'original');
  }
  assert.equal(resolvePalette('night').id, 'night');
});

test('every colour a palette repaints actually exists in the tilesets', () => {
  for (const p of TILE_PALETTES.slice(1)) {
    assert.ok(!paletteIsNoop(p), `${p.id} swaps nothing`);
    assert.equal(typeof p.background, 'number', `${p.id} must repaint the canvas too`);
    for (const from of Object.keys(p.swap)) {
      assert.ok(colourSet.has(from.toLowerCase()),
        `${p.id} repaints ${from}, which is in no tileset — the setting would do nothing`);
    }
  }
});

test('the swap rewrites named colours and leaves everything else alone', () => {
  const table = swapTable(resolvePalette('night'));
  // floor light (swapped), an invented colour (kept), and a transparent pixel.
  const px = new Uint8ClampedArray([
    0x92, 0xa8, 0x97, 255,
    0x12, 0x34, 0x56, 255,
    0x92, 0xa8, 0x97, 0
  ]);
  const changed = applySwap(px, table);
  assert.equal(changed, 1, 'only the opaque floor pixel should change');
  assert.deepEqual([...px.slice(0, 3)], [0x2f, 0x35, 0x40], 'floor repainted');
  assert.deepEqual([...px.slice(4, 7)], [0x12, 0x34, 0x56], 'unnamed colour untouched');
  assert.deepEqual([...px.slice(8, 11)], [0x92, 0xa8, 0x97], 'transparent pixel untouched');
});

test('an empty table is a no-op, so the original costs nothing', () => {
  const px = new Uint8ClampedArray([0x92, 0xa8, 0x97, 255]);
  assert.equal(applySwap(px, swapTable(DEFAULT_PALETTE)), 0);
  assert.deepEqual([...px.slice(0, 3)], [0x92, 0xa8, 0x97]);
});
