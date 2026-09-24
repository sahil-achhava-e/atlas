/**
 * The inbox-wake nudge — the text queued for an agent that has unread hive mail,
 * and the predicate the message queue uses to keep only one of them pending.
 *
 * The nudge is QUEUED the moment fresh mail is seen but TYPED only once the agent
 * is idle and off cooldown, and it survives a renderer reload in the persisted
 * queue. By the time it lands, the agent has often already drained that mail and
 * filed it under `inbox/.done/` — so the nudge arrives against an inbox the agent
 * itself just emptied.
 */

/** The fixed head of every nudge; the ids that follow differ per nudge. */
const NUDGE_HEAD = 'You have new hive inbox message(s)';

/**
 * Build the nudge, naming the messages that prompted it.
 *
 * The ids are diagnostic, NOT a work list: they let an agent tell "I already
 * handled this last turn" (the id sits in `inbox/.done/`) from "the harness woke
 * me for nothing", which is the distinction it otherwise cannot make and burns a
 * round-trip guessing at. The pending inbox stays authoritative — an agent that
 * has a nudge suppressed by the one-pending rule below still finds its mail by
 * reading the directory, so the text must never invite it to stop at the ids.
 */
export function inboxNudgeText(ids: string[]): string {
  const named = ids.length ? ` — at least: ${ids.join(', ')}` : '';
  return `${NUDGE_HEAD}${named}. Read your inbox, act on what is pending there, and move handled ones to inbox/.done/. Your inbox directory is authoritative: work everything still pending in it, and if a named id is already in inbox/.done/ you handled it on an earlier turn and can ignore that one. Act autonomously; only message god if you genuinely need a decision.`;
}

/**
 * The message ids a nudge names, for the queue row that shows one.
 *
 * The composer prints queued text verbatim, which for a nudge is a 380-character
 * machine-written paragraph the human never wrote and cannot act on. Pulling the
 * ids out lets that row say what the nudge IS — three messages, named — with the
 * literal text still one click away, since that is what gets typed.
 *
 * Returns [] for a nudge built with no ids (`inboxNudgeText([])` omits the run
 * entirely) and for any text that is not a nudge.
 */
export function inboxNudgeIds(text: string): string[] {
  const m = /— at least: ([^.]+)\./.exec(text);
  if (!m) return [];
  return m[1].split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * God's mail is held until it settles, so a burst of worker reports costs one god
 * turn instead of one each. Every god turn re-reads god's whole context, and on
 * 2026-09-24 ten reports landing a minute or two apart cost ten turns at 500k+
 * tokens apiece. Workers are nudged at once; their turns are cheap and they are
 * the ones doing the work.
 */
export const GOD_MAIL_SETTLE_MS = 60_000;
/** Never hold god's mail longer than this, however steadily it keeps arriving. */
export const GOD_MAIL_MAX_HOLD_MS = 180_000;

export interface HeldMail { ids: string[]; firstAt: number; lastAt: number }

/**
 * Add fresh mail to god's hold and say whether to nudge now. Returns the ids to
 * name when the hold is released (quiet for GOD_MAIL_SETTLE_MS, or held for
 * GOD_MAIL_MAX_HOLD_MS), else null. Mutates `held`; the caller resets it on release.
 */
export function releaseHeldMail(held: HeldMail, freshIds: string[], now: number): string[] | null {
  if (freshIds.length) {
    if (!held.ids.length) held.firstAt = now;
    held.ids.push(...freshIds);
    held.lastAt = now;
  }
  if (!held.ids.length) return null;
  const quiet = now - held.lastAt >= GOD_MAIL_SETTLE_MS;
  const tooLong = now - held.firstAt >= GOD_MAIL_MAX_HOLD_MS;
  return quiet || tooLong ? held.ids : null;
}

/**
 * Is this queued text an inbox-wake nudge?
 *
 * Matches the fixed head only, since every nudge carries different ids — the
 * point is to recognise the COMMAND, not one instance of it. Mirrors
 * `isCompactionCommand`, and the queue's one-pending rule leans on it the same way.
 */
export function isInboxNudge(text: string): boolean {
  return text.trim().startsWith(NUDGE_HEAD);
}
