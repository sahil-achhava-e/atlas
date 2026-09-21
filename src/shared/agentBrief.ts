/**
 * An agent's briefing: the three questions the hire dialog asks, and the one
 * string they are stored as.
 *
 * The hire dialog composes them into a single `goal`, because that is what
 * reaches the engine — one block of standing instructions at the top of every
 * prompt. Edit Agent then showed that block raw, in a box labelled "Goal", so
 * the human could not find the part they had written under "When is it
 * finished?" and reasonably concluded it had been dropped.
 *
 * So the format lives here, with the function that takes it apart again. Both
 * dialogs use both, which is what keeps them from drifting: a change to the
 * wording of the composed text would otherwise break a parser written against
 * the old wording, silently, and the human would lose the section again.
 *
 * `split` is deliberately conservative. A briefing that does not match the
 * shape — one pasted in whole, one from a hire manifest, one edited by hand
 * into something else — comes back as `raw`, and the caller shows a single box
 * rather than guessing where to cut it.
 */

export const DEFAULT_DONE =
  'a pushed branch and an open pull request, never merged, with a note on what you verified';
export const DEFAULT_ASK =
  'something destructive, a schema change against real data, spending money, or a conflict you cannot resolve';

const DONE_PREFIX = 'Done means: ';
const ASK_PREFIX = 'Ask the human when: ';
/** The sentence the dialog adds when the agent is pinned to one project. */
export function projectLine(project: string): string {
  return `You work only in ${project}. If something belongs to another project, `
    + 'send it to Atlas rather than doing it yourself.';
}

export interface AgentBrief {
  /** What it does, every time. The bulk of the briefing. */
  job: string;
  /** Folder name, or empty when the agent is not pinned to one. */
  project?: string;
  /** What it hands back before it stops. */
  done?: string;
  /** When it interrupts the human. */
  ask?: string;
}

/** The three answers, as the one string the engine is given. */
export function composeBrief(brief: AgentBrief): string {
  return [
    brief.job.trim(),
    brief.project ? projectLine(brief.project) : '',
    brief.done?.trim() ? `${DONE_PREFIX}${brief.done.trim()}` : '',
    `${ASK_PREFIX}${brief.ask?.trim() || DEFAULT_ASK}`
  ].filter(Boolean).join('\n\n');
}

export interface SplitBrief extends AgentBrief {
  /** Set when the text is not in the composed shape; show it as one box. */
  raw?: string;
}

/** Take a stored briefing apart, or report that it cannot be. */
export function splitBrief(goal: string | undefined): SplitBrief {
  const text = (goal ?? '').trim();
  if (!text) return { job: '' };

  const doneAt = text.indexOf(`\n\n${DONE_PREFIX}`);
  const askAt = text.indexOf(`\n\n${ASK_PREFIX}`);
  // Neither marker: nothing to take apart, and a half-match is not worth
  // guessing at — an edited briefing must not lose a paragraph to a parser.
  if (doneAt === -1 && askAt === -1) return { job: text, raw: text };

  const head = text.slice(0, doneAt === -1 ? askAt : doneAt).trim();
  const done = doneAt === -1
    ? ''
    : text.slice(doneAt + 2 + DONE_PREFIX.length, askAt === -1 ? undefined : askAt).trim();
  const ask = askAt === -1 ? '' : text.slice(askAt + 2 + ASK_PREFIX.length).trim();

  // The project sentence is generated, not written, so it is lifted back out
  // rather than left sitting at the end of the job text where an edit would
  // duplicate it on the next save.
  const lines = head.split('\n\n');
  const last = lines[lines.length - 1]?.trim() ?? '';
  const m = /^You work only in (.+?)\. If something belongs to another project,/.exec(last);
  if (m) lines.pop();

  return {
    job: lines.join('\n\n').trim(),
    project: m?.[1],
    done: done || undefined,
    ask: ask || undefined
  };
}
