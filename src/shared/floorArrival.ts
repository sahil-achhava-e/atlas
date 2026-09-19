/**
 * Whether the floor should play the morning, or just be there.
 *
 * The arrival — Atlas walks in, sits, then the rest file through the door two
 * seconds apart — is right once, when the app starts. On a page RELOAD it is
 * wrong: the agents never left, their processes have been running the whole
 * time, and replaying the morning says otherwise. It also costs ten seconds
 * before the floor is usable, every refresh.
 *
 * The signal is the main process's boot id. Same id as the page last saw means
 * the same process is still running — a reload of the window, nothing more.
 * A different id means main restarted, which is a genuine morning.
 */

/** @param bootId  this run of the main process
 *  @param seen    the id this browser recorded last, if any */
export function shouldPlayArrivals(bootId: string | undefined, seen: string | null): boolean {
  // No id to compare — an older main, or a read that failed. Play it: a morning
  // nobody asked for is a smaller wrong than agents appearing out of nowhere.
  if (!bootId) return true;
  return bootId !== seen;
}

/** Where the last seen boot id is kept. localStorage, not sessionStorage: a
 *  reload in a NEW tab is still a reload, and the floor should not replay the
 *  morning because the window is new. */
export const BOOT_ID_KEY = 'cth.lastBootId';
