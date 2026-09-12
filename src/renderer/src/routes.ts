/** Screen routes, in the address bar.
 *
 *  Every full-page view has a name you can read: `/agent/pam/tasks` is a place,
 *  `127.0.0.1:5199` is not. Modals stay unrouted on purpose — a dialog is
 *  something you opened on top of a screen, not a screen, and a reload should
 *  put you back on the screen rather than on a half-answered question.
 *
 *  Real paths, no `#`. That needs something to answer `/agent/pam/tasks` on a
 *  reload: in dev the Vite server does, and a packaged build serves the same
 *  index.html for any in-app path from the custom scheme registered in
 *  src/main/index.ts. Change one and the other has to follow.
 *
 *  The words in the bar are the words on screen. The tab called Questions is
 *  `questions` here even though the code calls it `human`, and nothing says
 *  `god`: an orchestrator is an agent like the others, addressed by its id.
 */

/** The Command Center tabs, by their internal key. */
export type TabKey =
  | 'terminal' | 'human' | 'tasks' | 'floor' | 'memory'
  | 'graph' | 'activity' | 'workers' | 'triggers' | 'skills';

/** URL slug ⇄ tab key. The slug is what the tab is CALLED, which is not always
 *  what the code named it years ago. */
const SLUG_BY_TAB: Record<TabKey, string> = {
  terminal: 'terminal',
  human: 'questions',
  tasks: 'tasks',
  floor: 'team',
  memory: 'memory',
  graph: 'map',
  activity: 'events',
  workers: 'jobs',
  triggers: 'triggers',
  skills: 'skills'
};
const TAB_BY_SLUG: Record<string, TabKey> = Object.fromEntries(
  Object.entries(SLUG_BY_TAB).map(([tab, slug]) => [slug, tab as TabKey])
) as Record<string, TabKey>;

export function tabSlug(tab: TabKey): string { return SLUG_BY_TAB[tab] ?? 'terminal'; }
export function tabFromSlug(slug: string): TabKey | undefined { return TAB_BY_SLUG[slug]; }

/** An agent's slug for the address bar: its NAME, not its id. The orchestrator's
 *  id is the internal string 'god' and a worker's is a spawn id like
 *  `pty-pam-m2k1` — neither is something to put in front of someone. Two agents
 *  called the same thing resolve to the first match, which is the one the name
 *  means anyway. */
export function agentSlug(name: string, id: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || id;
}

export type Route =
  | { screen: 'setup'; step?: string }
  | { screen: 'workspaces' }
  | { screen: 'floor' }
  | { screen: 'agent'; agentId: string; tab?: TabKey }
  | { screen: 'focus'; agentId: string; tab?: TabKey }
  | { screen: 'ide'; agentId?: string };

export function routePath(r: Route): string {
  switch (r.screen) {
    case 'setup':      return r.step ? `/setup/${r.step}` : '/setup';
    case 'workspaces': return '/workspaces';
    case 'floor':      return '/floor';
    case 'agent':      return `/agent/${r.agentId}/${tabSlug(r.tab ?? 'terminal')}`;
    case 'focus':      return `/focus/${r.agentId}/${tabSlug(r.tab ?? 'terminal')}`;
    case 'ide':        return r.agentId ? `/ide/${r.agentId}` : '/ide';
  }
}

/** Null for anything we don't recognise, so a hand-typed path leaves the app
 *  where it is rather than throwing it somewhere blank. */
export function parseRoute(path: string = currentPath()): Route | null {
  const [screen, a = '', b = ''] = path.replace(/^\/+/, '').split('/');
  switch (screen) {
    case 'setup':      return { screen: 'setup', step: a || undefined };
    case 'workspaces': return { screen: 'workspaces' };
    case 'floor':      return { screen: 'floor' };
    case 'agent':      return a ? { screen: 'agent', agentId: a, tab: tabFromSlug(b) } : null;
    case 'focus':      return a ? { screen: 'focus', agentId: a, tab: tabFromSlug(b) } : null;
    case 'ide':        return { screen: 'ide', agentId: a || undefined };
    default: return null;
  }
}

/** Put a screen in the address bar. pushState so the back and forward gestures
 *  walk screens for free. `replace` is for CORRECTING the bar (a path nothing
 *  answers, a screen that no longer exists) — that is not a place you navigated
 *  to, so it should not become one you can go back to. */
export function go(r: Route, opts?: { replace?: boolean }): void {
  const path = routePath(r);
  if (currentPath() === path) return;
  // A packaged build is served from a custom scheme whose origin is the app
  // itself, so a root-relative path is always same-origin and pushState is
  // allowed. Anything unexpected must not take the screen down with it.
  try {
    if (opts?.replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
  } catch { /* an origin that refuses pushState: the screen still renders */ }
  window.dispatchEvent(new Event('cth:route'));
}

export function currentPath(): string {
  // Strip any legacy `#/office/...` so a bookmark from the hash days still
  // lands somewhere sensible rather than on an empty path.
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('/')) return hash;
  return window.location.pathname || '/';
}
