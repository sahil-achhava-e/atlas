/**
 * What a restart costs, computed once for every surface that offers one.
 *
 * Installing an update quits the app, and the agents ARE the processes: every
 * PTY dies. What survives is on disk — memory.md, the inbox, tasks.json, the
 * registry — and `RestoreTeamOnBoot` respawns the crew a couple of seconds after
 * the new version starts, with `sessionId` preserved so each one resumes its own
 * thread rather than a blank one. What does NOT survive is the turn in flight: an
 * agent mid-edit is killed mid-edit.
 *
 * So the rule this module encodes: an agent that is THINKING or WORKING has
 * something to lose, and an idle one does not. That distinction decides both
 * whether the update dialog offers a restart at all and what the confirmation
 * says.
 *
 * Kept out of the components so it can be tested without a renderer, and so the
 * dialog and Settings cannot drift into telling the user two different stories.
 */

/** The statuses that mean work is in flight right now.
 *
 *  'waiting' and 'blocked' are deliberately NOT here: those agents are parked on
 *  a question and have already written whatever they had. 'compacting' and
 *  'looping' are, because both are mid-operation — one is rewriting its own
 *  context, the other is being wound down by the breaker. */
export const WORKING_STATUSES: readonly string[] = ['thinking', 'working', 'compacting', 'looping'];

export interface RestartAgent {
  id: string;
  name: string;
  status: string;
}

/** The agents with something to lose, in roster order. */
export function workingAgents<T extends RestartAgent>(agents: readonly T[]): T[] {
  return agents.filter((a) => WORKING_STATUSES.includes(a.status));
}

/** At most this many names before the list becomes "and N others" — a warning
 *  nobody finishes reading is a warning nobody reads. */
const NAME_CAP = 4;

/** "Pam, Jim and 2 others" — the names, so the warning is about someone. */
export function nameList(agents: readonly RestartAgent[], andWord = 'and'): string {
  const names = agents.map((a) => a.name);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length <= NAME_CAP) {
    return `${names.slice(0, -1).join(', ')} ${andWord} ${names[names.length - 1]}`;
  }
  const rest = names.length - NAME_CAP;
  return `${names.slice(0, NAME_CAP).join(', ')} ${andWord} ${rest} ${rest === 1 ? 'other' : 'others'}`;
}

/**
 * Whether the update dialog should offer its own restart button.
 *
 * With work in flight it should not: the dialog interrupts you, and a button
 * that kills four running agents does not belong on something you did not open
 * deliberately. Settings keeps the restart, because going there is a decision.
 */
export function offerRestartInDialog(agents: readonly RestartAgent[]): boolean {
  return workingAgents(agents).length === 0;
}
