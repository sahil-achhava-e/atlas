/**
 * What setup remembers across a reload.
 *
 * The step is already in the address bar, so a refresh lands on the right
 * screen — but every ANSWER lived in React state, so it landed there empty:
 * projects gone, engine back to the default, and the audience question again,
 * which sends you back to the start. In a browser tab a refresh is an ordinary
 * thing to do, so losing setup to one is not acceptable.
 *
 * Deliberately localStorage and not config: these are answers to a form that
 * has not been submitted. Nothing here reaches the app until Finish, and
 * Finish is what clears it.
 */

const KEY = 'cth.onboardingDraft';

export interface OnboardingDraft {
  audience?: 'technical' | 'non-technical';
  repos?: string[];
  workspace?: string;
  workspaceTyped?: boolean;
  godProvider?: string;
  godModel?: string;
  autoMode?: boolean;
  strongKeepalive?: boolean;
  notifications?: boolean;
}

export function readDraft(): OnboardingDraft {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    // Anything but an object is someone else's key, or a half-written one.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as OnboardingDraft : {};
  } catch { return {}; }
}

export function writeDraft(draft: OnboardingDraft): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(draft)); }
  catch { /* private window, or a full quota: setup still works, it just forgets */ }
}

export function clearDraft(): void {
  try { window.localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
