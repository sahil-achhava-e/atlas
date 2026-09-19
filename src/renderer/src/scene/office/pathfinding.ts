// BFS pathfinding on a tile walkability grid.
// Ported verbatim from shahar061/the-office (office/engine/pathfinding.ts).

export interface Walkable {
  width: number;
  height: number;
  isWalkable(x: number, y: number): boolean;
}

interface Point {
  x: number;
  y: number;
}

const DIRECTIONS: Point[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

export function findPath(map: Walkable, start: Point, goal: Point): Point[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  if (!map.isWalkable(goal.x, goal.y)) return null;

  const key = (p: Point) => `${p.x},${p.y}`;
  const visited = new Set<string>();
  const parent = new Map<string, Point>();
  const queue: Point[] = [start];
  visited.add(key(start));

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const dir of DIRECTIONS) {
      const next: Point = { x: current.x + dir.x, y: current.y + dir.y };
      const nextKey = key(next);

      if (visited.has(nextKey) || !map.isWalkable(next.x, next.y)) continue;

      visited.add(nextKey);
      parent.set(nextKey, current);

      if (next.x === goal.x && next.y === goal.y) {
        return reconstructPath(parent, start, goal);
      }

      queue.push(next);
    }
  }

  return null;
}

function reconstructPath(parent: Map<string, Point>, start: Point, goal: Point): Point[] {
  const path: Point[] = [];
  let current = goal;
  const key = (p: Point) => `${p.x},${p.y}`;

  while (!(current.x === start.x && current.y === start.y)) {
    path.unshift(current);
    current = parent.get(key(current))!;
  }

  return path;
}

/**
 * Which of several destinations is CLOSEST, by walkable steps.
 *
 * Picking a café seat or an errand spot at random meant an agent could cross
 * the whole floor past three free ones — true of every trip and most obvious on
 * the coffee run. Distance here is steps actually walkable, not straight-line:
 * a spot on the other side of a wall is far, however near it looks.
 *
 * ONE flood fill, not one search per candidate. BFS expands in ring order, so
 * the first goal it reaches is the nearest one, and a list of twenty costs the
 * same as a list of one.
 *
 * Returns null when none of them can be reached — the caller keeps whatever it
 * would have done with no path at all.
 */
export function nearestReachable<T extends Point>(
  map: Walkable,
  start: Point,
  goals: readonly T[]
): T | null {
  if (goals.length === 0) return null;
  const at = new Map<string, T>();
  for (const g of goals) at.set(`${g.x},${g.y}`, g);
  // Standing ON one of them is the degenerate case, and it is the answer.
  const here = at.get(`${start.x},${start.y}`);
  if (here) return here;

  const visited = new Set<string>([`${start.x},${start.y}`]);
  const queue: Point[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dir of DIRECTIONS) {
      const next: Point = { x: current.x + dir.x, y: current.y + dir.y };
      const nextKey = `${next.x},${next.y}`;
      if (visited.has(nextKey)) continue;
      // A goal tile counts even if it is not walkable — a seat or a machine is
      // something you stand AT, and the caller already knows how to approach it.
      const goal = at.get(nextKey);
      if (goal) return goal;
      if (!map.isWalkable(next.x, next.y)) continue;
      visited.add(nextKey);
      queue.push(next);
    }
  }
  return null;
}
