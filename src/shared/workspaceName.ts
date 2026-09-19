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
  return workspaceNameFromProjects([], known);
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

  // One project names the crew. Several that live in one specific folder are
  // named after that folder. Several with nothing in common are NOT named after
  // whichever was added first — that one is not more important than the others,
  // and a crew called `api` that also works on `web` reads as a mistake.
  const subject = paths.length === 0 ? null
    : paths.length === 1 ? folderName(paths[0])
      : sharedParent(paths);

  const name = withSuffix(cleanWorkspaceName(subject ?? DEFAULT_NAME) || DEFAULT_NAME);
  return dedupe(name, taken);
}

/** What a workspace is called when nothing else names it. */
const DEFAULT_NAME = 'agents';

/** Every workspace folder ends the same way, so a folder full of them says what
 *  they are — and `~/Atlas/billing-workspace` reads as a workspace where
 *  `~/Atlas/billing` could be anything. Never doubled. */
export const WORKSPACE_SUFFIX = '-workspace';

function withSuffix(name: string): string {
  return name.toLowerCase().endsWith(WORKSPACE_SUFFIX) ? name : `${name}${WORKSPACE_SUFFIX}`;
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
