/**
 * Repaint the office by swapping COLOURS in the tileset, not by filtering layers.
 *
 * A filter over the rendered scene moves everything at once and reads as a gel
 * over the lens. This is the other thing: the art has a tiny palette — a desk is
 * three colours, a wall face is literally one — so an exact colour→colour swap on
 * the tileset image repaints the desks without touching the floor, or the walls
 * without touching either. Pixel art is what makes that possible; it would not
 * work on a photograph.
 *
 * WHAT IS NEVER TOUCHED. Only the two tileset images pass through here. Agents
 * are drawn in code from recipes (portraitArt.ts), so no palette can alter a
 * face, and the lit desk screens keep their own colours unless a palette names
 * them — in a dark room they should be the brightest thing in it.
 *
 * 'original' has no entries, so it skips the canvas pass entirely and the texture
 * is the file as shipped. That is the revert.
 *
 * The source colours below were read out of the tilesets, not guessed:
 *   desk   #c1a96c top · #a17849 mid · #734934 legs
 *   wall   #ebe8e0 face · #302a28 trim · #ffffff cap
 *   floor  #92a897 · #75938d
 */

export type PaletteId = 'original' | 'night';

export interface TilePalette {
  id: PaletteId;
  /** Shown in Settings. English here; the picker translates by id. */
  label: string;
  /** Canvas clear colour (0xRRGGBB), or null to keep the theme's. A repainted
   *  room on the old surround reads as a picture pasted onto a page. */
  background: number | null;
  /** Exact source colour → target colour, both `#rrggbb` lowercase. */
  swap: Record<string, string>;
}

export const TILE_PALETTES: readonly TilePalette[] = [
  { id: 'original', label: 'Original', background: null, swap: {} },
  {
    id: 'night',
    label: 'Night',
    background: 0x1b1f27,
    swap: {
      '#92a897': '#2f3540',   // floor, light square
      '#75938d': '#272d36',   // floor, dark square
      '#ebe8e0': '#3b424e',   // wall face
      '#302a28': '#20242b',   // wall trim
      '#ffffff': '#4a515e',   // wall cap highlight
      '#c1a96c': '#5d5a52',   // desk top
      '#a17849': '#46433d',   // desk edge
      '#734934': '#2e2c28'    // desk legs
    }
  }
];

const BY_ID = new Map<string, TilePalette>(TILE_PALETTES.map((p) => [p.id, p]));

export const DEFAULT_PALETTE: TilePalette = TILE_PALETTES[0];

/** Resolve a stored id. Anything unknown — a palette from another build, a typo
 *  in config — gives the original art rather than throwing. */
export function resolvePalette(id: string | null | undefined): TilePalette {
  return BY_ID.get(String(id ?? '')) ?? DEFAULT_PALETTE;
}

/** Whether this palette changes anything, so callers can skip the canvas pass. */
export function paletteIsNoop(p: TilePalette): boolean {
  return Object.keys(p.swap).length === 0;
}

/** `#rrggbb` → [r, g, b]; null for anything that is not a 6-digit hex. */
function rgbOf(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

/**
 * The swap as a lookup keyed by packed RGB.
 *
 * Built once per palette rather than per pixel: a 256×512 tileset is 131,072
 * pixels and there are two of them, so a per-pixel loop over an object's entries
 * is the difference between a frame and a stall on the floor's first paint.
 */
export function swapTable(p: TilePalette): Map<number, [number, number, number]> {
  const table = new Map<number, [number, number, number]>();
  for (const [from, to] of Object.entries(p.swap)) {
    const f = rgbOf(from), t = rgbOf(to);
    if (f && t) table.set((f[0] << 16) | (f[1] << 8) | f[2], t);
  }
  return table;
}

/**
 * Apply a palette to already-decoded pixels, in place.
 *
 * Exported separately from the DOM so it can be tested without a canvas: the
 * swap is the part with a rule in it, and the canvas is just where the pixels
 * come from. Fully transparent pixels are skipped — the tilesets are padded with
 * them, and recolouring them would tint the gaps between tiles.
 */
export function applySwap(pixels: Uint8ClampedArray | Uint8Array, table: Map<number, [number, number, number]>): number {
  if (table.size === 0) return 0;
  let changed = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const hit = table.get((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
    if (!hit) continue;
    pixels[i] = hit[0];
    pixels[i + 1] = hit[1];
    pixels[i + 2] = hit[2];
    changed++;
  }
  return changed;
}
