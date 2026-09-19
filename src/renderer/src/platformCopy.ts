/**
 * Which machine the copy is talking about.
 *
 * Several strings name the computer — "Stop the Mac sleeping" — and the app runs
 * on three platforms and, in browser mode, on a machine that may not be the one
 * showing the page. `window.cth.platform` is the SERVER's platform in browser
 * mode, which is the right answer: it is the machine that would be sleeping.
 */
export type OsKey = 'Mac' | 'Windows' | 'Linux';

export function osKey(): OsKey {
  const p = window.cth?.platform;
  return p === 'darwin' ? 'Mac' : p === 'win32' ? 'Windows' : 'Linux';
}

/** `keepAwake` → `keepAwakeMac` / `keepAwakeWindows` / `keepAwakeLinux`. */
export function osStringKey(base: string): string {
  return `${base}${osKey()}`;
}
