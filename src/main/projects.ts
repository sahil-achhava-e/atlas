/**
 * The folders an agent can be given as its working directory.
 *
 * A registered project is not always a repo. `~/Desktop/Acme-VMS` is a
 * container holding three of them, and the hire dialog offered only the folder
 * the human had registered — so an agent for `vms-backend` could not be pointed
 * at `vms-backend`, and git isolation had nothing to make a worktree from.
 *
 * So: list the registered folder AND the repositories directly inside it. One
 * level down only. Two levels is a `node_modules` crawl, and a repo nested
 * deeper than that is one the human can register itself.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

export interface ProjectEntry {
  path: string;
  /** Folder name, for the list. */
  name: string;
  /** Has a `.git`, so it can be branched, committed and worktree-isolated. */
  isRepo: boolean;
  /** Set on a repo found INSIDE a registered folder; the registered folder's path. */
  parent?: string;
}

function isGitRepo(dir: string): boolean {
  // `.git` is a directory in a normal clone and a FILE in a worktree. Either
  // one means git can work here.
  try { return existsSync(join(dir, '.git')); } catch { return false; }
}

/** Immediate subdirectories worth looking at: no dotfiles, no dependency trees. */
function childDirs(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((n) => !n.startsWith('.') && n !== 'node_modules')
      .map((n) => join(dir, n))
      .filter((p) => { try { return statSync(p).isDirectory(); } catch { return false; } })
      .sort();
  } catch {
    return [];
  }
}

/**
 * Every folder that can be an agent's cwd, in the order the list should show
 * them: each registered project, then the repos inside it.
 *
 * The registered folder is ALWAYS listed, repo or not — a lead sits at the
 * container root on purpose, where the API contract and the cross-repo docs
 * live, and an engineer inside one repo cannot see either.
 */
export function listProjectTree(roots: readonly string[]): ProjectEntry[] {
  const out: ProjectEntry[] = [];
  const seen = new Set<string>();
  for (const raw of roots) {
    const root = (raw ?? '').replace(/\/+$/, '');
    if (!root || seen.has(root)) continue;
    try { if (!statSync(root).isDirectory()) continue; } catch { continue; }
    seen.add(root);
    out.push({ path: root, name: basename(root), isRepo: isGitRepo(root) });
    for (const child of childDirs(root)) {
      if (seen.has(child) || !isGitRepo(child)) continue;
      seen.add(child);
      out.push({ path: child, name: basename(child), isRepo: true, parent: root });
    }
  }
  return out;
}
