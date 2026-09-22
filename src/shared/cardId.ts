/**
 * Card ids: `TASK-<PROJECT>-<n>`.
 *
 * Until now nobody minted these. Atlas and the leads invented an id each time
 * they wrote a card, so the board read `vms-sec-1`, `wi-7670`, `pr-2115-review`
 * — fine to read, impossible to order, and dangerous: `mergeTaskLedger` merges
 * by id, so two agents inventing the same slug silently merge two different
 * cards into one. One allocator, one number line per project, no reuse.
 *
 * THE COUNTER IS STORED, NOT DERIVED. `tasks.json` carries a `counters` map, so
 * deleting `TASK-EVENTS-3` does not hand its number to the next card. The scan
 * of existing ids is a floor under the counter, never a substitute for it — a
 * hand-written `TASK-EVENTS-9` has to push the counter past 9 or the next
 * allocation would collide with it.
 */

export const CARD_ID_RE = /^TASK-([A-Z][A-Z0-9]{1,11})-([1-9][0-9]*)$/;

/** Is this already one of ours? */
export function isCardId(id: unknown): id is string {
  return typeof id === 'string' && CARD_ID_RE.test(id);
}

/** The project code inside a card id, or null when it is not one of ours. */
export function codeOf(id: unknown): string | null {
  const m = typeof id === 'string' ? CARD_ID_RE.exec(id) : null;
  return m ? m[1] : null;
}

/**
 * A usable code from a project folder name, for a project the human has not
 * given one to yet. `epicxp-events` → `EPICXPEVENTS`; it is a starting point,
 * not a good name, and Settings is where it gets shortened to `EVENTS`.
 */
export function defaultCode(projectPath: string): string {
  const leaf = String(projectPath ?? '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';
  const code = leaf.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  if (!code || !/^[A-Z]/.test(code)) return `P${code}`.slice(0, 12);
  return code;
}

/** A code the human typed, or null when it cannot be used. Uniqueness is the
 *  caller's business — two projects sharing a code share a number line. */
export function cleanCode(raw: unknown): string | null {
  const code = String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 2 || code.length > 12 || !/^[A-Z]/.test(code)) return null;
  return code;
}

export interface Allocation {
  id: string;
  /** The counters map to store back, with this project's number advanced. */
  counters: Record<string, number>;
}

/**
 * The next id for a project.
 *
 * @param code       the project's code, already cleaned
 * @param existingIds every id on the board — so a hand-written high number can
 *                    never be handed out a second time
 * @param counters   the stored counters map (missing is fine)
 */
export function nextCardId(
  code: string,
  existingIds: readonly unknown[] = [],
  counters: Record<string, number> = {}
): Allocation {
  const stored = Number(counters?.[code]);
  let highest = Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
  for (const id of existingIds) {
    const m = typeof id === 'string' ? CARD_ID_RE.exec(id) : null;
    if (m && m[1] === code) highest = Math.max(highest, Number(m[2]));
  }
  const n = highest + 1;
  return { id: `TASK-${code}-${n}`, counters: { ...counters, [code]: n } };
}
