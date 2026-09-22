/**
 * The five columns of the board, and the one function that decides which one a
 * card is in.
 *
 * WHY A NORMALIZER AND NOT JUST A TYPE. Nothing owns `tasks.json`. Atlas writes
 * it, project leads write it, engineers patch their own card, and the kanban,
 * the voice tools and a webhook all write through the harness. They are agents:
 * they will write "doing" because that is the word they learned, or "In Review"
 * because that is the column they can see. A card whose status does not match
 * an exact literal used to fall back to `todo`, which reads as work being
 * silently un-done — so every read goes through `normalizeStatus`, and the
 * aliases below are the vocabulary the floor actually uses.
 *
 * The review lane is the point of the five columns: an engineer opens the PR
 * and moves the card to `in-review`, the lead names a `reviewer`, the reviewer
 * reports back, and the lead closes it. The card never waits on a merge.
 */

export const TASK_STATUSES = ['todo', 'in-progress', 'in-review', 'blocked', 'done'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Every spelling seen in the wild, plus the old two-word statuses. Keys are
 *  matched after lowercasing and collapsing spaces/underscores to hyphens. */
const ALIASES: Record<string, TaskStatus> = {
  'to-do': 'todo',
  backlog: 'todo',
  queued: 'todo',
  open: 'todo',
  // `doing` is what the board was called before the review lane existed, and it
  // is written into every agent's memory.md that predates it.
  doing: 'in-progress',
  'in-prog': 'in-progress',
  progress: 'in-progress',
  wip: 'in-progress',
  started: 'in-progress',
  active: 'in-progress',
  review: 'in-review',
  reviewing: 'in-review',
  'code-review': 'in-review',
  'pr-review': 'in-review',
  'awaiting-review': 'in-review',
  'needs-review': 'in-review',
  stuck: 'blocked',
  waiting: 'blocked',
  complete: 'done',
  completed: 'done',
  closed: 'done',
  finished: 'done',
  merged: 'done'
};

/** The status this text means, or null when it means nothing we know. Callers
 *  that can refuse (the voice action, a form) use this; callers that must place
 *  a card somewhere use `normalizeStatus`. */
export function matchStatus(raw: unknown): TaskStatus | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if ((TASK_STATUSES as readonly string[]).includes(key)) return key as TaskStatus;
  return ALIASES[key] ?? null;
}

/** Which column a card belongs in. Anything unrecognisable is `todo`: an
 *  unplaceable card must still appear somewhere a person can see it. */
export function normalizeStatus(raw: unknown): TaskStatus {
  return matchStatus(raw) ?? 'todo';
}

/** True when the value is already one of the five, exactly. Used by the
 *  migration to decide whether a stored card needs rewriting. */
export function isCanonicalStatus(raw: unknown): raw is TaskStatus {
  return typeof raw === 'string' && (TASK_STATUSES as readonly string[]).includes(raw);
}
