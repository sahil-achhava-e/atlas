/**
 * What may be deleted, and what may never be.
 *
 * Deleting a workspace removes a crew: every agent's memory and session history,
 * the inboxes, the task board, the hive's own git repo. There is no undo, so the
 * judgement about whether a given path is a workspace at all lives here, on its
 * own, where it can be tested — rather than inside the handler that does the
 * removing.
 *
 * TWO RULES, BOTH ABOUT NOT DELETING THE WRONG THING.
 *
 * A path must be one this install actually opened. Not "looks like a folder",
 * not "is under the home directory" — present in `recentHives`. A typo, a stale
 * renderer snapshot or a malformed argument then removes nothing.
 *
 * And the OPEN workspace is refused. Its services are running, its agents hold
 * live PTYs, and deleting the files under them leaves the app pointed at a home
 * that no longer exists. Resetting the app is the route for that one, and it
 * tears everything down in order before it removes a file.
 */

/** Subdirectories a workspace's crew lives in. Everything Atlas created, and
 *  NOTHING the user put there: a workspace folder can hold their own files, and
 *  a delete that took the folder itself would take those too. Mirrors what the
 *  app's own reset removes. */
export const WORKSPACE_DATA = [
  'hive', 'palace', 'roster.db', 'roster.db-wal', 'roster.db-shm', 'roster-backups'
] as const;

export interface DeleteCheck { ok: boolean; error?: string }

export function canDeleteWorkspace(
  path: string,
  ctx: { home: string | null; recents: readonly string[] }
): DeleteCheck {
  if (typeof path !== 'string' || !path.trim()) return { ok: false, error: 'No workspace given.' };
  if (ctx.home && path === ctx.home) {
    return { ok: false, error: 'That workspace is open. Reset the app to delete it.' };
  }
  if (!ctx.recents.includes(path)) {
    return { ok: false, error: 'Not a workspace this install has opened.' };
  }
  return { ok: true };
}
