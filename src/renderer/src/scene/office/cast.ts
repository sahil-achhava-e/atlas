// Atlas: roster metadata + sprite frames.
//
// The cast used to be fifteen borrowed characters sitting alongside the thirty
// in avatarLibrary.ts, which meant two vocabularies for one idea — a face — and
// every screen had to try both. It is one entry now. Everything else a person
// can pick is a library face.
//
// 'michael' is the INTERNAL key and deliberately stays that way. It is the
// persisted `agent.character` value and the god agent's id, so renaming it
// would orphan the boss in every roster already on disk. `displayName` is what
// the app shows.
//
// Both the static portrait (cards / picker) and the in-scene walking sprite are
// drawn from the same recipe in portraitArt.ts: the scene sprite reuses the
// portrait's exact head, face and clothing and adds legs, so the agent on the
// office floor looks identical to its card. The LimeZu base sheets are no
// longer used. See assets/ATTRIBUTION.md.

import { Texture } from 'pixi.js';
import { paintPortrait, sceneFrameBufs, SCENE_W, SCENE_H } from './portraitArt';

export type OfficeCharacterName = 'michael';

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
  { name: 'michael', displayName: 'Atlas', shirt: '#F2685C', blurb: 'Runs the floor' },
];

export const CAST_BY_NAME: Record<OfficeCharacterName, CastMember> =
  Object.fromEntries(OFFICE_CAST.map((c) => [c.name, c])) as Record<OfficeCharacterName, CastMember>;

// Atlas. Every other face is either picked deliberately or generated from a
// name, so the one a fresh dialog opens on should be the one that is built in.
export const DEFAULT_CHARACTER: OfficeCharacterName = 'michael';

export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

// ─── scene frames ────────────────────────────────────────────────────────────
const frameCache = new Map<string, Texture[][]>();

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
export async function getCastFrames(name: string): Promise<Texture[][]> {
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
  // Any string: one of the cast keys, or a name that has no cast entry, which
  // gets a face generated from the name itself.
  name: string,
  scale = 2,
): Promise<void> {
  paintPortrait(ctx, name, scale);
}
