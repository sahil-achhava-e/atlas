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

/**
 * A name for a workspace, taken from the projects it will work on.
 *
 * The folder is the thing you will recognise it by later, and "agents" tells you
 * nothing once there are three of them. One project is easy — its own name. For
 * several, the folder they share is usually the honest answer (~/code/api and
 * ~/code/web are the `code` crew), unless what they share is somewhere everyone
 * keeps everything: Desktop, Documents, Downloads, the home directory itself.
 * Naming a workspace after Desktop is worse than not guessing.
 *
 * ponytail: `GENERIC_PARENTS` is a list, not a rule. Add to it if a name looks
 * silly; it only ever changes a PREFILL the user can type over.
 */
const GENERIC_PARENTS = new Set([
  'desktop', 'documents', 'downloads', 'home', 'users', 'src', 'code', 'dev',
  'projects', 'repos', 'work', 'workspace', 'git', 'github'
]);

export function workspaceNameFromProjects(
  projects: readonly string[],
  taken: readonly string[] = []
): string {
  const paths = projects.map((p) => p.replace(/\/+$/, '')).filter(Boolean);
  if (paths.length === 0) return suggestWorkspaceName(taken);

  const pick = paths.length === 1 ? folderName(paths[0]) : (sharedParent(paths) ?? folderName(paths[0]));
  const name = cleanWorkspaceName(pick);
  if (!name) return suggestWorkspaceName(taken);
  return dedupe(name, taken);
}

/** The folder every path sits directly in, when there is one worth using. */
function sharedParent(paths: readonly string[]): string | null {
  const parents = new Set(paths.map((p) => p.slice(0, p.lastIndexOf('/'))));
  if (parents.size !== 1) return null;
  const parent = [...parents][0];
  const name = folderName(parent);
  // `/Users/someone` is a home directory; anything shallower is a system root.
  if (parent.split('/').filter(Boolean).length < 3) return null;
  return GENERIC_PARENTS.has(name.toLowerCase()) ? null : name;
}

/** `name`, or the first `name-N` nobody is using. */
function dedupe(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map(folderName));
  if (!used.has(name)) return name;
  for (let n = 2; n < 100; n++) if (!used.has(`${name}-${n}`)) return `${name}-${n}`;
  return `${name}-${Date.now()}`;
}

function folderName(path: string): string {
  return path.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? '';
}
