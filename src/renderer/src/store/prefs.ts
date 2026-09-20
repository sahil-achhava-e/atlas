/**
 * Preferences — theme, language, terminal font size, which pane you had open.
 *
 * These live in the app's database (main process), not in localStorage.
 * localStorage is partitioned by ORIGIN, and the desktop app, the dev server and
 * browser mode are three different origins onto the SAME hive: choosing dark
 * mode in one left the others in light, and it looked like the setting had not
 * saved.
 *
 * Read ONCE, synchronously, at module load, into `cache`. Every getter is then a
 * plain object lookup, which is what lets a preference be read where a promise
 * cannot be awaited — a zustand initialiser, a module-level constant, the first
 * paint. Writes go through to main and update the cache in the same breath.
 *
 * What stays in localStorage: the onboarding draft (a form being filled in,
 * which is finished or abandoned before there is a workspace to store it in) and
 * one-shot boot flags. Nothing durable.
 */

/** Every key this module owns. Listed rather than free-form so a typo is a
 *  compile error and the localStorage adoption below knows what to look for. */
export const PREF_KEYS = {
  theme: 'cth.theme',
  language: 'cth.language',
  terminalFontSize: 'cth.ptyFontSize',
  arabicTerminal: 'cth.arabicTerminal',
  focusMode: 'cth.prefersFocusMode',
  sidebarWidth: 'cth.sidebarWidth',
  sidebarTab: 'cth.sidebarTab',
  ccTab: 'cth.ccTab',
  ideMdView: 'cth.ide.mdView',
  ideGitRailCollapsed: 'cth.ide.gitRailCollapsed',
  tasksView: 'cth.tasks.view'
} as const;

export type PrefKey = typeof PREF_KEYS[keyof typeof PREF_KEYS];

const cache: Record<string, string> = (() => {
  try { return { ...(window.cth?.prefsAllSync?.() ?? {}) }; } catch { return {}; }
})();

/** One-time adoption of what localStorage already held, so nobody's theme or
 *  language resets on the upgrade. Runs per origin: whichever window opens
 *  first hands its settings over, and the others find them already there. */
(() => {
  for (const key of Object.values(PREF_KEYS)) {
    if (cache[key] !== undefined) continue;
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(key); } catch { /* private window */ }
    if (stored === null) continue;
    cache[key] = stored;
    void window.cth?.prefsSet?.(key, stored);
  }
})();

export function getPref(key: PrefKey): string | null {
  return cache[key] ?? null;
}

export function setPref(key: PrefKey, value: string): void {
  cache[key] = value;
  void window.cth?.prefsSet?.(key, value)?.catch(() => { /* the cache still has it */ });
}

export function clearPref(key: PrefKey): void {
  delete cache[key];
  void window.cth?.prefsSet?.(key, null)?.catch(() => { /* noop */ });
}
