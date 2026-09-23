/**
 * What counts as an OPEN ask on a task card, in one place.
 *
 * The rule used to live twice: `openQuestion()` in the renderer (which returned
 * only the LAST open entry) and nothing at all in main. That split is what let
 * two questions go missing (2026-09-23, TASK-EVENTS-13/14):
 *
 *   - A card can hold SEVERAL open asks. Answering the one the board showed made
 *     `openQuestion` fall through to an older entry from a different agent, so a
 *     question you had never seen appeared for a moment where the one you just
 *     answered had been.
 *   - It then vanished, because ASK ME only lists `status === 'blocked'` cards
 *     and the orchestrator had moved the card to `in-progress` on receiving the
 *     answer. The ask stayed open in the ledger and became unreachable: no way
 *     to answer it, no way to dismiss it.
 *
 * So: every open ask is a thing the human must see, and a card holding one
 * cannot leave `blocked`. Both halves are derived from the predicate here.
 *
 * Shared rather than renderer-local because main enforces the blocked rule on
 * the write path and the renderer lists the asks; a second copy of "is this
 * open?" is exactly how the two drifted apart.
 */

export interface HumanAsk {
  q: string;
  a?: string;
  by?: string;
  choices?: string[];
  multi?: boolean;
  askedAt?: string;
  answeredAt?: string;
  dismissedAt?: string;
}

/** Open = a real question, not answered, not dismissed. A dismissed ask counts
 *  as resolved, the same as an answered one: the human decided, and the text
 *  stays on the card as history either way. */
export function isOpenAsk(e: unknown): e is HumanAsk {
  if (!e || typeof e !== 'object') return false;
  const ask = e as HumanAsk;
  return typeof ask.q === 'string' && ask.q.trim() !== '' && !ask.a && !ask.dismissedAt;
}

/** Every open ask on a card, in ledger order.
 *
 *  Ledger order, NOT newest-first: a card's humanQA array is a conversation
 *  history and the entries are not reliably chronological (agents write their
 *  own `askedAt`, and some of them make it up). Callers that need an order sort
 *  explicitly — see askMeOrder.ts. */
export function openAsks(card: { humanQA?: unknown } | null | undefined): HumanAsk[] {
  const list = card && Array.isArray(card.humanQA) ? card.humanQA : [];
  return list.filter(isOpenAsk);
}

/**
 * A card with an unanswered question is blocked, whatever else anyone writes.
 *
 * Enforced on the ledger WRITE path, so it holds for every writer — the
 * orchestrator, a worker, the voice actions, a webhook, the board UI — instead
 * of only for the one the bug was noticed on. Answer every open ask, or dismiss
 * the ones that no longer matter, and the card is free to move again.
 *
 * `done` is not exempt. A card cannot be finished while it is still asking the
 * human something; if the question stopped mattering, dismissing it is one
 * click and leaves the text on the card.
 */
export function statusWithOpenAsks<T extends string>(status: T, card: { humanQA?: unknown }): T | 'blocked' {
  return openAsks(card).length > 0 ? 'blocked' : status;
}
