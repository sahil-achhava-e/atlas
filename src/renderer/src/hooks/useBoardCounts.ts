import { useEffect, useState } from 'react';
import { openAsks } from '@shared/humanQA';
import { isOpenStatus } from '@shared/taskStatus';

export interface BoardCounts {
  /** Unanswered questions for the human, across every card. */
  asks: number;
  /** Cards that are still work: todo, in-progress, in-review, blocked. */
  openTasks: number;
}

/**
 * The two numbers the command-center tabs wear, from ONE read of the ledger.
 *
 * Deliberately one hook and one poll rather than a hook per badge. Both numbers
 * come from the same file, `hiveTasks()` is an IPC round trip that reads and
 * parses the whole ledger, and a second hook would double that every ten
 * seconds to answer a question the first read already contained.
 *
 * Both rules are imported, not restated. `asks` was re-implemented here once —
 * `status === 'blocked' && humanQA.some(e => e.q && !e.a)` — and drifted from
 * the board twice over: it counted an ask the human had dismissed, and it
 * counted cards where the board lists questions. `openTasks` uses the board's
 * own normalizer for the same reason, so the badge cannot disagree with the
 * column a card is sitting in.
 *
 * Polled rather than pushed because the ledger is a file the orchestrator
 * rewrites, and 10s is well inside the time it takes a person to notice a
 * number on a tab.
 */
export function useBoardCounts(): BoardCounts {
  const [counts, setCounts] = useState<BoardCounts>({ asks: 0, openTasks: 0 });
  useEffect(() => {
    let alive = true;
    const poll = async (): Promise<void> => {
      try {
        const raw = await window.cth.hiveTasks() as { tasks?: unknown } | null;
        const tasks = raw && Array.isArray(raw.tasks) ? raw.tasks : [];
        const next: BoardCounts = { asks: 0, openTasks: 0 };
        for (const t of tasks) {
          if (!t || typeof t !== 'object') continue;
          const card = t as { status?: unknown; humanQA?: unknown };
          next.asks += openAsks(card).length;
          if (isOpenStatus(card.status)) next.openTasks += 1;
        }
        if (alive) setCounts(next);
      } catch { /* ledger not ready — keep the last counts */ }
    };
    void poll();
    const iv = setInterval(() => { void poll(); }, 10_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  return counts;
}
