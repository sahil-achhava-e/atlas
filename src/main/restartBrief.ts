/**
 * The message Atlas gets when the app comes back up with work left in flight.
 *
 * WHAT A RESTART ACTUALLY COSTS. Quitting kills every PTY, so an agent mid-task
 * is killed mid-task. What survives is on disk — tasks.json, board.md, each
 * agent's memory.md, the mailboxes — and the crew is respawned with `sessionId`
 * preserved, so each one resumes its own thread. The hole is that nobody TELLS
 * them to carry on: WorkerWakeWatchdog only wakes an agent with undrained inbox
 * mail, and an agent killed mid-turn has none. Its card still says "doing" and it
 * sits at its prompt.
 *
 * WHY THIS GOES TO GOD AND NOT TO EACH AGENT. Nudging every interrupted agent
 * directly would have them all resume at once with nobody reconciling the board,
 * and would put a second writer on tasks.json — the one invariant the hive is
 * built on (god is the sole scribe). Atlas already holds this brief: the hourly
 * standup asks it to check who is doing what and re-engage anyone stalled. This
 * only fixes the CLOCK — that brief fires hourly, and a restart is not on the
 * hour. One message, written from the ledger, and Atlas applies its own judgement:
 * a card can be finished-but-unmarked, which a blind per-agent nudge cannot tell
 * from an interrupted one.
 *
 * Pure, so the interesting part — who belongs in the brief — is testable without
 * a hive, a PTY or an Electron app.
 */

/** The fields this reads off a task card. The ledger carries more. */
export interface BriefTask {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  assignee?: unknown;
}

/** The fields this reads off the registry. */
export interface BriefAgent {
  id: string;
  name?: string;
  isGod?: boolean;
  archived?: boolean;
}

export interface InterruptedItem {
  agentId: string;
  agentName: string;
  taskId: string;
  title: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * The cards that were in flight, paired with the agent holding them.
 *
 * Only 'doing' counts. 'todo' was never started, 'blocked' is parked on a human
 * and resuming it would just re-ask the question, and 'done' is done. A card
 * whose assignee is gone from the roster (agent deleted while the app was shut)
 * is dropped rather than reported against a name that no longer exists.
 */
export function interruptedWork(
  tasksDoc: unknown,
  agents: readonly BriefAgent[]
): InterruptedItem[] {
  const list = (tasksDoc as { tasks?: unknown })?.tasks;
  if (!Array.isArray(list)) return [];
  const byId = new Map(agents.filter((a) => !a.archived && !a.isGod).map((a) => [a.id, a]));

  const out: InterruptedItem[] = [];
  const seen = new Set<string>();
  for (const raw of list as BriefTask[]) {
    if (str(raw?.status) !== 'doing') continue;
    const assignee = str(raw?.assignee);
    if (!assignee) continue;
    const agent = byId.get(assignee);
    if (!agent) continue;
    const taskId = str(raw?.id);
    const key = `${assignee}:${taskId}`;
    if (seen.has(key)) continue;       // a duplicated card id must not double-report
    seen.add(key);
    out.push({
      agentId: agent.id,
      agentName: str(agent.name) || agent.id,
      taskId: taskId || '(no id)',
      title: str(raw?.title) || '(untitled card)'
    });
  }
  return out;
}

/**
 * The brief itself, or null when there is nothing to say.
 *
 * Null is the common case — most restarts happen on a quiet floor — and it
 * matters that nothing is sent then: a message that arrives after every launch
 * saying "nothing happened" is the kind of noise that gets a channel ignored.
 *
 * The re-check instruction is the load-bearing sentence. The one thing genuinely
 * lost in a kill is the half-finished turn, so an agent may have written half a
 * file, or finished the work and died before marking the card.
 */
export function restartBrief(items: readonly InterruptedItem[]): string | null {
  if (items.length === 0) return null;
  const lines = items.map((i) => `- ${i.agentName} (\`${i.agentId}\`) — ${i.taskId}: ${i.title}`);
  return [
    'Atlas restarted. These agents were mid-task when it stopped, so each was killed part-way '
      + 'through a turn and is now back at an idle prompt with its own thread resumed:',
    '',
    ...lines,
    '',
    'Before re-engaging anyone: check each card against what is actually on disk. A card can '
      + 'read "doing" because the work finished and the agent died before marking it, or because '
      + 'an edit landed half-written. Correct the ledger first, then dispatch whoever still has '
      + 'work left — and tell them what was interrupted rather than restating the whole task.'
  ].join('\n');
}

/**
 * A stable signature of the brief's content, so the same interrupted work is not
 * reported twice.
 *
 * A quick relaunch (an update installs, the app reopens) would otherwise post a
 * second identical brief before god has drained the first, and two copies of
 * "re-engage these three" invites two dispatches of the same card.
 */
export function briefSignature(items: readonly InterruptedItem[]): string {
  return items.map((i) => `${i.agentId}:${i.taskId}`).sort().join('|');
}
