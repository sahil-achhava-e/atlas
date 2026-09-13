'use strict';
/**
 * The Atlas mark — the source of truth for every raster in build/ and docs/.
 *
 * The mark is the one in the app's own header (AtlasMark.tsx), drawn here as
 * geometry rather than JSX: Atlas carried the sky, this app runs a floor of
 * agents that carry work, so the mark is a sphere held on two shoulders which
 * also reads as the letter A. One agent orbits it, because the thing that makes
 * Atlas Atlas is that it is never working alone.
 *
 * PURE GEOMETRY, NO DEPENDENCIES. Every shape here is a rounded rect, a
 * polygon of straight edges, or a circle, so the rasteriser is a signed
 * distance field plus point-in-polygon at 8x supersampling — no canvas, no
 * native module, nothing ThreatLocker can refuse to load. The SVG and the PNGs
 * come from the SAME numbers, so they cannot drift.
 *
 * TWO FRAMINGS, because they are hung in different places:
 *   mark — full bleed, corner radius 10/32, exactly the proportion of the
 *          in-app header logo. Favicons, the site, the Windows .ico.
 *   icon — macOS. The art is inset to 824/1024 with Apple's 0.2237 corner
 *          ratio, which is the Big Sur tile every other icon in the Dock is
 *          drawn to. The margin is what the drop shadow lives in; a full-bleed
 *          macOS icon looks a size larger than its neighbours.
 *
 * Writes, from one source:
 *   docs/logo.svg             source of truth (full bleed)
 *   docs/logo.png         512 site header, README
 *   docs/favicon-32.png    32 native-size favicon
 *   docs/apple-touch-icon.png 180
 *   build/icon.svg       1024 design source for the app icon (margined)
 *   build/icon.png       1024 Linux, and the electron-builder base
 *   build/icon.ico            Windows, full bleed, 16..256
 *   build/icon.icns           macOS, margined + drop shadow, 16..1024
 *
 *   node tools/make-logo.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

// ── the mark, in the 32-unit space AtlasMark.tsx is drawn in ──────────────
// Violet to a deeper indigo: --cth-lilac and --cth-lilac-hover as the light
// theme resolves them, so the icon in the Dock is the mark in the header.
const VIOLET = [0x5B, 0x3D, 0xF5];
const INDIGO = [0x4A, 0x2F, 0xD8];
const WHITE  = [0xFF, 0xFF, 0xFF];

const U = 32;                       // the mark's own coordinate space
const MARK_RADIUS = 10 / U;         // rx=10 on a 32 box — the header logo's curve
const APPLE_RADIUS = 0.2237;        // Big Sur's corner ratio, of the tile side
const APPLE_INSET = 100 / 1024;     // Apple's margin: 824 of art on 1024 canvas

/** The shoulders, carrying — the same path string as AtlasMark, as points.
 *  Every segment is straight, which is why point-in-polygon is exact here. */
const SHOULDERS = [
  [9, 24.2], [13.2, 15.4], [18.8, 15.4], [23, 24.2],
  [19.6, 24.2], [18.6, 22], [13.4, 22], [12.4, 24.2]
];
const WEIGHT = { cx: 16, cy: 10.2, r: 3.6, a: 1 };      // the sphere it holds
const ORBIT  = { cx: 24.4, cy: 7.6, r: 1.7, a: 0.55 };  // one agent, in orbit
const SHOULDER_ALPHA = 0.95;
// The light that makes the tile an object rather than a swatch. Fractions of
// the tile, matching the radialGradient in AtlasMark.
const SHEEN = { cx: 0.3, cy: 0.16, r: 0.9, a: 0.28 };

/** Where the tile sits inside an N-canvas, per framing. */
function layout(N, frame) {
  const inset = frame === 'icon' ? N * APPLE_INSET : 0;
  const w = N - inset * 2;
  return { x: inset, y: inset, w, h: w, r: w * (frame === 'icon' ? APPLE_RADIUS : MARK_RADIUS) };
}

const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

// ── PNG ───────────────────────────────────────────────────────────────────
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(N, rgba) {
  const stride = N * 4 + 1;
  const raw = Buffer.alloc(N * stride);
  for (let y = 0; y < N; y++) {
    raw[y * stride] = 0;                                       // filter: none
    rgba.copy(raw, y * stride + 1, y * N * 4, (y + 1) * N * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; ihdr[9] = 6;                                    // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** Signed distance to a rounded rect — negative inside. */
function sdRoundRect(px, py, x, y, w, h, r) {
  const cx = x + w / 2, cy = y + h / 2;
  const qx = Math.abs(px - cx) - (w / 2 - r), qy = Math.abs(py - cy) - (h / 2 - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}


// ── SVG ───────────────────────────────────────────────────────────────────
function buildSvg(N, frame) {
  const L = layout(N, frame);
  const k = L.w / U;                       // mark units -> canvas units
  const P = (x, y) => `${(L.x + x * k).toFixed(2)},${(L.y + y * k).toFixed(2)}`;
  const poly = SHOULDERS.map(([x, y]) => P(x, y)).join(' ');
  const circle = (c) =>
    `<circle cx="${(L.x + c.cx * k).toFixed(2)}" cy="${(L.y + c.cy * k).toFixed(2)}" ` +
    `r="${(c.r * k).toFixed(2)}" fill="#FFFFFF"${c.a < 1 ? ` fill-opacity="${c.a}"` : ''}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" viewBox="0 0 ${N} ${N}">
  <!-- Atlas — the brand mark, and the source of truth for every raster in
       build/ and docs/. Generated by tools/make-logo.cjs; edit that, not this.
       The same geometry as the app's own header logo (AtlasMark.tsx). -->
  <title>Atlas</title>
  <defs>
    <linearGradient id="bg" x1="${L.x}" y1="${L.y}" x2="${L.x + L.w}" y2="${L.y + L.h}" gradientUnits="userSpaceOnUse">
      <stop stop-color="${hex(VIOLET)}"/><stop offset="1" stop-color="${hex(INDIGO)}"/>
    </linearGradient>
    <radialGradient id="sheen" cx="${SHEEN.cx}" cy="${SHEEN.cy}" r="${SHEEN.r}">
      <stop stop-color="#FFFFFF" stop-opacity="${SHEEN.a}"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="${L.r.toFixed(2)}" fill="url(#bg)"/>
  <rect x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="${L.r.toFixed(2)}" fill="url(#sheen)"/>
  <polygon points="${poly}" fill="#FFFFFF" fill-opacity="${SHOULDER_ALPHA}"/>
  ${circle(WEIGHT)}
  ${circle(ORBIT)}
</svg>
`;
}

/** Signed distance to a rounded rect — negative inside. */
function sdRoundRect(px, py, x, y, w, h, r) {
  const cx = x + w / 2, cy = y + h / 2;
  const qx = Math.abs(px - cx) - (w / 2 - r), qy = Math.abs(py - cy) - (h / 2 - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Crossing-number test. Exact for these shapes: every edge is straight. */
function inPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const over = (dst, src, a) => [0, 1, 2].map((i) => dst[i] * (1 - a) + src[i] * a);

/**
 * The tile is an analytic rounded rect, so its drop shadow is the SAME shape
 * offset down — no convolution, just a soft falloff on the distance field.
 */
function rasterise(N, frame) {
  const L = layout(N, frame);
  const k = L.w / U;
  const at = (x, y) => [L.x + x * k, L.y + y * k];
  const shadow = frame === 'icon' ? { dy: N * 0.020, blur: N * 0.030, a: 0.30 } : null;
  // Small icons get more samples: at 16px a quarter-pixel step is the whole
  // difference between a curve and a staircase.
  const SS = N <= 64 ? 8 : 4;

  const [wx, wy] = at(WEIGHT.cx, WEIGHT.cy);
  const [ox, oy] = at(ORBIT.cx, ORBIT.cy);
  const poly = SHOULDERS.map(([x, y]) => at(x, y));
  const sheenC = [L.x + SHEEN.cx * L.w, L.y + SHEEN.cy * L.h], sheenR = SHEEN.r * L.w;

  const out = Buffer.alloc(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let cov = 0, rSum = 0, gSum = 0, bSum = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
          if (sdRoundRect(px, py, L.x, L.y, L.w, L.h, L.r) > 0) continue;
          cov++;
          // the ground: violet to indigo down the diagonal
          const t = Math.min(1, Math.max(0, ((px - L.x) + (py - L.y)) / (L.w + L.h)));
          let c = [0, 1, 2].map((i) => VIOLET[i] + (INDIGO[i] - VIOLET[i]) * t);
          // the sheen
          const sd = Math.hypot(px - sheenC[0], py - sheenC[1]);
          c = over(c, WHITE, SHEEN.a * Math.min(1, Math.max(0, 1 - sd / sheenR)));
          // the shoulders, the weight, the one in orbit
          if (inPolygon(px, py, poly)) c = over(c, WHITE, SHOULDER_ALPHA);
          if (Math.hypot(px - wx, py - wy) <= WEIGHT.r * k) c = over(c, WHITE, WEIGHT.a);
          if (Math.hypot(px - ox, py - oy) <= ORBIT.r * k) c = over(c, WHITE, ORBIT.a);
          rSum += c[0]; gSum += c[1]; bSum += c[2];
        }
      }
      const tileA = cov / (SS * SS);
      let sa = 0;
      if (shadow) {
        const d = sdRoundRect(x + 0.5, y + 0.5 - shadow.dy, L.x, L.y, L.w, L.h, L.r);
        sa = Math.min(1, Math.max(0, 0.5 - d / shadow.blur)) * shadow.a;
      }
      if (!tileA && !sa) continue;
      const outA = tileA + sa * (1 - tileA);
      const wT = tileA / outA;                  // shadow is pure black, so it
      const i = (y * N + x) * 4;                // contributes no colour
      if (cov) {
        out[i] = Math.round((rSum / cov) * wT);
        out[i + 1] = Math.round((gSum / cov) * wT);
        out[i + 2] = Math.round((bSum / cov) * wT);
      }
      out[i + 3] = Math.round(outA * 255);
    }
  }
  return encodePng(N, out);
}

// ── ICO ───────────────────────────────────────────────────────────────────
/** ICO container of PNG entries (Vista+). 256px is encoded as width byte 0. */
function buildIco(pngs) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(pngs.length, 4);
  let offset = 6 + pngs.length * 16;
  const entries = [], bodies = [];
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; e[3] = 0;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
    entries.push(e); bodies.push(data);
    offset += data.length;
  }
  return Buffer.concat([dir, ...entries, ...bodies]);
}

// ── run ───────────────────────────────────────────────────────────────────
const D = (p) => path.join(ROOT, p);
const wrote = [];
const write = (rel, buf) => {
  fs.writeFileSync(D(rel), buf);
  wrote.push(`${rel.padEnd(28)} ${(buf.length / 1024).toFixed(1)} KB`);
};

write('docs/logo.svg', Buffer.from(buildSvg(1024, 'mark')));
write('docs/logo.png', rasterise(512, 'mark'));
write('docs/favicon-32.png', rasterise(32, 'mark'));
write('docs/apple-touch-icon.png', rasterise(180, 'mark'));

write('build/icon.svg', Buffer.from(buildSvg(1024, 'icon')));
write('build/icon.png', rasterise(1024, 'icon'));
write('build/icon.ico', buildIco([16, 32, 48, 64, 128, 256].map((size) => ({
  size, data: rasterise(size, 'mark')
}))));

// macOS .icns via iconutil, from the margined + shadowed iconset.
const setDir = D('build/icon.iconset');
fs.rmSync(setDir, { recursive: true, force: true });
fs.mkdirSync(setDir, { recursive: true });
for (const [name, size] of [
  ['icon_16x16', 16], ['icon_16x16@2x', 32], ['icon_32x32', 32], ['icon_32x32@2x', 64],
  ['icon_128x128', 128], ['icon_128x128@2x', 256], ['icon_256x256', 256],
  ['icon_256x256@2x', 512], ['icon_512x512', 512], ['icon_512x512@2x', 1024]
]) {
  fs.writeFileSync(path.join(setDir, `${name}.png`), rasterise(size, 'icon'));
}
execFileSync('iconutil', ['-c', 'icns', setDir, '-o', D('build/icon.icns')]);
fs.rmSync(setDir, { recursive: true, force: true });
wrote.push(`build/icon.icns              ${(fs.statSync(D('build/icon.icns')).size / 1024).toFixed(1)} KB`);

console.log(wrote.join('\n'));
