/**
 * Which setup you get, and in what order.
 *
 * The audience question is asked in its own dialog before the wizard, and its
 * answer decides the steps — so the order cannot be a module constant any more.
 * It lives here, away from the 1200-line wizard, for the same reason focusMode
 * does: it is the part with a rule in it, and a rule deserves a test.
 *
 * The rail, the "Step n of m" counter, the progress bar, Back, Continue and
 * Finish all walk the list `stepsFor` returns. That is the single source of
 * order it has always been; only its input changed.
 */

export type Audience = 'technical' | 'non-technical';

/** 'done' is the finish screen, not a step you sit on, so it is in the type but
 *  never in a list. 'persona' is the dialog, which is not part of any setup. */
export type Step = 'persona' | 'welcome' | 'home' | 'orchestrator' | 'repos' | 'permissions' | 'away' | 'done';

/**
 * A non-technical setup drops 'permissions'.
 *
 * Simple mode runs with autonomy ON and keeps it there: a permission prompt is
 * answered by typing into the agent's terminal, and that mode folds the terminal
 * away, so an agent that stops to ask would park behind a question its user
 * cannot see. Asking here and then overriding the answer would be a screen that
 * lies; `finish()` writes autoMode: true for this audience instead, and the Auto
 * mode tile on the welcome step says so in plain words.
 *
 * Home sits last in both, for the reason it always did: the folder is the one
 * answer that is easier to give once you know what is going into it.
 */
export function stepsFor(audience: Audience): Step[] {
  return audience === 'non-technical'
    ? ['welcome', 'orchestrator', 'repos', 'away', 'home']
    : ['welcome', 'orchestrator', 'repos', 'permissions', 'away', 'home'];
}

export function nextStep(steps: Step[], step: Step): Step {
  const i = steps.indexOf(step);
  return i < 0 || i === steps.length - 1 ? 'done' : steps[i + 1];
}

export function prevStep(steps: Step[], step: Step): Step {
  const i = steps.indexOf(step);
  return i <= 0 ? steps[0] : steps[i - 1];
}
