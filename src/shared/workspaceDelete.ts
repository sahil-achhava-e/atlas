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

/** What Atlas puts inside a workspace. Used to clear out a folder the user
 *  pointed at from somewhere else, where the folder itself is theirs and may
 *  hold their own files. A workspace Atlas created goes entirely — see
 *  `isManagedWorkspace`. Mirrors what the app's own reset removes. */
export const WORKSPACE_DATA = [
  'hive', 'palace', 'roster.db', 'roster.db-wal', 'roster.db-shm', 'roster-backups'
] as const;

/**
 * Is this a workspace Atlas created, under `~/Atlas`?
 *
 * Deleting one means deleting the FOLDER, not just scrubbing the crew out of
 * it: a folder left behind holds the name, so re-creating a workspace you just
 * deleted was refused as already taken. `~/Atlas/<name>` only ever exists
 * because the app made it, so taking the whole thing is what the human means
 * by delete.
 *
 * A folder they chose themselves is a different promise — it can sit inside a
 * project, next to their own files — so there only Atlas's own data is removed.
 * `~/Atlas` itself is not a workspace, and neither is anything nested deeper
 * than one level under it.
 */
export function isManagedWorkspace(target: string, homeDir: string): boolean {
  if (!target || !homeDir) return false;
  const root = `${homeDir.replace(/\/+$/, '')}/Atlas/`;
  if (!target.startsWith(root)) return false;
  const rest = target.slice(root.length).replace(/\/+$/, '');
  return rest.length > 0 && !rest.includes('/');
}

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
