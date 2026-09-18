/**
 * The desks, with names a person can choose between.
 *
 * The map calls them `pc-3` and `desk-market-researcher`; neither tells you where
 * the desk IS, which is the only thing that matters when you are assigning one.
 * So this reads the map and labels each desk by its place on the floor — "Row 2 ·
 * desk 4", "Lead office 1 · left", "Boardroom · seat 3" — and hands the list to
 * the picker along with coordinates, so the picker can draw a mini-map.
 *
 * ATLAS IS NOT IN THE LIST. His cabin is his, permanently: it is the seat the
 * floor reserves (GOD_SEAT) and the room the arrival sequence, the errand spots
 * and the no-wander fence are all written around. Offering it in a dropdown would
 * be offering something the rest of the code will not honour.
 *
 * Derived from the map at import time rather than hand-listed, so a desk moved in
 * Tiled moves here too.
 */

import officeMapRaw from '@/assets/maps/office.tmj?raw';
import { LEAD_SEAT_NAMES } from './leadSeats';

export interface Desk {
  /** The spawn-point name — what gets stored on the agent. */
  name: string;
  /** What the picker shows. */
  label: string;
  x: number;
  y: number;
  group: 'lead' | 'boardroom' | 'floor';
}

export interface DeskMap {
  width: number;
  height: number;
  /** Solid tiles, for the mini-map's walls. */
  solid: ReadonlySet<string>;
  desks: readonly Desk[];
}

interface TiledObject { name: string; x: number; y: number; width?: number; height?: number }

/** The god's own desk, excluded everywhere below. */
const GOD_SEAT_NAME = 'desk-ceo';

function build(): DeskMap {
  const map = JSON.parse(officeMapRaw) as {
    width: number; height: number; tilewidth: number;
    layers: Array<{ name: string; type: string; data?: number[]; objects?: TiledObject[] }>;
  };
  const T = map.tilewidth;
  const collision = map.layers.find((l) => l.name === 'collision' && l.type === 'tilelayer')?.data ?? [];
  const solid = new Set<string>();
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (collision[y * map.width + x]) solid.add(`${x},${y}`);
    }
  }

  const zones = map.layers.find((l) => l.name === 'zones' && l.type === 'objectgroup')?.objects ?? [];
  const zone = (name: string) => {
    const z = zones.find((o) => o.name === name);
    return z ? {
      x: Math.floor(z.x / T), y: Math.floor(z.y / T),
      w: Math.floor((z.width ?? 0) / T), h: Math.floor((z.height ?? 0) / T)
    } : null;
  };
  const boardroom = zone('boardroom');
  const inside = (z: { x: number; y: number; w: number; h: number } | null, x: number, y: number) =>
    !!z && x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h;

  const spawns = (map.layers.find((l) => l.name === 'spawn-points' && l.type === 'objectgroup')?.objects ?? [])
    .map((o) => ({ name: o.name, x: Math.round(o.x / T), y: Math.round(o.y / T) }))
    // Desks only: café seats, stands and the door are not places to sit and work.
    .filter((o) => (o.name.startsWith('desk-') || o.name.startsWith('pc-') || o.name === 'warroom-seat'))
    .filter((o) => o.name !== GOD_SEAT_NAME);

  const desks: Desk[] = [];

  // The two side offices, in the order leaders claim them.
  LEAD_SEAT_NAMES.forEach((name, i) => {
    const s = spawns.find((o) => o.name === name);
    if (!s) return;
    desks.push({
      name, x: s.x, y: s.y, group: 'lead',
      label: `Lead office ${i < 2 ? 1 : 2} · ${i % 2 === 0 ? 'left' : 'right'}`
    });
  });

  // Everything else, grouped into rows by y so "Row 2 · desk 4" means what it
  // looks like on screen.
  const rest = spawns.filter((o) => !LEAD_SEAT_NAMES.includes(o.name));
  const rows = [...new Set(rest.map((o) => o.y))].sort((a, b) => a - b);
  for (const o of [...rest].sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (inside(boardroom, o.x, o.y)) {
      const n = desks.filter((d) => d.group === 'boardroom').length + 1;
      desks.push({ ...o, group: 'boardroom', label: `Boardroom · seat ${n}` });
      continue;
    }
    const row = rows.indexOf(o.y) + 1;
    const col = rest.filter((r) => r.y === o.y && r.x <= o.x).length;
    desks.push({ ...o, group: 'floor', label: `Row ${row} · desk ${col}` });
  }

  return { width: map.width, height: map.height, solid, desks };
}

export const DESK_MAP: DeskMap = build();

/** Look up a desk by its stored name. Unknown (a renamed map, an old config)
 *  resolves to null, and the floor falls back to first-free seating. */
export function deskByName(name: string | null | undefined): Desk | null {
  return DESK_MAP.desks.find((d) => d.name === name) ?? null;
}
