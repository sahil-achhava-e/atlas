/** Screen routes, in the address bar.
 *
 *  Every full-page view has a name you can read: `#/office/zoro-m2k1/git` is a
 *  place, `127.0.0.1:5199` is not. Modals stay unrouted on purpose — a dialog is
 *  something you opened on top of a screen, not a screen.
 *
 *  Hash, not path: a packaged build loads over `file://`, where there is no
 *  server to answer `/office`, and a path route would 404 on reload.
 */
import type { SidebarTab } from '@/store/store';

export type Route =
  | { screen: 'setup'; step?: string }
  | { screen: 'workspaces' }
  | { screen: 'office'; agentId?: string; tab?: SidebarTab }
  | { screen: 'focus'; agentId: string }
  | { screen: 'ide'; agentId?: string };

const TABS: SidebarTab[] = ['terminal', 'messages', 'traces', 'git'];

export function routePath(r: Route): string {
  switch (r.screen) {
    case 'setup':      return r.step ? `/setup/${r.step}` : '/setup';
    case 'workspaces': return '/workspaces';
    case 'focus':      return `/focus/${r.agentId}`;
    case 'ide':        return r.agentId ? `/ide/${r.agentId}` : '/ide';
    case 'office':     return r.agentId ? `/office/${r.agentId}/${r.tab ?? 'terminal'}` : '/office';
  }
}

/** Null for anything we don't recognise, so a hand-typed hash leaves the app
 *  where it is rather than throwing it somewhere blank. */
export function parseRoute(hash: string = window.location.hash): Route | null {
  const [screen, a = '', b = ''] = hash.replace(/^#\/?/, '').split('/');
  switch (screen) {
    case 'setup':      return { screen: 'setup', step: a || undefined };
    case 'workspaces': return { screen: 'workspaces' };
    case 'focus':      return a ? { screen: 'focus', agentId: a } : null;
    case 'ide':        return { screen: 'ide', agentId: a || undefined };
    case 'office':     return {
      screen: 'office',
      agentId: a || undefined,
      tab: TABS.includes(b as SidebarTab) ? (b as SidebarTab) : undefined
    };
    default: return null;
  }
}

/** Put a screen in the address bar. Assigning the hash pushes a history entry,
 *  so the back and forward gestures walk screens for free. `replace` is for
 *  CORRECTING the bar (an unknown hash, a screen that no longer exists) — that
 *  is not a place you navigated to, so it should not become one you can go back
 *  to. */
export function go(r: Route, opts?: { replace?: boolean }): void {
  const path = routePath(r);
  if (currentPath() === path) return;
  if (opts?.replace) window.history.replaceState(null, '', `#${path}`);
  else window.location.hash = path;
}

export function currentPath(): string {
  return window.location.hash.replace(/^#/, '');
}
