// The Atlas crew: roster metadata + sprite frames.
//
// The INTERNAL keys below are the original cast names and deliberately stay
// that way. They are the persisted `agent.character` value, so renaming them
// would orphan every avatar in a roster already on disk. Only `displayName` is
// the crew name, and it is what the app shows and what name-to-avatar inference
// matches on, so "spawn one called Orion" lands on the right sprite.
//
// Both the static portraits (cards / picker) and the in-scene walking sprites are
// now fully custom-drawn from the same per-character recipes in portraitArt.ts:
// the scene sprite reuses the portrait's exact head/face/clothing and adds legs,
// so an agent on the office floor looks identical to its card. The LimeZu base
// sheets are no longer used for the cast. See assets/ATTRIBUTION.md.

import { Texture } from 'pixi.js';
import { paintPortrait, sceneFrameBufs, SCENE_W, SCENE_H } from './portraitArt';

export type OfficeCharacterName =
  | 'michael' | 'jim' | 'pam' | 'dwight' | 'kevin' | 'angela'
  | 'oscar' | 'stanley' | 'phyllis' | 'andy' | 'kelly' | 'ryan'
  | 'toby' | 'creed' | 'meredith';

export interface CastMember {
  name: OfficeCharacterName;
  displayName: string;
  /** Signature accent color (hex) — used for the in-scene selection glow. */
  shirt: string;
  /** Blurb shown when this character is picked / has no description yet. */
  blurb: string;
}

/** Selectable roster, in display order. */
export const OFFICE_CAST: CastMember[] = [
  { name: 'michael',  displayName: 'Atlas',   shirt: '#9482D3', blurb: 'Runs the floor' },
  { name: 'jim',      displayName: 'Luffy',   shirt: '#6fa8dc', blurb: 'Ships the work' },
  { name: 'pam',      displayName: 'Robin',   shirt: '#9caf88', blurb: 'Keeps the notes' },
  { name: 'dwight',   displayName: 'Zoro',    shirt: '#b89b3e', blurb: 'Checks everything twice' },
  { name: 'kevin',    displayName: 'Goku',    shirt: '#4a7ab5', blurb: 'Grinds the long jobs' },
  { name: 'angela',   displayName: 'Mikasa',  shirt: '#8a86a6', blurb: 'Guards the standards' },
  { name: 'oscar',    displayName: 'Light',   shirt: '#7a4b6b', blurb: 'Follows the numbers' },
  { name: 'stanley',  displayName: 'Kakashi', shirt: '#8c5a4b', blurb: 'Steady on long runs' },
  { name: 'phyllis',  displayName: 'Sakura',  shirt: '#b08bbf', blurb: 'Reads the docs' },
  { name: 'andy',     displayName: 'Naruto',  shirt: '#6fae6f', blurb: 'Wires things together' },
  { name: 'kelly',    displayName: 'Misa',    shirt: '#d16ba5', blurb: 'Answers first' },
  { name: 'ryan',     displayName: 'Eren',    shirt: '#3a3a44', blurb: 'Newest on the crew' },
  { name: 'toby',     displayName: 'Armin',   shirt: '#9a8c5a', blurb: 'Handles the paperwork' },
  { name: 'creed',    displayName: 'Ryuk',    shirt: '#6b7a4b', blurb: 'Watches the edges' },
  { name: 'meredith', displayName: 'Nami',    shirt: '#b5544a', blurb: 'Chases supply' },
];

export const CAST_BY_NAME: Record<OfficeCharacterName, CastMember> =
  Object.fromEntries(OFFICE_CAST.map((c) => [c.name, c])) as Record<OfficeCharacterName, CastMember>;

export const DEFAULT_CHARACTER: OfficeCharacterName = 'jim';

export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

// ─── scene frames ────────────────────────────────────────────────────────────
const frameCache = new Map<OfficeCharacterName, Texture[][]>();

function bufToTexture(buf: Uint8ClampedArray): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = SCENE_W; canvas.height = SCENE_H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SCENE_W, SCENE_H);
  img.data.set(buf);
  ctx.putImageData(img, 0, 0);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

/**
 * Frame grid CharacterSprite expects: 3 rows (down, up, right) × 7 frames
 * [walk1, walk2, walk3, type1, type2, read1, read2]. We provide a front view
 * (down — and reused for the side row, so left/right walkers still show a face)
 * and a back view (up — agents seated facing their desk show their back). The
 * three walk frames are stand / step-left / step-right.
 */
export async function getCastFrames(name: OfficeCharacterName): Promise<Texture[][]> {
  const cached = frameCache.get(name);
  if (cached) return cached;
  const { front, back } = sceneFrameBufs(name);
  const toRow = (bufs: Uint8ClampedArray[]): Texture[] => {
    const [stand, stepL, stepR] = bufs.map(bufToTexture);
    return [stand, stepL, stepR, stand, stand, stand, stand];
  };
  const frontRow = toRow(front);
  const frames: Texture[][] = [frontRow, toRow(back), frontRow]; // down, up, right
  frameCache.set(name, frames);
  return frames;
}

/**
 * Paint a character's static portrait for cards / the picker (delegates to the
 * custom procedural composer in portraitArt.ts).
 */
export async function paintCastPortrait(
  ctx: CanvasRenderingContext2D,
  name: OfficeCharacterName,
  scale = 2,
): Promise<void> {
  paintPortrait(ctx, name, scale);
}
