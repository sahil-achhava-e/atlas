import { useEffect, useState } from 'react';
import { WORKSPACE_ROOT } from '@shared/workspaceName';

/**
 * Names already taken under the workspace root.
 *
 * A prefilled name that happens to match one on disk is the worst kind of
 * wrong: pressing the button does not fail, it silently OPENS that workspace,
 * and you are looking at a crew you did not mean to open with work already in
 * it. So the suggestion has to know what is there, and the folders on disk are
 * the authority — a workspace this install has never listed is still a
 * workspace, and a listed one whose folder was deleted is not.
 *
 * Empty while it loads, and empty forever if the root does not exist yet, which
 * is the ordinary first-run case.
 */
export function useWorkspaceNames(): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const home = await window.cth.homeDir();
        if (!home) return;
        const root = WORKSPACE_ROOT.replace(/^~/, home);
        const res = await window.cth.listDir('/', root);
        if (cancelled || !res.ok) return;
        setNames(res.entries.filter((e) => e.isDir && !e.name.startsWith('.')).map((e) => e.name));
      } catch { /* no root yet, or no way to read it: nothing is taken */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return names;
}
