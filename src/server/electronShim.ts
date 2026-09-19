/**
 * Enough of Electron to run the main process WITHOUT Electron.
 *
 * WHY THIS EXISTS. The app is several binaries — the main process plus four
 * helper processes that draw the window — and an endpoint policy that permits
 * one and kills the others leaves the logic running with nothing to draw on. The
 * escape is to keep the same main-process code and put the UI in a browser: node
 * is already permitted everywhere the app is not.
 *
 * WHAT IT REPLACES. Very little, which is what makes this viable: the portable
 * half of `src/main` — the hive, the router, node-pty, the memory index, hooks,
 * skills — touches Electron only for `app.getPath` and for a WebContents to push
 * events at. Both are shimmed here; the server's bridge supplies the sink.
 *
 * WHAT IT DOES NOT DO. This is not an Electron emulator. BrowserWindow, the
 * protocol handler, the tray, the auto-updater and the native dialogs are absent
 * on purpose: a browser has its own window, its own downloads and its own
 * notifications, and an update is `git pull` here rather than a Squirrel handoff.
 * Anything that reaches for them must degrade, exactly as features already
 * degrade when a provider CLI is missing.
 *
 * The build aliases `electron` to this module for the server bundle, so nothing
 * in src/main needs a conditional import.
 */

import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

/** Where the app keeps its own state. Electron puts this under
 *  ~/Library/Application Support/<productName>; server mode uses the SAME
 *  directory, deliberately — running in a browser must not strand the config,
 *  the roster and the database the app wrote. */
function userDataDir(): string {
  const name = 'Atlas';
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', name);
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), name);
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), name);
}

const PATHS: Record<string, string> = {
  userData: userDataDir(),
  home: homedir(),
  temp: process.env.TMPDIR ?? '/tmp',
  appData: join(userDataDir(), '..'),
  exe: process.execPath,
  logs: join(userDataDir(), 'logs')
};

class AppShim extends EventEmitter {
  /** Server mode is always "packaged" in the sense that matters: it is not an
   *  `electron .` dev run, so paths resolve against the install, not a repo. */
  readonly isPackaged = true;

  getPath(name: string): string {
    const p = PATHS[name] ?? PATHS.userData;
    try { mkdirSync(p, { recursive: true }); } catch { /* best effort */ }
    return p;
  }

  getAppPath(): string { return process.cwd(); }
  getVersion(): string { return process.env.ATLAS_VERSION ?? '0.0.0-server'; }
  getName(): string { return 'Atlas'; }

  /** Electron resolves this when the process is ready to create windows. There
   *  are no windows here, so it is ready immediately. */
  whenReady(): Promise<void> { return Promise.resolve(); }

  quit(): void { process.exit(0); }
  exit(code = 0): void { process.exit(code); }
  setAsDefaultProtocolClient(): boolean { return false; }
  requestSingleInstanceLock(): boolean { return true; }
  /** No dock, no menu bar, no login items. */
  setLoginItemSettings(): void { /* not a desktop app here */ }
  getLoginItemSettings(): { openAtLogin: boolean } { return { openAtLogin: false }; }
  relaunch(): void { /* the operator restarts the server */ }
  focus(): void { /* nothing to focus */ }
  on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener) as this;
  }
}

export const app = new AppShim();

/** A desktop notification has no meaning in a headless server. The browser gets
 *  told through the event stream instead, where the page can raise a real Web
 *  Notification if the user allowed it. */
export class Notification {
  static isSupported(): boolean { return false; }
  constructor(public readonly options: { title?: string; body?: string } = {}) {}
  show(): void {
    notificationSink?.(this.options.title ?? '', this.options.body ?? '');
  }
}

let notificationSink: ((title: string, body: string) => void) | null = null;
/** The server registers a sink so main-process notifications reach the page. */
export function setNotificationSink(fn: (title: string, body: string) => void): void {
  notificationSink = fn;
}

/** `ipcMain.handle` is how the main process answers the renderer. The server's
 *  bridge reads this registry and exposes the same names over HTTP, so handlers
 *  written for Electron serve the browser unchanged. */
type Handler = (event: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();

export const ipcMain = {
  handle(channel: string, fn: Handler): void { handlers.set(channel, fn); },
  handleOnce(channel: string, fn: Handler): void { handlers.set(channel, fn); },
  removeHandler(channel: string): void { handlers.delete(channel); },
  on(): void { /* fire-and-forget channels are not used by the bridge yet */ },
  emit(): boolean { return false; }
};

/** Every channel the main process registered, for the bridge to dispatch to. */
export function ipcHandlers(): Map<string, Handler> { return handlers; }

/** The renderer sink. In Electron this is a WebContents; here it is whatever the
 *  bridge hands over, with the same two methods the main process actually uses. */
export interface RendererSink {
  send(channel: string, ...args: unknown[]): void;
  isDestroyed(): boolean;
}

export const shell = {
  openExternal(url: string): Promise<void> {
    // The page opens its own links; a server opening a browser on the host would
    // be the wrong machine in a remote session.
    console.log(`[server] openExternal ignored — the page handles links: ${url}`);
    return Promise.resolve();
  },
  showItemInFolder(): void { /* no file manager to drive */ },
  openPath(): Promise<string> { return Promise.resolve(''); }
};

/** Absent by design — see the header. Exported so an accidental import fails at
 *  the call site with a clear message rather than `undefined is not a function`. */
function absent(name: string): never {
  throw new Error(`[server] ${name} is not available in browser mode`);
}

export const BrowserWindow = new Proxy({}, { get: () => () => absent('BrowserWindow') });
export const dialog = {
  showOpenDialog: () => absent('dialog.showOpenDialog'),
  showMessageBox: () => absent('dialog.showMessageBox'),
  showSaveDialog: () => absent('dialog.showSaveDialog')
};
export const protocol = {
  registerSchemesAsPrivileged(): void { /* the server serves over http */ },
  handle(): void { /* ditto */ }
};
export const powerMonitor = new EventEmitter();
export const powerSaveBlocker = { start: () => -1, stop: () => { /* none */ }, isStarted: () => false };
export const screen = {
  getPrimaryDisplay: () => ({ workAreaSize: { width: 1440, height: 900 }, bounds: { x: 0, y: 0, width: 1440, height: 900 } }),
  getAllDisplays: () => []
};
export const clipboard = {
  readImage: () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) }),
  readText: () => '',
  writeText: () => { /* the page owns the clipboard */ }
};
export const nativeTheme = { shouldUseDarkColors: false, on: () => { /* none */ } };
export const Menu = { setApplicationMenu: () => { /* no menu bar */ }, buildFromTemplate: () => ({}) };
export const net = { request: () => absent('net.request') };
export const webUtils = { getPathForFile: () => '' };

export default {
  app, BrowserWindow, Notification, clipboard, dialog, ipcMain, Menu, nativeTheme,
  net, powerMonitor, powerSaveBlocker, protocol, screen, shell, webUtils
};
