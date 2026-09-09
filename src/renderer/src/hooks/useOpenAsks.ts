import { useEffect, useState } from 'react';

/** How many cards are waiting on the HUMAN right now.
 *
 *  Same rule the office floor's ASK ME board counts by: a blocked task with a
 *  question nobody has answered. Polled rather than pushed because the ledger is
 *  a file the orchestrator rewrites, and 10s is well inside the time it takes a
 *  person to notice a number on a tab.
 */
export function useOpenAsks(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const poll = async (): Promise<void> => {
      try {
        const raw = await window.cth.hiveTasks() as {
          tasks?: Array<{ status?: string; humanQA?: Array<{ q?: string; a?: string }> }>
        } | null;
        const tasks = raw && Array.isArray(raw.tasks) ? raw.tasks : [];
        const n = tasks.filter((t) =>
          String(t?.status) === 'blocked'
          && Array.isArray(t?.humanQA)
          && t.humanQA.some((e) => e && typeof e.q === 'string' && !e.a)
        ).length;
        if (alive) setCount(n);
      } catch { /* ledger not ready — keep the last count */ }
    };
    void poll();
    const iv = setInterval(() => { void poll(); }, 10_000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  return count;
}
