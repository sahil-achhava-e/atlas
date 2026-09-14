// Procedural portraits.
//
// Fully custom-drawn busts, not recoloured sprite sheets: a face is an explicit
// recipe layering skin → clothing → face → facial hair → hairstyle → headwear on
// an 18×28 canvas, which gives real control over silhouette rather than a tint
// over someone else's art. The in-scene walking sprite is composed from the same
// recipe with legs added, so an agent on the floor matches its card exactly.
//
// Three sources, in order (see the resolver at the foot of this file): Atlas's
// own recipe below, the thirty in avatarLibrary.ts, and a face generated from
// whatever string it was handed — so an agent always has a portrait, whatever
// it is called.

import type { OfficeCharacterName } from './cast';
import { LIBRARY_BY_ID } from './avatarLibrary';

export const PORTRAIT_W = 18;
export const PORTRAIT_H = 28;
// In-scene walking sprite: same width + upper body as the portrait, taller to add legs.
export const SCENE_W = 18;
export const SCENE_H = 32;
const OUTLINE: RGB = [38, 34, 46];
const HX0 = 4, HX1 = 13; // head skin columns

export type RGB = [number, number, number];
type Buf = Uint8ClampedArray;

// Current canvas dims — set per compose() so the same drawing primitives serve
// both the 18×28 portrait and the 18×32 scene sprite. (Rendering is synchronous.)
let CUR_W = PORTRAIT_W, CUR_H = PORTRAIT_H;

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
function shades(rgb: RGB, dl = 1.22, dd = 0.68): [RGB, RGB, RGB] {
  return [
    [clamp(rgb[0] * dl), clamp(rgb[1] * dl), clamp(rgb[2] * dl)],
    [rgb[0], rgb[1], rgb[2]],
    [clamp(rgb[0] * dd), clamp(rgb[1] * dd), clamp(rgb[2] * dd)],
  ];
}

function set(buf: Buf, x: number, y: number, c: RGB, a = 255): void {
  if (x < 0 || x >= CUR_W || y < 0 || y >= CUR_H) return;
  const i = (y * CUR_W + x) * 4;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = a;
}
function alphaAt(buf: Buf, x: number, y: number): number {
  if (x < 0 || x >= CUR_W || y < 0 || y >= CUR_H) return 0;
  return buf[(y * CUR_W + x) * 4 + 3];
}
function rgbAt(buf: Buf, x: number, y: number): RGB {
  const i = (y * CUR_W + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2]];
}
function eq(a: RGB, b: RGB): boolean { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }
function rect(buf: Buf, x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(buf, x, y, c);
}

// ─── palettes ────────────────────────────────────────────────────────────────
interface SkinPal { hi: RGB; base: RGB; sh: RGB; line: RGB; }
const SKIN: Record<string, SkinPal> = {
  light: { hi: [255, 221, 189], base: [247, 201, 170], sh: [212, 158, 126], line: [168, 112, 82] },
  tan:   { hi: [232, 182, 136], base: [214, 162, 116], sh: [176, 126, 86],  line: [138, 92, 60] },
  brown: { hi: [180, 130, 94],  base: [158, 112, 78],  sh: [124, 86, 58],   line: [90, 60, 40] },
  dark:  { hi: [142, 98, 70],   base: [120, 80, 56],   sh: [94, 62, 42],    line: [64, 42, 28] },
};

// ─── head + face ─────────────────────────────────────────────────────────────
function drawHead(buf: Buf, skin: string): void {
  const s = SKIN[skin];
  for (let y = 4; y <= 16; y++) {
    for (let x = HX0; x <= HX1; x++) {
      if (((x === HX0 || x === HX1) && (y === 4 || y === 5 || y === 16)) || ((x === 5 || x === 12) && y === 4)) continue;
      set(buf, x, y, s.base);
    }
  }
  for (let y = 6; y < 12; y++) set(buf, 5, y, s.hi);
  set(buf, 6, 5, s.hi); set(buf, 7, 5, s.hi);
  for (let y = 6; y < 15; y++) set(buf, 12, y, s.sh);
  for (const x of [7, 8, 9, 10, 11]) set(buf, x, 16, s.sh);
  for (const ex of [HX0 - 1, HX1 + 1]) { set(buf, ex, 9, s.base); set(buf, ex, 10, s.base); set(buf, ex, 11, s.sh); }
  rect(buf, 7, 17, 10, 18, s.sh); rect(buf, 7, 17, 9, 17, s.base);
}

type Brow = 'flat' | 'angry' | 'raised' | 'soft';
type Mouth = 'neutral' | 'smile' | 'frown' | 'grin';
function drawFace(
  buf: Buf, skin: string, brow: Brow, mouth: Mouth, blush: boolean,
  lashes = false, eyes?: RGB
): void {
  const s = SKIN[skin];
  // The pupil is ONE pixel, which at 3x is a 3x3 block and the only part of the
  // face that can differ per character: everything else (eye position, nose,
  // mouth) is fixed by the 18x28 grid. So it is worth colouring.
  const white: RGB = [250, 248, 244], pup: RGB = eyes ?? [46, 38, 42];
  for (const [a, b, p] of [[5, 6, 6], [10, 11, 10]] as const) {
    set(buf, a, 9, white); set(buf, b, 9, white); set(buf, p, 9, pup);
  }
  // Feminine eyes: a dark upper lash line + an outer flick, and a bright glint
  // in each pupil so they read as bigger, rounder, more expressive.
  if (lashes) {
    const lash: RGB = [54, 40, 48], glint: RGB = [252, 250, 248];
    for (const x of [5, 6, 10, 11]) set(buf, x, 8, lash);
    set(buf, 4, 8, lash); set(buf, 12, 8, lash);
    set(buf, 5, 9, glint); set(buf, 10, 9, glint);
  }
  if (brow === 'flat') for (const x of [5, 6, 10, 11]) set(buf, x, 7, s.line);
  else if (brow === 'angry') { set(buf, 5, 8, s.line); set(buf, 6, 7, s.line); set(buf, 10, 7, s.line); set(buf, 11, 8, s.line); }
  else if (brow === 'raised') for (const x of [5, 6, 10, 11]) set(buf, x, 6, s.line);
  else if (brow === 'soft') { for (const x of [5, 11]) set(buf, x, 7, s.line); for (const x of [6, 10]) set(buf, x, 7, s.sh); }
  set(buf, 8, 11, s.sh); set(buf, 8, 12, s.sh); set(buf, 7, 12, s.sh);
  const mc: RGB = [158, 86, 80];
  const mouths: Record<Mouth, [number, number][]> = {
    neutral: [[7, 14], [8, 14], [9, 14], [10, 14]],
    smile: [[7, 14], [8, 14], [9, 14], [10, 14], [6, 13], [11, 13]],
    frown: [[7, 15], [8, 15], [9, 15], [10, 15], [6, 14], [11, 14]],
    grin: [[7, 14], [8, 14], [9, 14], [10, 14], [7, 13], [8, 13], [9, 13], [10, 13], [6, 13], [11, 13]],
  };
  for (const [x, y] of mouths[mouth]) set(buf, x, y, mc);
  if (blush) for (const x of [5, 12]) set(buf, x, 12, [235, 150, 140], 140);
}

// ─── hairstyles ──────────────────────────────────────────────────────────────
interface HairArgs { part?: 'L' | 'R'; recede?: number; length?: number; vol?: number; }
type HairFn = (buf: Buf, color: RGB, skinBase: RGB, a: HairArgs) => void;

const styleShort: HairFn = (buf, color, skinBase, a) => {
  const [hi, base, sh] = shades(color);
  const part = a.part ?? 'L', recede = a.recede ?? 0;
  rect(buf, HX0, 2, HX1, 4, base);
  for (let x = HX0 - 1; x <= HX1 + 1; x++) set(buf, x, 3, base);
  rect(buf, HX0 - 1, 4, HX1 + 1, 5, base);
  for (let y = 6; y < 9; y++) { set(buf, HX0 - 1, y, base); set(buf, HX0, y, base); set(buf, HX1, y, base); set(buf, HX1 + 1, y, base); }
  for (let x = HX0; x <= HX1; x++) set(buf, x, 5, base);
  if (recede) {
    for (let y = 3; y < 6; y++) for (let x = 6; x < 12; x++) if (eq(rgbAt(buf, x, y), base)) set(buf, x, y, skinBase);
    set(buf, 8, 5, base); // widow's peak
  }
  const hx = part === 'L' ? 6 : 11;
  for (let y = 2; y < 6; y++) set(buf, hx, y, sh);
  for (let x = HX0; x < hx; x++) if (alphaAt(buf, x, 3)) set(buf, x, 3, hi);
  for (let x = HX0; x <= HX1; x++) if (alphaAt(buf, x, 2)) set(buf, x, 2, hi);
};

const styleFloppy: HairFn = (buf, color) => {
  const [hi, base] = shades(color);
  rect(buf, HX0, 2, HX1, 4, base);
  for (let x = HX0 - 1; x <= HX1 + 1; x++) set(buf, x, 3, base);
  rect(buf, HX0 - 1, 4, HX1 + 1, 5, base);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 5, base);
  for (let x = 6; x <= 12; x++) set(buf, x, 6, base);
  set(buf, 9, 7, base); set(buf, 10, 7, base); set(buf, 11, 7, base);
  for (let y = 6; y < 9; y++) { set(buf, HX0 - 1, y, base); set(buf, HX0, y, base); set(buf, HX1, y, base); set(buf, HX1 + 1, y, base); }
  for (let x = HX0; x <= HX1; x++) if (alphaAt(buf, x, 2)) set(buf, x, 2, hi);
  for (const x of [7, 8, 9]) set(buf, x, 6, hi);
};

const styleFrame: HairFn = (buf, color, skinBase, a) => {
  const [hi, base, sh] = shades(color);
  const length = a.length ?? 17, vol = a.vol ?? 1;
  rect(buf, HX0 - 1, 2, HX1 + 1, 5, base);
  for (let x = HX0 - 1; x <= HX1 + 1; x++) set(buf, x, 3, base);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 5, base);
  for (let x = 6; x < 12; x++) set(buf, x, 6, base);
  set(buf, 8, 6, skinBase); set(buf, 9, 6, skinBase);
  for (let y = 6; y <= length; y++) {
    for (let dx = 0; dx < vol; dx++) { set(buf, HX0 - 1 - dx, y, base); set(buf, HX1 + 1 + dx, y, base); }
    set(buf, HX0, y, base); set(buf, HX1, y, base);
  }
  for (let x = HX0 - 1; x < HX0 + 1; x++) set(buf, x, length + 1, base);
  for (let x = HX1; x < HX1 + 2; x++) set(buf, x, length + 1, base);
  for (let y = 2; y < 6; y++) if (alphaAt(buf, HX1, y)) set(buf, HX1, y, sh);
  for (let x = HX0; x < 9; x++) if (alphaAt(buf, x, 2)) set(buf, x, 2, hi);
};

const styleBun: HairFn = (buf, color, skinBase) => {
  const [hi, base] = shades(color);
  rect(buf, HX0, 3, HX1, 5, base);
  for (let x = HX0 - 1; x <= HX1 + 1; x++) set(buf, x, 4, base);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 5, base);
  for (let x = 6; x < 12; x++) set(buf, x, 6, base);
  set(buf, 8, 6, skinBase); set(buf, 9, 6, skinBase);
  for (let y = 6; y < 9; y++) { set(buf, HX0, y, base); set(buf, HX1, y, base); }
  rect(buf, 7, 1, 10, 2, base);
  for (let x = HX0; x <= HX1; x++) if (alphaAt(buf, x, 3)) set(buf, x, 3, hi);
};

const styleCurly: HairFn = (buf, color, skinBase) => {
  const [hi, base] = shades(color);
  const pts: [number, number][] = [[4, 3], [5, 2], [6, 3], [7, 2], [8, 3], [9, 2], [10, 3], [11, 2], [12, 3], [13, 3],
    [3, 4], [4, 4], [13, 4], [14, 4], [3, 5], [4, 5], [13, 5], [14, 5], [3, 6], [13, 6], [4, 6], [12, 6], [3, 7], [13, 7], [4, 7]];
  rect(buf, HX0, 3, HX1, 5, base);
  for (let x = HX0 - 1; x <= HX1 + 1; x++) set(buf, x, 4, base);
  for (const [x, y] of pts) set(buf, x, y, base);
  for (let x = 6; x < 12; x++) set(buf, x, 6, base);
  set(buf, 8, 6, skinBase); set(buf, 9, 6, skinBase);
  for (const [x, y] of [[5, 2], [7, 2], [9, 2], [11, 2]] as const) set(buf, x, y, hi);
};

const styleMessy: HairFn = (buf, color, skinBase, a) => {
  const [hi, base] = shades(color);
  const length = a.length ?? 8;
  rect(buf, HX0 - 1, 2, HX1 + 1, 5, base);
  const spikes: [number, number][] = [[3, 2], [5, 1], [7, 2], [9, 1], [11, 2], [13, 1], [14, 2], [4, 2], [12, 2]];
  for (const [x, y] of spikes) set(buf, x, y, base);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 5, base);
  for (let x = 6; x < 12; x++) set(buf, x, 6, base);
  set(buf, 8, 6, skinBase); set(buf, 9, 6, skinBase);
  for (let y = 6; y <= length; y++) { set(buf, HX0 - 1, y, base); set(buf, HX0, y, base); set(buf, HX1, y, base); set(buf, HX1 + 1, y, base); }
  for (const [x, y] of spikes) set(buf, x, y, hi);
};

const styleRecede: HairFn = (buf, color, skinBase) => {
  const [, base, sh] = shades(color);
  for (let y = 4; y < 10; y++) { set(buf, HX0 - 1, y, base); set(buf, HX0, y, base); set(buf, HX1, y, base); set(buf, HX1 + 1, y, base); }
  for (let x = HX0; x <= HX1; x++) set(buf, x, 4, base);
  for (let x = HX0 + 1; x < HX1; x++) set(buf, x, 5, base);
  for (let y = 5; y < 9; y++) for (let x = 6; x < 12; x++) if (eq(rgbAt(buf, x, y), base)) set(buf, x, y, skinBase);
  for (let x = HX0; x <= HX1; x++) if (alphaAt(buf, x, 4)) set(buf, x, 4, sh);
};

const styleSpiky: HairFn = (buf, color, skinBase) => {
  const [hi, base] = shades(color);
  rect(buf, HX0, 3, HX1, 5, base);
  for (let x = HX0 - 1; x <= HX1 + 1; x++) set(buf, x, 4, base);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 5, base);
  const spikes: [number, number][] = [[5, 2], [7, 1], [9, 2], [11, 1], [6, 2], [8, 2], [10, 2], [12, 2]];
  for (const [x, y] of spikes) set(buf, x, y, base);
  for (let x = 6; x < 12; x++) set(buf, x, 6, base);
  set(buf, 8, 6, skinBase); set(buf, 9, 6, skinBase);
  for (let y = 6; y < 8; y++) { set(buf, HX0, y, base); set(buf, HX1, y, base); }
  for (const [x, y] of spikes) set(buf, x, y, hi);
};

// Bald: a rounded skin crown (with a sheen) and only a low horseshoe fringe of
// hair around the temples / back of the head.
const styleBald: HairFn = (buf, color, skinBase, a) => {
  const [shi, sbase, ssh] = shades(skinBase, 1.1, 0.82);
  // rounded skin dome above the forehead
  for (let x = 6; x <= 11; x++) set(buf, x, 2, sbase);
  for (let x = 5; x <= 12; x++) set(buf, x, 3, sbase);
  for (let x = HX0; x <= HX1; x++) set(buf, x, 4, sbase);
  // bald-head sheen + side falloff
  for (const x of [7, 8, 9]) set(buf, x, 2, shi);
  set(buf, 6, 3, shi); set(buf, 7, 3, shi);
  set(buf, 5, 3, ssh); set(buf, 12, 3, ssh); set(buf, HX1, 4, ssh);
  // low horseshoe hair fringe — sides only, leaving the crown bald.
  const [, base, sh] = shades(color);
  const top = a.recede ? 8 : 6; // recede:1 → only a thin fringe very low
  for (let y = top; y <= 10; y++) {
    set(buf, HX0 - 1, y, base); set(buf, HX0, y, base);
    set(buf, HX1, y, base); set(buf, HX1 + 1, y, base);
  }
  for (let y = top; y <= 10; y++) { set(buf, HX0 - 1, y, sh); set(buf, HX1 + 1, y, sh); }
};

/** Tall spikes standing well clear of the head. Every other style here hugs
 *  the skull, so this one owns the rows above it: the spikes ARE the
 *  silhouette, and at 18px wide that is the whole recognition. */
const styleTallSpikes: HairFn = (buf, color) => {
  const [hi, base, sh] = shades(color);
  // The cap the spikes grow out of.
  rect(buf, HX0, 3, HX1, 6, base);
  for (let x = HX0 - 1; x <= HX1 + 1; x++) set(buf, x, 4, base);
  for (let y = 5; y < 9; y++) {
    set(buf, HX0 - 1, y, base); set(buf, HX0, y, base);
    set(buf, HX1, y, base); set(buf, HX1 + 1, y, base);
  }
  // Only three rows exist above the head, so the mane earns its mass sideways:
  // the outer spikes overhang the skull the way the straw hat's brim does.
  // Gaps between spikes are left EMPTY on purpose. Fill them and the whole
  // thing collapses into a helmet, which is what the first attempt did.
  // x1 and x15 sit OUTSIDE the head (skin runs 4..13). Spikes there poke out at
  // the temples and read as horns at any size above 2x, which is what they did.
  // The mane keeps its width from the sideburns below instead.
  const spikes: [number, number][] = [[3, 2], [5, 0], [8, 0], [11, 0], [13, 2]];
  for (const [x, top] of spikes) {
    rect(buf, x, top, x + 1, 3, base);
    set(buf, x, top, hi);          // lit edge
    set(buf, x + 1, top, sh);      // and its shadowed side
  }
  // Sideburns down past the ear, which is what stops the overhang reading as a
  // hat sitting on top of the head.
  for (const y of [7, 8, 9]) { set(buf, 2, y, base); set(buf, 15, y, base); }
  set(buf, 2, 10, sh); set(buf, 15, 10, sh);
};

const HAIR_FNS = { styleShort, styleFloppy, styleFrame, styleBun, styleCurly, styleMessy, styleRecede, styleSpiky, styleTallSpikes, styleBald };
type HairStyle = keyof typeof HAIR_FNS;

// ─── facial hair ─────────────────────────────────────────────────────────────
type Facial = 'mustache' | 'mustacheSm' | 'stubble' | 'goatee';
function drawFacial(buf: Buf, kind: Facial, color: RGB): void {
  const [, base, sh] = shades(color);
  if (kind === 'mustache') {
    for (const x of [6, 7, 8, 9, 10]) set(buf, x, 13, base);
    set(buf, 6, 12, base); set(buf, 10, 12, base);
  } else if (kind === 'mustacheSm') {
    for (const x of [7, 8, 9]) set(buf, x, 13, base);
  } else if (kind === 'stubble') {
    for (const [x, y] of [[5, 14], [6, 15], [7, 15], [8, 15], [9, 15], [10, 15], [11, 14], [12, 13], [4, 13], [5, 15], [10, 15]] as const)
      set(buf, x, y, sh, 150);
  } else if (kind === 'goatee') {
    for (const x of [8, 9]) set(buf, x, 15, base);
    set(buf, 8, 14, base); set(buf, 9, 14, base);
    for (const x of [7, 8, 9, 10]) set(buf, x, 13, base);
  }
}

// ─── glasses ─────────────────────────────────────────────────────────────────
// Clear prescription glasses (NOT sunglasses): a thin rim that frames each eye
// without covering it. The lens interior keeps the eye/skin already drawn, plus
// a small white glint so the lens reads as transparent glass.
function drawGlasses(buf: Buf): void {
  const frame: RGB = [60, 54, 62];
  const glint: RGB = [236, 240, 246];
  // Left lens rim around the eye at (5-6, 9): top, bottom, outer + inner edge.
  for (const x of [5, 6]) { set(buf, x, 8, frame); set(buf, x, 10, frame); }
  set(buf, 4, 9, frame); set(buf, 7, 9, frame);
  set(buf, 4, 8, frame); set(buf, 7, 8, frame);
  // Right lens rim around the eye at (10-11, 9).
  for (const x of [10, 11]) { set(buf, x, 8, frame); set(buf, x, 10, frame); }
  set(buf, 9, 9, frame); set(buf, 12, 9, frame);
  set(buf, 9, 8, frame); set(buf, 12, 8, frame);
  // Bridge over the nose + temple arms out to the hair.
  set(buf, 8, 8, frame);
  set(buf, 3, 9, frame); set(buf, 13, 9, frame);
  // Glass glint on each rim's top-outer corner so the lens reads as clear glass.
  set(buf, 4, 8, glint); set(buf, 9, 8, glint);
}

// ─── clothing ────────────────────────────────────────────────────────────────
type Cloth = 'suit' | 'dressshirt' | 'polo' | 'blouse' | 'cardigan' | 'sweater';
function bodyShape(buf: Buf, col: RGB, heavy = false): void {
  const [, base, sh] = shades(col);
  const rows: [number, number, number][] = heavy
    ? [[19, 5, 12], [20, 3, 14], [21, 2, 15], [22, 1, 16], [23, 1, 16], [24, 0, 17], [25, 0, 17], [26, 0, 17], [27, 0, 17]]
    : [[19, 6, 11], [20, 4, 13], [21, 3, 14], [22, 2, 15], [23, 2, 15], [24, 1, 16], [25, 1, 16], [26, 1, 16], [27, 1, 16]];
  for (const [y, a, b] of rows) rect(buf, a, y, b, y, base);
  const [lo, hi] = heavy ? [1, 16] : [2, 15];
  for (let y = 22; y < 28; y++) { set(buf, lo, y, sh); set(buf, hi, y, sh); }
}
function drawClothing(buf: Buf, kind: Cloth, c1: RGB, c2: RGB | undefined, tie: RGB | undefined, skin: string, heavy = false): void {
  const [hi, base, sh] = shades(c1);
  bodyShape(buf, c1, heavy);
  if (kind === 'suit') {
    const white: RGB = [238, 238, 236];
    for (const [x, y] of [[8, 19], [9, 19], [7, 20], [8, 20], [9, 20], [10, 20], [8, 21], [9, 21]] as const) set(buf, x, y, white);
    for (const [x, y] of [[6, 20], [7, 21], [11, 20], [10, 21], [6, 21], [11, 21]] as const) set(buf, x, y, sh);
    if (tie) { for (let y = 20; y < 26; y++) { set(buf, 8, y, tie); set(buf, 9, y, tie); } set(buf, 8, 20, shades(tie)[0]); }
    else for (let y = 22; y < 26; y++) { set(buf, 8, y, white); set(buf, 9, y, white); }
  } else if (kind === 'dressshirt') {
    for (const [x, y] of [[6, 19], [7, 19], [10, 19], [11, 19], [7, 20], [10, 20]] as const) set(buf, x, y, sh);
    for (let y = 20; y < 27; y += 2) set(buf, 8, y, sh);
    if (tie) for (let y = 19; y < 26; y++) { set(buf, 8, y, tie); set(buf, 9, y, tie); }
  } else if (kind === 'polo') {
    for (const [x, y] of [[6, 19], [7, 19], [10, 19], [11, 19]] as const) set(buf, x, y, hi);
    set(buf, 8, 20, sh); set(buf, 8, 22, sh);
    const accent = c2 ? shades(c2)[1] : hi;
    for (const [x, y] of [[7, 20], [9, 20]] as const) set(buf, x, y, accent);
  } else if (kind === 'blouse') {
    const s = SKIN[skin];
    for (const [x, y] of [[7, 19], [8, 19], [9, 19], [10, 19], [8, 20], [9, 20]] as const) set(buf, x, y, s.sh);
    for (let x = 5; x < 13; x++) if (eq(rgbAt(buf, x, 20), base)) set(buf, x, 20, hi);
  } else if (kind === 'cardigan') {
    const inner: RGB = c2 ? shades(c2)[1] : [235, 233, 226];
    for (let y = 19; y < 27; y++) { set(buf, 8, y, inner); set(buf, 9, y, inner); }
    for (const [x, y] of [[6, 19], [7, 19], [10, 19], [11, 19]] as const) set(buf, x, y, sh);
  } else if (kind === 'sweater') {
    for (const [x, y] of [[6, 19], [7, 19], [8, 19], [9, 19], [10, 19], [11, 19]] as const) set(buf, x, y, sh);
  }
}
function collarNeck(buf: Buf, skin: string): void {
  rect(buf, 7, 18, 10, 19, SKIN[skin].sh);
}

// ─── scene body (full standing figure: torso + legs, front or back) ──────────
// Proportioned for standing (not the portrait bust): a narrower torso over real
// legs. Head (rows 2-16) sits above; this draws rows 18-31.
const SHOE: RGB = [44, 40, 48];

function drawSceneLegs(buf: Buf, pants: RGB, phase: number): void {
  const [, base, sh] = shades(pants);
  // two legs cols 5-7 / 10-12, gap at 8-9
  for (const [lx0, lx1] of [[5, 7], [10, 12]] as const) {
    rect(buf, lx0, 25, lx1, 30, base);
    for (let y = 25; y <= 30; y++) set(buf, lx1, y, sh); // inner shade
  }
  // feet — lift one foot per walk phase for a simple gait
  const leftLow = phase !== 1, rightLow = phase !== 2;
  rect(buf, 5, leftLow ? 31 : 30, 7, leftLow ? 31 : 30, SHOE);
  rect(buf, 10, rightLow ? 31 : 30, 12, rightLow ? 31 : 30, SHOE);
}

function drawSceneTorso(buf: Buf, r: Recipe, back: boolean): void {
  const [hi, base, sh] = shades(r.c1);
  // shoulders → torso, narrower than the portrait bust (wider + rounder if heavy)
  if (r.heavy) {
    rect(buf, 3, 18, 14, 18, base);
    rect(buf, 2, 19, 15, 19, base);
    rect(buf, 2, 20, 15, 24, base);
    for (let y = 20; y <= 24; y++) { set(buf, 2, y, sh); set(buf, 15, y, sh); set(buf, 14, y, sh); }
  } else {
    rect(buf, 4, 18, 13, 18, base);
    rect(buf, 3, 19, 14, 19, base);
    rect(buf, 4, 20, 13, 24, base);
    for (let y = 20; y <= 24; y++) { set(buf, 3, y, sh); set(buf, 14, y, sh); set(buf, 13, y, sh); } // arms / right shade
  }
  if (back) {
    // plain back with a collar line + center seam
    rect(buf, 6, 18, 11, 18, sh);
    for (let y = 19; y <= 24; y++) set(buf, 8, y, sh);
    return;
  }
  const skin = SKIN[r.skin];
  if (r.cloth === 'suit') {
    const white: RGB = [238, 238, 236];
    for (const [x, y] of [[8, 18], [9, 18], [7, 19], [8, 19], [9, 19], [10, 19], [8, 20], [9, 20]] as const) set(buf, x, y, white);
    for (const [x, y] of [[6, 19], [7, 20], [11, 19], [10, 20]] as const) set(buf, x, y, sh);
    if (r.tie) { for (let y = 19; y <= 24; y++) { set(buf, 8, y, r.tie); set(buf, 9, y, r.tie); } set(buf, 8, 19, shades(r.tie)[0]); }
  } else if (r.cloth === 'dressshirt') {
    for (const [x, y] of [[6, 18], [7, 18], [10, 18], [11, 18], [7, 19], [10, 19]] as const) set(buf, x, y, sh);
    if (r.tie) for (let y = 18; y <= 24; y++) { set(buf, 8, y, r.tie); set(buf, 9, y, r.tie); }
    else for (let y = 20; y <= 24; y += 2) set(buf, 8, y, sh);
  } else if (r.cloth === 'polo') {
    for (const [x, y] of [[6, 18], [7, 18], [10, 18], [11, 18]] as const) set(buf, x, y, hi);
    set(buf, 8, 19, sh); set(buf, 8, 21, sh);
  } else if (r.cloth === 'blouse') {
    for (const [x, y] of [[7, 18], [8, 18], [9, 18], [10, 18], [8, 19], [9, 19]] as const) set(buf, x, y, skin.sh);
    for (let x = 5; x < 13; x++) if (eq(rgbAt(buf, x, 19), base)) set(buf, x, 19, hi);
  } else if (r.cloth === 'cardigan') {
    const inner: RGB = r.c2 ? shades(r.c2)[1] : [235, 233, 226];
    for (let y = 18; y <= 24; y++) { set(buf, 8, y, inner); set(buf, 9, y, inner); }
    for (const [x, y] of [[6, 18], [7, 18], [10, 18], [11, 18]] as const) set(buf, x, y, sh);
  } else if (r.cloth === 'sweater') {
    for (const [x, y] of [[6, 18], [7, 18], [8, 18], [9, 18], [10, 18], [11, 18]] as const) set(buf, x, y, sh);
  }
}

/** Back of the head: a rounded hair-covered skull with crown sheen + nape, no face. */
function drawHeadBack(buf: Buf, r: Recipe): void {
  const s = SKIN[r.skin];
  if (r.hair === 'styleBald') { drawHeadBackBald(buf, r); return; }
  const [hi, base, sh] = shades(r.hairc);
  // rounded skull silhouette (narrow at crown + nape, full through the middle)
  const rows: [number, number, number][] = [
    [2, 6, 11], [3, 5, 12], [4, 4, 13], [5, 4, 13], [6, 4, 13], [7, 4, 13], [8, 4, 13],
    [9, 4, 13], [10, 4, 13], [11, 4, 13], [12, 4, 13], [13, 5, 12], [14, 6, 11],
  ];
  for (const [y, a, b] of rows) rect(buf, a, y, b, y, base);
  // long styles drape down the sides past the head
  const len = r.hair === 'styleFrame' ? (r.hairargs?.length ?? 17)
            : r.hair === 'styleMessy' ? (r.hairargs?.length ?? 9) : 0;
  for (let y = 11; y <= len; y++) { set(buf, HX0 - 1, y, base); set(buf, HX0, y, base); set(buf, HX1, y, base); set(buf, HX1 + 1, y, base); }
  // roundness: darken the side edges and the nape
  for (let y = 4; y <= 12; y++) { set(buf, 4, y, sh); set(buf, 13, y, sh); }
  for (const [x, y] of [[5, 3], [12, 3], [5, 13], [12, 13], [6, 14], [11, 14]] as const) set(buf, x, y, sh);
  // crown sheen (rounded top catching the light) + subtle center part
  for (const [x, y] of [[7, 2], [8, 2], [9, 2], [10, 2], [7, 3], [8, 3], [9, 3]] as const) set(buf, x, y, hi);
  for (let y = 4; y <= 11; y++) set(buf, 9, y, hi);   // sheen down the crown
  for (let y = 4; y <= 12; y++) set(buf, 8, y, sh);   // part line
  // nape + neck (skin)
  rect(buf, 7, 14, 10, 14, sh);
  rect(buf, 7, 15, 10, 17, s.sh);
  rect(buf, 7, 15, 9, 15, s.base);
}

/** Back of a bald head: a skin skull with a sheen and a low hair fringe ring. */
function drawHeadBackBald(buf: Buf, r: Recipe): void {
  const s = SKIN[r.skin];
  const [shi, sbase, ssh] = shades(s.base, 1.1, 0.82);
  const rows: [number, number, number][] = [
    [2, 6, 11], [3, 5, 12], [4, 4, 13], [5, 4, 13], [6, 4, 13], [7, 4, 13], [8, 4, 13],
    [9, 4, 13], [10, 4, 13], [11, 4, 13], [12, 4, 13], [13, 5, 12], [14, 6, 11],
  ];
  for (const [y, a, b] of rows) rect(buf, a, y, b, y, sbase);
  for (let y = 4; y <= 12; y++) { set(buf, 4, y, ssh); set(buf, 13, y, ssh); }
  for (const [x, y] of [[7, 2], [8, 2], [9, 2], [8, 3], [9, 4], [9, 5]] as const) set(buf, x, y, shi);
  // low hair fringe ring around the back/sides
  const [, base, sh] = shades(r.hairc);
  for (let x = 4; x <= 13; x++) { set(buf, x, 11, base); set(buf, x, 12, base); }
  for (const x of [4, 13]) { set(buf, x, 11, sh); set(buf, x, 12, sh); }
  // nape + neck (skin)
  rect(buf, 7, 14, 10, 14, s.sh);
  rect(buf, 7, 15, 10, 17, s.sh);
  rect(buf, 7, 15, 9, 15, s.base);
}

function drawSceneBody(buf: Buf, r: Recipe, phase: number, back: boolean): void {
  drawSceneTorso(buf, r, back);
  drawSceneLegs(buf, defaultPants(r), phase);
}

// ─── outline pass ────────────────────────────────────────────────────────────
function outlinePass(buf: Buf): void {
  const pts: [number, number][] = [];
  for (let y = 0; y < CUR_H; y++) {
    for (let x = 0; x < CUR_W; x++) {
      if (alphaAt(buf, x, y) !== 0) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (alphaAt(buf, x + dx, y + dy) === 255) { pts.push([x, y]); break; }
      }
    }
  }
  for (const [x, y] of pts) set(buf, x, y, OUTLINE);
}

// ─── recipes ─────────────────────────────────────────────────────────────────
export interface Recipe {
  skin: string; hairc: RGB; hair: HairStyle; hairargs?: HairArgs;
  cloth: Cloth; c1: RGB; c2?: RGB; tie?: RGB; pants?: RGB;
  brow?: Brow; mouth?: Mouth; blush?: boolean; facial?: Facial; glasses?: boolean;
  /** Bigger, lashed eyes for a more feminine, expressive face. */
  lashes?: boolean;
  /** Accessories. Each is what makes one particular character unmistakable at
   *  this size, so they are flags rather than a generic slot system. */
  blindfold?: boolean; mask?: boolean; hat?: 'straw'; whiskers?: boolean;
  /** Atlas only: a hood in place of hair, and a lit visor in place of eyes. */
  hood?: RGB; visor?: RGB;
  /** Pupil colour, and a scar through one eye. */
  eyes?: RGB; scar?: 'left' | 'right';
  /** Costume parts. Each is what makes one character readable at this size. */
  shades?: RGB; wideShades?: boolean;
  headwear?: { kind: HatKind; c: RGB };
  faceMask?: { c: RGB; eye: RGB; style?: 'eyes' | 'shapes' | 'plain' };
  helmet?: { c: RGB; visor?: RGB; openJaw?: boolean };
  beard?: RGB;
  braids?: { c: RGB; long?: boolean };
  facePaint?: { skin: RGB; mouth: RGB };
  /** Heavier build: chubby cheeks, a double chin, and a wider torso. */
  heavy?: boolean;
}

// Puff the lower face into round cheeks + a double chin so a character reads as
// heavier. Runs after drawHead (adds skin at the jaw) and is safe before the
// face features, which sit higher (eyes y9, mouth y14).
function drawHeavyFace(buf: Buf, skin: string): void {
  const s = SKIN[skin];
  // Chubby cheeks: bulge the jaw outward past the normal x4..13 head box.
  for (let y = 11; y <= 15; y++) { set(buf, HX0 - 1, y, s.base); set(buf, HX1 + 1, y, s.base); }
  set(buf, HX0 - 1, 15, s.sh); set(buf, HX1 + 1, 15, s.sh);
  // Fuller, rounder lower jaw.
  for (const x of [5, 6, 11, 12]) set(buf, x, 16, s.base);
  // Double chin: a second rounded roll under the jaw.
  rect(buf, 6, 17, 11, 18, s.base);
  for (const x of [6, 7, 8, 9, 10, 11]) set(buf, x, 18, s.sh);
  set(buf, 7, 17, s.sh); set(buf, 10, 17, s.sh); // crease shadow between chin + roll
}

// ─── accessories ─────────────────────────────────────────────────────────────
// The four things that decide whether a character is recognised at 18px wide.
// Hair colour gets you close; these land it.

/** A wide dark band over both eyes (drawn after the face, before the hair so
 *  the fringe still falls over it). */
function drawBlindfold(buf: Buf): void {
  const band: RGB = [46, 42, 56];
  const sheen: RGB = [92, 86, 108];
  rect(buf, 3, 8, 14, 10, band);
  for (let x = 4; x <= 13; x += 3) set(buf, x, 8, sheen);
  // The strap continues past the head on both sides.
  set(buf, 2, 9, band); set(buf, 15, 9, band);
}

/** Cloth pulled up over the nose and jaw, plus a slanted headband that takes
 *  one eye with it. */
function drawMask(buf: Buf): void {
  const cloth: RGB = [56, 62, 78];
  const fold: RGB = [42, 48, 62];
  rect(buf, 4, 12, 13, 17, cloth);
  for (let x = 4; x <= 13; x++) set(buf, x, 12, fold);
  set(buf, 4, 17, fold); set(buf, 13, 17, fold);
  // Headband over the forehead, dipping to cover the left eye.
  const metal: RGB = [176, 174, 168];
  rect(buf, 3, 6, 14, 7, cloth);
  rect(buf, 4, 8, 7, 10, cloth);      // the covered eye
  rect(buf, 6, 6, 10, 7, metal);      // the plate
  set(buf, 6, 6, [214, 212, 206]); set(buf, 10, 7, [128, 126, 122]);
}

/** Atlas's hood. Replaces the hair entirely, so the recipe pairs it with
 *  'styleBald': the silhouette IS the identity here, and a fringe poking out
 *  would just make it a person in a hood. */
function drawHood(buf: Buf, col: RGB): void {
  const [hi, base, sh] = shades(col);
  // Crown: narrow at the very top and widening, so it reads as cloth pulled
  // over a head rather than a box dropped on one.
  rect(buf, 6, 0, 11, 0, base);
  rect(buf, 4, 1, 13, 1, base);
  rect(buf, 3, 2, 14, 6, base);
  rect(buf, 7, 0, 10, 0, hi);
  rect(buf, 5, 1, 12, 1, hi);
  // The sides fall past the jaw and taper in at the bottom.
  rect(buf, 2, 4, 3, 13, base);
  rect(buf, 14, 4, 15, 13, base);
  set(buf, 2, 14, sh); set(buf, 15, 14, sh);
  set(buf, 3, 14, sh); set(buf, 14, 14, sh);
  // Inner edge: a dark line all the way round where the hood meets the face,
  // which is what makes the face sit INSIDE it.
  for (let x = 4; x <= 13; x++) set(buf, x, 7, sh);
  for (let y = 7; y <= 13; y++) { set(buf, 4, y, sh); set(buf, 13, y, sh); }
  set(buf, 5, 7, sh); set(buf, 12, 7, sh);
}

/** A lit band across the eyes. Not a blindfold: the light is the point, which
 *  is why it carries a bright core and a halo either side of it. */
function drawVisor(buf: Buf, col: RGB): void {
  const shell: RGB = [30, 26, 42];
  const [hi, base] = shades(col);
  rect(buf, 3, 8, 14, 10, shell);
  rect(buf, 4, 9, 13, 9, base);        // the lit strip
  set(buf, 5, 9, hi); set(buf, 11, 9, hi);
  set(buf, 4, 8, base); set(buf, 13, 8, base);   // spill onto the shell
}

/** A straw hat sitting on the hair: crown, brim, and a band. */
function drawStrawHat(buf: Buf): void {
  const [hi, base, sh] = shades([226, 190, 116]);
  const band: RGB = [176, 54, 48];
  rect(buf, 5, 0, 12, 3, base);        // crown
  for (let x = 5; x <= 12; x++) set(buf, x, 0, hi);
  rect(buf, 5, 3, 12, 3, band);        // hat band
  rect(buf, 1, 4, 16, 4, base);        // brim, wider than the head
  rect(buf, 2, 5, 15, 5, sh);          // brim underside
  set(buf, 1, 4, sh); set(buf, 16, 4, sh);
}

/** A vertical scar through one eye. Drawn after the HAIR: run before it, the
 *  fringe paints over the top half and the scar reads as a stray pixel. */
function drawScar(buf: Buf, side: 'left' | 'right'): void {
  const line: RGB = [150, 96, 84];
  const hi: RGB = [196, 140, 126];
  const x = side === 'left' ? 5 : 12;
  for (let y = 6; y <= 12; y++) set(buf, x, y, line);
  set(buf, x, 7, hi); set(buf, x, 10, hi);
}

/** Two short strokes on each cheek. x3/x14 is the outline column, not skin, so
 *  they have to sit inside HX0..HX1 or they vanish into the silhouette. */
function drawWhiskers(buf: Buf, skin: string): void {
  const line = SKIN[skin].line;
  for (const y of [11, 13]) {
    set(buf, 4, y, line); set(buf, 5, y, line);
    set(buf, 12, y, line); set(buf, 13, y, line);
  }
}

// ─── costume parts ───────────────────────────────────────────────────────────
// A face at 18px cannot look like an actor. It CAN look like a costume, so
// these are the pieces that carry a character: a hat brim, dark lenses, a
// full-face mask, a helmet. Each is parameterised by colour so one primitive
// serves several characters.

/** Dark lenses. Distinct from `glasses`, which reads as clear eyewear. */
function drawShades(buf: Buf, lens: RGB, wide = false): void {
  const frame: RGB = [24, 22, 28];
  const x0 = wide ? 3 : 4, x1 = wide ? 14 : 13;
  rect(buf, x0, 8, x1, 10, frame);
  rect(buf, x0 + 1, 9, 7, 9, lens);
  rect(buf, 10, 9, x1 - 1, 9, lens);
  set(buf, x0 + 1, 8, shades(lens)[0]);
}

// Headwear is doing most of the work in a thirty-face set: the face grid is
// fixed — every portrait has the same two eye pixels and the same mouth row —
// so what a person wears on their head is very nearly the only thing that can
// tell two of them apart at 18px wide. Five kinds could not carry thirty faces,
// which is why so many of them read as the same person.
//
// These are garments, drawn as shapes. The face underneath is identical in
// every case; nothing here changes a feature.
type HatKind =
  | 'fedora' | 'pointed' | 'flat' | 'cap' | 'band'
  | 'turban' | 'wrap' | 'conical' | 'beret' | 'ushanka'
  | 'beanie' | 'shemagh' | 'scarf' | 'fez' | 'wide' | 'kufi';

/** Headwear, drawn over the hair. */
function drawHat(buf: Buf, kind: HatKind, col: RGB): void {
  const [hi, base, sh] = shades(col);
  if (kind === 'fedora') {
    rect(buf, 5, 0, 12, 3, base);            // crown
    rect(buf, 5, 0, 12, 0, hi);
    rect(buf, 5, 3, 12, 3, sh);              // band
    rect(buf, 1, 4, 16, 4, base);            // brim
    rect(buf, 2, 5, 15, 5, sh);
  } else if (kind === 'pointed') {
    rect(buf, 8, 0, 9, 0, base);
    rect(buf, 7, 1, 10, 1, base);
    rect(buf, 6, 2, 11, 2, base);
    rect(buf, 5, 3, 12, 3, base);
    rect(buf, 1, 4, 16, 4, base);
    rect(buf, 2, 5, 15, 5, sh);
  } else if (kind === 'flat') {
    rect(buf, 4, 2, 13, 4, base);
    rect(buf, 4, 2, 13, 2, hi);
    rect(buf, 2, 5, 13, 5, sh);              // short peak, one side
  } else if (kind === 'cap') {
    rect(buf, 4, 2, 13, 4, base);
    rect(buf, 4, 2, 13, 2, hi);
    rect(buf, 1, 5, 9, 5, sh);
  } else if (kind === 'turban') {
    // Wrapped and tall, with the wrap lines reading across the crown.
    rect(buf, 4, 0, 13, 4, base);
    rect(buf, 3, 2, 14, 4, base);
    rect(buf, 4, 0, 13, 0, hi);
    for (const y of [1, 3]) rect(buf, 4, y, 13, y, sh);   // wrap seams
    rect(buf, 3, 5, 14, 5, base);
    set(buf, 3, 6, sh);
  } else if (kind === 'wrap') {
    // A high headwrap: a wide crown that sits above the brow and folds at the side.
    rect(buf, 3, 0, 14, 3, base);
    rect(buf, 2, 1, 15, 3, base);
    rect(buf, 3, 0, 14, 0, hi);
    rect(buf, 4, 4, 13, 5, base);
    set(buf, 2, 2, hi); set(buf, 15, 4, sh); set(buf, 15, 5, sh);
    rect(buf, 4, 5, 13, 5, sh);
  } else if (kind === 'conical') {
    // A broad conical hat: a point and a very wide brim, the widest silhouette
    // in the set.
    set(buf, 8, 0, base); set(buf, 9, 0, base);
    rect(buf, 7, 1, 10, 1, base);
    rect(buf, 6, 2, 11, 2, base);
    rect(buf, 5, 3, 12, 3, hi);
    rect(buf, 0, 4, 17, 4, base);
    rect(buf, 1, 5, 16, 5, sh);
  } else if (kind === 'beret') {
    // Soft, tilted, with the pull to one side.
    rect(buf, 4, 2, 12, 4, base);
    rect(buf, 5, 1, 11, 1, base);
    rect(buf, 5, 1, 10, 1, hi);
    set(buf, 13, 2, base); set(buf, 13, 3, sh);
    rect(buf, 4, 4, 13, 4, sh);
  } else if (kind === 'ushanka') {
    // Fur hat with the flaps down: the head reads wider at the ears.
    rect(buf, 4, 1, 13, 4, base);
    rect(buf, 4, 1, 13, 1, hi);
    rect(buf, 3, 3, 3, 9, base); rect(buf, 14, 3, 14, 9, base);
    set(buf, 3, 9, sh); set(buf, 14, 9, sh);
    rect(buf, 4, 4, 13, 4, sh);
  } else if (kind === 'beanie') {
    // Knitted, with a turned-up band at the brow.
    rect(buf, 4, 2, 13, 5, base);
    rect(buf, 4, 2, 13, 2, hi);
    rect(buf, 3, 5, 14, 6, sh);               // the fold
    rect(buf, 3, 6, 14, 6, base);
  } else if (kind === 'shemagh') {
    // Cloth over the crown, falling past the jaw on both sides, with a cord.
    rect(buf, 3, 1, 14, 4, base);
    rect(buf, 4, 1, 13, 1, hi);
    rect(buf, 2, 4, 2, 14, base); rect(buf, 15, 4, 15, 14, base);
    rect(buf, 3, 4, 3, 12, base); rect(buf, 14, 4, 14, 12, base);
    rect(buf, 3, 2, 14, 2, sh);               // cord
    set(buf, 2, 14, sh); set(buf, 15, 14, sh);
  } else if (kind === 'scarf') {
    // A headscarf: covers the hair and frames the face down to the shoulder.
    rect(buf, 3, 2, 14, 6, base);
    rect(buf, 4, 1, 13, 1, base);
    rect(buf, 4, 1, 13, 1, hi);
    rect(buf, 3, 6, 3, 17, base); rect(buf, 14, 6, 14, 17, base);
    rect(buf, 2, 8, 2, 17, base); rect(buf, 15, 8, 15, 17, base);
    for (let y = 7; y <= 17; y++) { set(buf, 14, y, sh); set(buf, 15, y, sh); }
  } else if (kind === 'fez') {
    // A short straight cylinder with a flat top and a tassel.
    rect(buf, 5, 0, 12, 4, base);
    rect(buf, 5, 0, 12, 0, hi);
    rect(buf, 5, 4, 12, 4, sh);
    set(buf, 13, 1, sh); set(buf, 13, 2, sh); set(buf, 13, 3, sh);  // tassel
  } else if (kind === 'wide') {
    // A tall crown on a very wide flat brim.
    rect(buf, 5, 0, 12, 3, base);
    rect(buf, 5, 0, 12, 0, hi);
    rect(buf, 5, 3, 12, 3, sh);
    rect(buf, 0, 4, 17, 5, base);
    rect(buf, 0, 5, 17, 5, sh);
  } else if (kind === 'kufi') {
    // A low rounded cap that sits ON the crown, leaving the hairline visible.
    rect(buf, 5, 2, 12, 4, base);
    rect(buf, 6, 1, 11, 1, base);
    rect(buf, 6, 1, 11, 1, hi);
    rect(buf, 5, 4, 12, 4, sh);
  } else {
    rect(buf, 3, 5, 14, 6, base);            // bandana
    set(buf, 3, 7, sh); set(buf, 2, 7, sh);
  }
}

/** A full-face mask: the whole head in one colour with an eye shape cut in. */
function drawFaceMask(buf: Buf, col: RGB, eye: RGB, style: 'eyes' | 'shapes' | 'plain' = 'eyes'): void {
  const [hi, base, sh] = shades(col);
  rect(buf, HX0 - 1, 2, HX1 + 1, 17, base);
  rect(buf, HX0, 2, HX1, 2, hi);
  rect(buf, HX0 - 1, 16, HX1 + 1, 17, sh);
  if (style === 'eyes') {
    rect(buf, 5, 8, 7, 10, eye);
    rect(buf, 10, 8, 12, 10, eye);
  } else if (style === 'shapes') {
    rect(buf, 5, 9, 7, 11, eye);             // one blank visor band
    rect(buf, 10, 9, 12, 11, eye);
    rect(buf, 8, 13, 9, 14, eye);
  }
}

/** A rigid helmet: shell, plus an optional visor band across the eyes. */
function drawHelmet(buf: Buf, col: RGB, visor?: RGB, openJaw = false): void {
  const [hi, base, sh] = shades(col);
  // A sealed helmet in one dark colour is a black rectangle with no face in it.
  // `visor` and `openJaw` are what put a readable feature back: eye slits, or
  // the wearer's own jaw showing below the cowl.
  const bottom = openJaw ? 11 : 16;
  rect(buf, HX0 - 1, 1, HX1 + 1, bottom, base);
  rect(buf, HX0, 1, HX1, 1, hi);
  set(buf, HX0 - 1, 6, sh); set(buf, HX1 + 1, 6, sh);
  if (openJaw) {
    rect(buf, HX0 - 1, 2, HX0 - 1, 15, base);   // the cowl's cheek pieces
    rect(buf, HX1 + 1, 2, HX1 + 1, 15, base);
    rect(buf, 4, 9, 6, 10, [236, 236, 240]);    // lit eye slits
    rect(buf, 11, 9, 13, 10, [236, 236, 240]);
    return;
  }
  rect(buf, HX0 - 1, 15, HX1 + 1, 16, sh);
  if (visor) {
    rect(buf, 4, 8, 13, 10, visor);
    rect(buf, 4, 8, 13, 8, shades(visor)[0]);
    rect(buf, 5, 9, 6, 9, shades(visor)[2]);
    rect(buf, 11, 9, 12, 9, shades(visor)[2]);
  }
  rect(buf, 6, 13, 11, 14, sh);
  for (const x of [6, 8, 10]) set(buf, x, 13, hi);   // grille, so it is not a slab
}

/** A full beard, jaw to chest. */
function drawBeard(buf: Buf, col: RGB): void {
  const [hi, base, sh] = shades(col);
  rect(buf, 4, 13, 13, 18, base);
  rect(buf, 5, 19, 12, 20, base);
  rect(buf, 6, 21, 11, 21, sh);
  rect(buf, 7, 13, 10, 14, [158, 86, 80]);   // the mouth stays visible
  set(buf, 4, 13, hi); set(buf, 13, 13, hi);
}

/** Two braids or pigtails falling either side of the face. */
function drawBraids(buf: Buf, col: RGB, long = true): void {
  const [hi, base, sh] = shades(col);
  const bottom = long ? 24 : 18;
  for (let y = 8; y <= bottom; y++) {
    rect(buf, 2, y, 3, y, base);
    rect(buf, 14, y, 15, y, base);
    if (y % 3 === 0) { set(buf, 2, y, sh); set(buf, 15, y, sh); }
  }
  set(buf, 2, 8, hi); set(buf, 15, 8, hi);
}

/** Painted face: the skin itself is the costume. */
function drawFacePaint(buf: Buf, skinCol: RGB, mouth: RGB): void {
  const [hi, base, sh] = shades(skinCol);
  rect(buf, HX0, 3, HX1, 17, base);
  rect(buf, HX0, 3, HX1, 3, hi);
  rect(buf, HX0, 17, HX1, 17, sh);
  for (const [x, y] of [[5, 9], [6, 9], [10, 9], [11, 9]] as const) set(buf, x, y, [30, 26, 32]);
  for (let x = 5; x <= 12; x++) set(buf, x, 14, mouth);
  set(buf, 4, 13, mouth); set(buf, 13, 13, mouth);
}

const RECIPES: Record<OfficeCharacterName, Recipe> = {
  // Atlas is the only built-in face. Everything else a person can pick is a
  // library recipe (avatarLibrary.ts), and anything else at all is generated
  // from the string itself — see the resolver at the bottom of this file.
  // Atlas: black suit, red tie, neat side part and glasses. It is the one face
  // that is not a character from anything, and it runs the floor, so it reads
  // as the person in the room who has read everything.
  michael:  { skin: 'light', hairc: [38, 34, 40], hair: 'styleShort', hairargs: { part: 'L' }, cloth: 'suit', c1: [32, 32, 40], tie: [216, 74, 66], glasses: true, eyes: [58, 62, 92], brow: 'flat', mouth: 'neutral' },   // Atlas
};

/** The face/hair group (head → face → facial hair → hair → glasses), no clothing. */
function drawHeadGroup(buf: Buf, r: Recipe): void {
  const skinBase = SKIN[r.skin].base;
  drawHead(buf, r.skin);
  if (r.heavy) drawHeavyFace(buf, r.skin);
  drawFace(buf, r.skin, r.brow ?? 'flat', r.mouth ?? 'neutral', r.blush ?? false, r.lashes ?? false, r.eyes);
  if (r.facial) drawFacial(buf, r.facial, r.hairc);
  if (r.whiskers) drawWhiskers(buf, r.skin);
  if (r.blindfold) drawBlindfold(buf);
  if (r.mask) drawMask(buf);
  if (r.facePaint) drawFacePaint(buf, r.facePaint.skin, r.facePaint.mouth);
  HAIR_FNS[r.hair](buf, r.hairc, skinBase, r.hairargs ?? {});
  if (r.braids) drawBraids(buf, r.braids.c, r.braids.long ?? true);
  if (r.beard) drawBeard(buf, r.beard);
  // A mask or helmet covers everything under it, so it goes on late.
  if (r.faceMask) drawFaceMask(buf, r.faceMask.c, r.faceMask.eye, r.faceMask.style);
  if (r.helmet) drawHelmet(buf, r.helmet.c, r.helmet.visor, r.helmet.openJaw);
  if (r.shades) drawShades(buf, r.shades, r.wideShades);
  if (r.headwear) drawHat(buf, r.headwear.kind, r.headwear.c);
  // AFTER the hair: drawn before it, the fringe painted straight over it.
  if (r.scar) drawScar(buf, r.scar);
  if (r.hood) drawHood(buf, r.hood);
  if (r.visor) drawVisor(buf, r.visor);
  if (r.glasses) drawGlasses(buf);
  if (r.hat === 'straw') drawStrawHat(buf);
}

function defaultPants(r: Recipe): RGB {
  if (r.pants) return r.pants;
  return r.cloth === 'suit' ? shades(r.c1)[2] : [54, 56, 70];
}

/** Portrait bust: shoulders-height clothing + front head group. */
function compose(r: Recipe): Buf {
  CUR_W = PORTRAIT_W; CUR_H = PORTRAIT_H;
  const buf = new Uint8ClampedArray(PORTRAIT_W * PORTRAIT_H * 4);
  drawClothing(buf, r.cloth, r.c1, r.c2, r.tie, r.skin, r.heavy ?? false);
  collarNeck(buf, r.skin);
  drawHeadGroup(buf, r);
  outlinePass(buf);
  return buf;
}

/** Full-body 18×32 scene sprite. `back=false` reuses the portrait's exact face. */
function composeScene(r: Recipe, phase: number, back: boolean): Buf {
  CUR_W = SCENE_W; CUR_H = SCENE_H;
  const buf = new Uint8ClampedArray(SCENE_W * SCENE_H * 4);
  drawSceneBody(buf, r, phase, back);
  if (back) drawHeadBack(buf, r);
  else drawHeadGroup(buf, r);
  outlinePass(buf);
  return buf;
}

// ─── public render ───────────────────────────────────────────────────────────
const bufCache = new Map<string, Buf>();
const sceneCache = new Map<string, SceneFrames>();

/** A face for a name that is not in the cast.
 *
 *  Same name always gives the same face, because every choice is driven by a
 *  hash of the string rather than a random number. That matters more than the
 *  art: the avatar is persisted as the NAME, so a stable hash is what makes it
 *  survive a restart without storing a recipe anywhere.
 *
 *  It only ever picks from the vocabulary the renderer already has, so a
 *  generated face is drawn by exactly the same code as a hand-written one.
 */
function generatedRecipe(seed: string): Recipe {
  // FNV-1a: tiny, stable across runs, and good enough to decorrelate the
  // fields (Math.random would give a different face on every render).
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const roll = (n: number, salt: number): number => {
    let x = (h ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x85ebca6b) >>> 0;
    // >>> 0 is load-bearing: XOR in JS yields a SIGNED 32-bit int, so without
    // it this returns a negative index and every pick is undefined.
    return ((x ^ (x >>> 13)) >>> 0) % n;
  };
  const pick = <T,>(arr: readonly T[], salt: number): T => arr[roll(arr.length, salt)];

  const HAIRC: RGB[] = [
    [32, 28, 30], [86, 58, 38], [126, 84, 44], [214, 178, 96], [232, 140, 52],
    [188, 62, 62], [70, 140, 92], [72, 108, 190], [150, 92, 178], [206, 206, 214],
  ];
  const CLOTHC: RGB[] = [
    [214, 92, 84], [232, 140, 60], [226, 178, 46], [122, 170, 78], [58, 158, 138],
    [62, 132, 184], [96, 96, 176], [162, 88, 176], [206, 96, 142], [104, 116, 132],
  ];
  const HAIRS: HairStyle[] = [
    'styleShort', 'styleFloppy', 'styleFrame', 'styleBun', 'styleCurly',
    'styleMessy', 'styleRecede', 'styleSpiky', 'styleTallSpikes', 'styleBald',
  ];
  const CLOTHS: Cloth[] = ['dressshirt', 'polo', 'sweater', 'cardigan', 'blouse', 'suit'];
  const SKINS = ['light', 'tan', 'brown', 'dark'] as const;

  const cloth = pick(CLOTHS, 3);
  const c1 = pick(CLOTHC, 4);
  return {
    skin: pick(SKINS, 0),
    hairc: pick(HAIRC, 1),
    hair: pick(HAIRS, 2),
    hairargs: { part: roll(2, 8) ? 'L' : 'R', length: 12 + roll(9, 9), vol: roll(3, 10) },
    cloth,
    c1,
    c2: pick(CLOTHC, 5),
    tie: cloth === 'suit' || cloth === 'dressshirt' ? pick(CLOTHC, 6) : undefined,
    eyes: pick([[58, 52, 44], [72, 46, 32], [64, 96, 148], [70, 130, 96], [96, 102, 118]] as RGB[], 7),
    brow: pick(['flat', 'angry', 'raised', 'soft'] as const, 11),
    mouth: pick(['neutral', 'smile', 'grin'] as const, 12),
    glasses: roll(5, 13) === 0,
    facial: roll(4, 14) === 0 ? pick(['mustache', 'stubble', 'goatee'] as const, 15) : undefined,
    lashes: roll(2, 16) === 0,
  };
}

/** Cast first, then the pickable library, then a face generated from the name.
 *  One resolver so the portrait, the walking sprite and every caller agree. */
function recipeFor(name: string): Recipe {
  return RECIPES[name as OfficeCharacterName] ?? LIBRARY_BY_ID[name]?.recipe ?? generatedRecipe(name);
}

function getBuf(name: string): Buf {
  let buf = bufCache.get(name);
  if (!buf) {
    // A name that is not one of the cast gets a face generated from itself,
    // rather than silently falling back to Jim's.
    buf = compose(recipeFor(name));
    bufCache.set(name, buf);
  }
  return buf;
}

export interface SceneFrames { front: Buf[]; back: Buf[]; }

/** Walk-phase frames (stand, step-L, step-R) for the in-scene sprite, front + back. */
export function sceneFrameBufs(name: string): SceneFrames {
  let frames = sceneCache.get(name);
  if (!frames) {
    // Same rule as the portrait: an unknown name draws itself.
    const r = recipeFor(name);
    frames = {
      front: [composeScene(r, 0, false), composeScene(r, 1, false), composeScene(r, 2, false)],
      back: [composeScene(r, 0, true), composeScene(r, 1, true), composeScene(r, 2, true)],
    };
    sceneCache.set(name, frames);
  }
  return frames;
}

/** Paint a character's procedural portrait onto `ctx`, nearest-neighbor at `scale`. */
export function paintPortrait(ctx: CanvasRenderingContext2D, name: string, scale = 2): void {
  const buf = getBuf(name);
  // Stage at 1× on an offscreen canvas, then blit scaled with smoothing off.
  const stage = document.createElement('canvas');
  stage.width = PORTRAIT_W; stage.height = PORTRAIT_H;
  const sctx = stage.getContext('2d')!;
  const img = sctx.createImageData(PORTRAIT_W, PORTRAIT_H);
  img.data.set(buf);
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, PORTRAIT_W * scale, PORTRAIT_H * scale);
  ctx.drawImage(stage, 0, 0, PORTRAIT_W, PORTRAIT_H, 0, 0, PORTRAIT_W * scale, PORTRAIT_H * scale);
}
