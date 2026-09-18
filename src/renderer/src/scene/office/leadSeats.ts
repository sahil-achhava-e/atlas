/**
 * Where a team leader sits.
 *
 * The floor has two small rooms off the main space, two desks each. The rule the
 * human asked for: leaders fill them a room at a time — one project, one leader
 * in the first room; two projects, that room is full; four, both rooms are. Past
 * four, the overflow sits at the boardroom table, which is otherwise only used
 * for standups.
 *
 * Filling ROOM BY ROOM rather than spreading out is the point: with two projects
 * you want both leads in one room talking to each other, not one each in two
 * half-empty offices.
 *
 * Pure, so the rule is testable without a map, a Pixi app or an agent.
 */

/** The four leader desks, in claim order: room one, then room two. Names are
 *  spawn points in office.tmj. */
export const LEAD_SEAT_NAMES: readonly string[] = [
  'desk-chief-architect',   // room one, seat one
  'desk-ui-ux-expert',      // room one, seat two
  'desk-agent-organizer',   // room two, seat one
  'warroom-seat'            // room two, seat two
];

/** Which room a given leader slot belongs to (1 or 2). */
export function roomOf(slot: number): 1 | 2 {
  return slot < 2 ? 1 : 2;
}

/**
 * The next free leader slot, or null when all four are taken.
 *
 * Null means "no office left" — the caller seats that leader in the boardroom
 * rather than dropping them on the open floor with the workers, because a leader
 * without a room should still read as a leader.
 */
export function nextLeadSlot(taken: ReadonlySet<number>): number | null {
  for (let i = 0; i < LEAD_SEAT_NAMES.length; i++) {
    if (!taken.has(i)) return i;
  }
  return null;
}

/** How the rooms end up occupied for a given number of leaders — the shape the
 *  seating rule promises, and what the tests assert against. */
export function roomOccupancy(leaderCount: number): { roomOne: number; roomTwo: number; boardroom: number } {
  const seated = Math.min(leaderCount, LEAD_SEAT_NAMES.length);
  return {
    roomOne: Math.min(seated, 2),
    roomTwo: Math.max(0, seated - 2),
    boardroom: Math.max(0, leaderCount - LEAD_SEAT_NAMES.length)
  };
}
