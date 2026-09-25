/**
 * CLEAR ON DONE — which agents to clear when a card reaches `done`.
 *
 * Context is the floor's biggest cost: across a week of transcripts the median
 * turn re-read 207k tokens and the output was under 0.4% of the input. Most of
 * that is history from cards already finished. A card going to `done` is the one
 * moment the harness knows an agent's context is spent, so that is when to clear.
 *
 * Pure: the caller reads the board and the registry, and owns the timer and the
 * delivery. Delivery rides the renderer queue, so a clear only lands at an idle
 * prompt.
 */

export interface ClearOnDoneCard {
  id: string;
  status: string;
  assignee?: string;
  reviewer?: string;
}

export interface ClearOnDoneAgent {
  archived?: boolean;
  isGod?: boolean;
  isLead?: boolean;
  isAssistant?: boolean;
}

/** Statuses that mean an agent still has live work on a card. `todo` is not one:
 *  a queued card has not been read yet, so a fresh session starts it cleaner. */
const LIVE = new Set(['in-progress', 'in-review', 'blocked']);

/**
 * `seen` is the set of card ids already known to be done. `null` means this is
 * the first look this session: it becomes the baseline and nothing is cleared,
 * so a restart never clears agents for cards that finished last week.
 */
export function agentsToClearOnDone(
  seen: Set<string> | null,
  cards: ClearOnDoneCard[],
  agents: Record<string, ClearOnDoneAgent | undefined>
): { clear: string[]; seen: Set<string> } {
  const done = new Set(cards.filter((c) => c.status === 'done').map((c) => c.id));
  if (seen === null) return { clear: [], seen: done };

  const busy = new Set<string>();
  for (const c of cards) {
    if (!LIVE.has(c.status)) continue;
    if (c.assignee) busy.add(c.assignee);
    if (c.reviewer && c.status === 'in-review') busy.add(c.reviewer);
  }

  const clear = new Set<string>();
  for (const c of cards) {
    if (c.status !== 'done' || seen.has(c.id)) continue;
    for (const id of [c.assignee, c.reviewer]) {
      if (!id || busy.has(id)) continue;
      const a = agents[id];
      // Leads and the orchestrator hold the picture of many cards at once, so
      // one card closing says nothing about their context being spent.
      if (!a || a.archived || a.isGod || a.isLead || a.isAssistant) continue;
      clear.add(id);
    }
  }
  return { clear: [...clear], seen: done };
}

/** Typed before the clear, so what the agent learned outlives it. */
export function saveBeforeClearNote(cardId: string): string {
  return `${cardId} is done and your context is about to be cleared. If you learned anything from it that the next card will need (a decision, a gotcha, a command that worked), add it to your memory.md now. Then reply with one line.`;
}
