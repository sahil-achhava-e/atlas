/**
 * SIMPLE MODE — which surfaces a non-technical user keeps.
 *
 * `config.audience === 'non-technical'` ("Explain things simply") stops being
 * only a copy register here: it decides what the app shows at all. The policy
 * lives in this module, away from the components, so it is one list to read and
 * one list to test rather than a condition repeated in every tab bar.
 *
 * The rule for what stays: it answers "what is my crew doing" or "what do I do
 * next". What goes is everything about how the crew is WIRED — a terminal, a
 * branch, a model id, a skill — which this person cannot act on and should not
 * have to scroll past. Nothing is deleted: turning the mode off brings all of it
 * back, and the switch that does so is in the one Settings section that stays.
 */

/** Command-centre tabs kept in simple mode. `terminal` survives because it is
 *  the pane that carries the composer — the only way to say anything to an
 *  agent. Its BODY folds the raw log away instead (see TechnicalLog). */
export const SIMPLE_MODE_CC_TABS: readonly string[] = ['terminal', 'human', 'tasks', 'floor', 'activity'];

/** Focus-view tabs kept in simple mode. Git goes: branches, staging and diffs
 *  are the one tab here that means nothing without knowing what a commit is. */
export const SIMPLE_MODE_SIDEBAR_TABS: readonly string[] = ['terminal', 'messages'];

/** Filter a tab list by the mode. Generic over the tab shape so the two bars can
 *  keep their own (quite different) row types. */
export function visibleTabs<T extends { key: string }>(
  tabs: readonly T[], kept: readonly string[], simpleMode: boolean
): T[] {
  return simpleMode ? tabs.filter((tab) => kept.includes(tab.key)) : [...tabs];
}

/**
 * The tab selection to hold after simple mode turns ON.
 *
 * Both tab choices are persisted, so without this a user who was last on `git`
 * or `skills` comes back to a blank pane with no tab lit — the bar no longer
 * renders the thing that is selected. Falling back to `human` ("Needs you")
 * rather than the first tab is deliberate: it is the one screen that might be
 * waiting on them.
 */
export function coerceTabsForSimpleMode(
  ccTab: string, sidebarTab: string
): { ccTab: string; sidebarTab: string } {
  return {
    ccTab: SIMPLE_MODE_CC_TABS.includes(ccTab) ? ccTab : 'human',
    sidebarTab: SIMPLE_MODE_SIDEBAR_TABS.includes(sidebarTab) ? sidebarTab : 'terminal'
  };
}
