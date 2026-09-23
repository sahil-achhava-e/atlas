/**
 * Which agents the focus-mode switcher offers, and in what order.
 *
 * Focus mode has no way to change agent: you press Esc, find the agent in the
 * sidebar, click it, and press focus again. A comment in FullscreenTerminal
 * says the agents "moved into the bar above, where they cost a row instead of a
 * column" — they never did; the app title bar carries the workspace name, a
 * fleet readout, theme and settings, and no agents. This is the rule half of
 * making that true.
 *
 * Kept out of the component, and structural rather than typed against `Agent`,
 * so the rules are testable without dragging React or zustand into a unit test.
 * Same reasoning as `store/focusMode.ts` and `components/askMeOrder.ts`.
 */

/** The subset of an agent these rules need. */
export interface SwitchCandidate {
  id: string;
  name: string;
  character: string;
  accent: string;
  status: string;
  /** Present once the agent has a terminal in the main process. */
  ptyId?: string;
  isGod?: boolean;
  archived?: boolean;
}

export interface SwitchOption extends SwitchCandidate {
  /** This is the agent focus mode is showing right now. */
  current: boolean;
  /** Stalled on the human. `blocked` is the one status that means YOU are the
   *  thing in the way — it shares the "away" colour with waiting and looping,
   *  and is the only one of the three pointed at a person. */
  needsYou: boolean;
}

/**
 * The switch targets, in the order they are listed.
 *
 * Three rules, and the reason for each:
 *
 *  - **Only agents with a `ptyId`, never an archived one.** The menu exists to
 *    switch, and `FullscreenTerminal` renders nothing for an agent without a
 *    terminal — it re-homes away from one. An entry that cannot be switched to
 *    is a dead control, so an agent waiting on a respawn is left out rather
 *    than listed greyed.
 *  - **The orchestrator first.** It is the one agent you come back to between
 *    every other, and a fixed first position means the target does not move
 *    under the cursor as the roster reorders itself.
 *  - **Everyone else keeps roster order.** The floor, the sidebar and this menu
 *    then agree, so the third entry is the third agent wherever you look.
 *    Sorting by status here would make entries swap places whenever an agent
 *    started or finished work, which is the one thing a switch target must
 *    never do.
 */
export function switchOptions(
  agents: SwitchCandidate[],
  fullscreenAgentId: string | null
): SwitchOption[] {
  const live = agents.filter((a) => !!a.ptyId && !a.archived);
  const gods = live.filter((a) => a.isGod);
  const rest = live.filter((a) => !a.isGod);
  return [...gods, ...rest].map((a) => ({
    ...a,
    current: a.id === fullscreenAgentId,
    needsYou: a.status === 'blocked'
  }));
}

/**
 * Is there anywhere to switch TO?
 *
 * One switchable agent is the agent you are already looking at, so the trigger
 * stays an ordinary readout rather than becoming a menu that opens onto a list
 * of one.
 */
export function canSwitch(options: SwitchOption[]): boolean {
  return options.length > 1;
}
