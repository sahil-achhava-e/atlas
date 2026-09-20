/**
 * Where a team leader sits.
 *
 * The floor has two small rooms off the main space, two desks each. The rule the
 * human asked for: a leader gets their OWN room, with the second desk left
 * empty. One project, one room; two projects, a room each; the third and fourth
 * leaders double up, because a shared office beats the open floor. Past four,
 * the overflow sits at the boardroom table, which is otherwise only used for
 * standups.
 *
 * Spreading out is the point, and it is the opposite of what this did first:
 * the rooms used to fill one at a time, so two leads shared a room while the
 * other stood empty. A lead's room is theirs, and the spare desk is for whoever
 * they are talking to.
 *
 * Pure, so the rule is testable without a map, a Pixi app or an agent.
 */

/** The four leader desks, in CLAIM order: the first seat of each room, then the
 *  second of each. Names are spawn points in office.tmj. */
export const LEAD_SEAT_NAMES: readonly string[] = [
  'desk-chief-architect',   // room one, seat one
  'desk-agent-organizer',   // room two, seat one
  'desk-ui-ux-expert',      // room one, seat two
  'warroom-seat'            // room two, seat two
];

/** Which room a given leader slot belongs to (1 or 2). Slots alternate rooms,
 *  so the parity is the room. */
export function roomOf(slot: number): 1 | 2 {
  return slot % 2 === 0 ? 1 : 2;
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
    roomOne: Math.ceil(seated / 2),
    roomTwo: Math.floor(seated / 2),
    boardroom: Math.max(0, leaderCount - LEAD_SEAT_NAMES.length)
  };
}
