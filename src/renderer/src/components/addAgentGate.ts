/**
 * Which step of Add agent you are allowed to open.
 *
 * The modal has four steps and two ways to move between them — the Next button
 * and the rail down the left — and they used to disagree. The rail was gated on
 * identity alone, so Briefing (and Hire) was reachable with no folder chosen;
 * the folder was then checked at submit, which bounced you back three steps to
 * be told "Pick a folder first". Both now read one answer, computed here.
 *
 * The rule: a step opens once every step BEFORE it is answered. Which is why
 * this takes the readiness of each, not the index of one.
 */

export type SectionKey = 'identity' | 'workspace' | 'engine' | 'briefing';

/** Step order. The modal owns the labels; this owns the sequence. */
export const SECTION_ORDER: SectionKey[] = ['identity', 'workspace', 'engine', 'briefing'];

/**
 * The steps this audience gets.
 *
 * Simple mode drops 'engine'. That step is a provider, a model id, the raw
 * spawn command and an auto-mode flag — four answers the workspace already gave
 * during setup, and the only screen in this dialog that cannot be answered
 * without knowing what a CLI is. The values still ride along: the form's state
 * is seeded from the workspace's engine and model either way, so an agent added
 * in simple mode runs exactly what one added in technical mode would.
 */
export function sectionsFor(simpleMode: boolean): SectionKey[] {
  return simpleMode ? SECTION_ORDER.filter((k) => k !== 'engine') : SECTION_ORDER;
}

/**
 * May `key` be opened, given what each step currently has?
 *
 * The first step is always open — there is nothing before it to answer.
 */
export function canOpenSection(
  ready: Record<SectionKey, boolean>, key: SectionKey, sections: SectionKey[] = SECTION_ORDER
): boolean {
  const i = sections.indexOf(key);
  if (i < 0) return false;
  return sections.slice(0, i).every((k) => ready[k]);
}
