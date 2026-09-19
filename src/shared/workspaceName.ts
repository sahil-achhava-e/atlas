/**
 * Where a new workspace goes, and what it may be called.
 *
 * Workspaces used to be loose folders: one in the home directory, one on the
 * Desktop, one in Documents, each named whatever seemed right that day. Nothing
 * about a folder said which app it belonged to, and the list in the picker was
 * the only thing tying them together.
 *
 * So new ones are made under a single root — `~/Atlas` — one folder per
 * workspace. The picker then asks for a NAME, not a path, and the answer to
 * "where is my crew" is always the same shape. Folders outside the root keep
 * working: "Open another folder" still takes any path, and every workspace made
 * before this one is untouched.
 */

/** The parent folder new workspaces are created in. Tilde form on purpose — it
 *  is shown in the UI, and main expands it before anything touches the disk. */
export const WORKSPACE_ROOT = '~/Atlas';

/** `~/Atlas/<name>`, with the name cleaned of anything that would make it a
 *  path rather than a folder: slashes, dots that climb, leading whitespace. */
export function workspacePath(name: string): string {
  return `${WORKSPACE_ROOT}/${cleanWorkspaceName(name)}`;
}

/** What a typed name becomes. Spaces are kept (a folder may have them); path
 *  separators are not, and neither is a leading dot — `../escape` has to end up
 *  as a folder in the root, not a way out of it, and `.hidden` is a folder the
 *  picker would then be unable to show. */
export function cleanWorkspaceName(name: string): string {
  return String(name ?? '')
    .replace(/[/\\]/g, '-')
    .replace(/^[.\-\s]+/, '')
    .trim();
}

/** The name to prefill. `agents` unless a workspace already goes by it, then
 *  `agents-2`, and so on — pressing New twice must not offer the folder just
 *  made, because opening that one would reuse its crew instead of starting. */
export function suggestWorkspaceName(known: readonly string[]): string {
  const taken = new Set(known.map(folderName));
  if (!taken.has('agents')) return 'agents';
  for (let n = 2; n < 100; n++) if (!taken.has(`agents-${n}`)) return `agents-${n}`;
  return `agents-${Date.now()}`;
}

function folderName(path: string): string {
  return path.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? '';
}
