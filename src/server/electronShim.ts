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
import { join, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

/** Where the app keeps its own state. Electron puts this under
 *  ~/Library/Application Support/<productName>; server mode uses the SAME
 *  directory, deliberately — running in a browser must not strand the config,
 *  the roster and the database the app wrote. */
function userDataDir(): string {
  const parent = process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support')
    : process.platform === 'win32'
      ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : (process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'));

  // Electron names this directory after the app, and this app has been called
  // three things: the packaged build uses the productName, an `electron-vite
  // dev` run uses package.json's name, and both predate the rename. Whichever
  // one has a config.json is the one with the user's hive in it — starting a
  // browser session on an empty directory would look like a lost install.
  // Same answer src/main's adoptLegacyStateDir() reaches, reached earlier: the
  // server checks the instance lock before it imports main.
  for (const name of ['Atlas', 'atlas', 'munder-difflin']) {
    if (existsSync(join(parent, name, 'config.json'))) return join(parent, name);
  }
  return join(parent, 'Atlas');
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
  /** FALSE on purpose. Every `app.isPackaged` branch in src/main chooses between
   *  `process.resourcesPath` (an .app bundle) and `getAppPath()/resources` (a
   *  checkout). Browser mode runs from a checkout, so it wants the second — and
   *  it also wants what `isPackaged` gates OFF: the auto-updater, which has no
   *  meaning when the answer to "update" is `git pull`. */
  readonly isPackaged = false;

  /** src/main adopts a previous release's state directory when this build's own
   *  is empty (the app was renamed). That call lands here. */
  setPath(name: string, value: string): void { PATHS[name] = value; }

  getPath(name: string): string {
    const p = PATHS[name] ?? PATHS.userData;
    try { mkdirSync(p, { recursive: true }); } catch { /* best effort */ }
    return p;
  }

  /** The repo root: out/server/index.cjs sits two levels down from it. This is
   *  what resources/skills, resources/kg.cjs and the rest resolve against. */
  getAppPath(): string { return resolve(__dirname, '..', '..'); }
  /** The app's real version. Read from package.json rather than hardcoded so the
   *  browser tab and Settings agree with the desktop build. */
  getVersion(): string {
    if (process.env.ATLAS_VERSION) return process.env.ATLAS_VERSION;
    for (const dir of [join(__dirname, '..', '..'), process.cwd()]) {
      try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version; } catch { /* next */ }
    }
    return '0.0.0-server';
  }
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

/** `ipcMain.on` channels are the SYNCHRONOUS ones: the renderer sends, the
 *  handler assigns `event.returnValue`, and the call returns inline. The store
 *  reads the roster and the open hive that way, before its first render. */
const syncHandlers = new Map<string, Handler>();

export const ipcMain = {
  handle(channel: string, fn: Handler): void { handlers.set(channel, fn); },
  handleOnce(channel: string, fn: Handler): void { handlers.set(channel, fn); },
  removeHandler(channel: string): void { handlers.delete(channel); },
  on(channel: string, fn: Handler): void { syncHandlers.set(channel, fn); },
  emit(): boolean { return false; }
};

/** Every channel the main process registered, for the bridge to dispatch to. */
export function ipcHandlers(): Map<string, Handler> { return handlers; }
export function ipcSyncHandlers(): Map<string, Handler> { return syncHandlers; }

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

/**
 * A window that is a browser tab.
 *
 * src/main/index.ts creates one of these, keeps it in `allWindows`, and uses it
 * for two things that matter here: `webContents.send(...)`, which is how every
 * push reaches the UI, and `isDestroyed()`, which is how it decides whether
 * there is a UI to push to. Both are answered by the page sink the server
 * installs below.
 *
 * Everything else a window does — geometry, focus, the traffic lights, the
 * permission handlers — belongs to Chromium, and the browser is already doing
 * it. Those calls land on the Proxy and do nothing.
 */
class WindowShim extends EventEmitter {
  static readonly instances = new Set<WindowShim>();
  readonly id: number;
  readonly webContents: unknown;

  constructor() {
    super();
    this.setMaxListeners(0);
    this.id = WindowShim.instances.size + 1;
    this.webContents = webContentsProxy();
    WindowShim.instances.add(this);
  }

  isDestroyed(): boolean { return false; }
  isMinimized(): boolean { return false; }
  isMaximized(): boolean { return false; }
  isVisible(): boolean { return true; }
  getBounds(): { x: number; y: number; width: number; height: number } {
    return { x: 0, y: 0, width: 1440, height: 900 };
  }
  loadFile(): Promise<void> { return Promise.resolve(); }
  loadURL(): Promise<void> { return Promise.resolve(); }
  destroy(): void { WindowShim.instances.delete(this); }
  close(): void { this.destroy(); }
}

/** What `win.webContents` answers. `send` and `isDestroyed` are the page — they
 *  are the only two the main process depends on. `session` exists because
 *  createWindow installs permission handlers on it, and a browser grants its own
 *  permissions. Anything else is a no-op. */
function webContentsProxy(): unknown {
  const session = noOpProxy({ setPermissionRequestHandler: () => undefined, setPermissionCheckHandler: () => undefined });
  return noOpProxy({
    get session() { return session; },
    id: 1,
    send: (channel: string, ...args: unknown[]) => pageSink?.send(channel, ...args),
    isDestroyed: () => pageSink?.isDestroyed() ?? true,
    getURL: () => 'http://127.0.0.1',
    isLoading: () => false
  });
}

/** An object whose unknown members are harmless no-op functions. The main
 *  process calls dozens of Chromium methods that have no meaning without a
 *  window; none of them should be the reason a boot dies halfway. */
function noOpProxy<T extends object>(own: T): T {
  return new Proxy(own, {
    get(target, key, receiver) {
      if (key in target) return Reflect.get(target, key, receiver);
      if (typeof key === 'symbol') return undefined;
      return () => undefined;
    }
  });
}

/** Unknown methods are no-ops rather than crashes: main calls a couple of dozen
 *  window methods and none of them mean anything without a Chromium window. */
const windowProxy = (win: WindowShim): WindowShim => noOpProxy(win);

/** The page's event sink, installed by the server once it can push. Windows
 *  created before that still answer `send` — into nothing. */
let pageSink: { send(channel: string, ...args: unknown[]): void; isDestroyed(): boolean } | null = null;
export function setPageSink(sink: RendererSink): void { pageSink = sink; }

export const BrowserWindow = Object.assign(
  function BrowserWindow(this: unknown) { return windowProxy(new WindowShim()); } as unknown as {
    new (opts?: unknown): WindowShim;
    getAllWindows(): WindowShim[];
    getFocusedWindow(): WindowShim | null;
    fromWebContents(): WindowShim | null;
  },
  {
    getAllWindows: () => [...WindowShim.instances],
    getFocusedWindow: () => [...WindowShim.instances][0] ?? null,
    fromWebContents: () => [...WindowShim.instances][0] ?? null
  }
);

/** A browser cannot open a native file picker on the server's filesystem, and a
 *  server-side picker would be the wrong machine anyway. Every dialog answers
 *  "the user cancelled", which every call site already handles. */
export const dialog = {
  showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
  showOpenDialogSync: () => undefined,
  showSaveDialog: () => Promise.resolve({ canceled: true, filePath: undefined }),
  showMessageBox: () => Promise.resolve({ response: 0, checkboxChecked: false }),
  showMessageBoxSync: () => 0,
  showErrorBox: () => { /* the page shows its own errors */ }
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
/** Electron's safeStorage encrypts with a key only the OS keychain holds, and
 *  that key is bound to the signed app — a node process cannot read it. So this
 *  reports "no encryption", which integrations.ts already treats as a REFUSAL to
 *  store: a secret written here would be plaintext on disk, and a secret written
 *  by the desktop app cannot be read back. Integrations are therefore desktop
 *  only until this has a real keychain bridge. */
export const safeStorage = {
  isEncryptionAvailable(): boolean { return false; },
  encryptString(): Buffer { throw new Error('[server] safeStorage is not available in browser mode'); },
  decryptString(): string { throw new Error('[server] safeStorage is not available in browser mode'); }
};

export const nativeTheme = { shouldUseDarkColors: false, on: () => { /* none */ } };
export const Menu = { setApplicationMenu: () => { /* no menu bar */ }, buildFromTemplate: () => ({ popup: () => undefined }) };
export const net = { request: () => { throw new Error('[server] net.request is not available in browser mode'); } };
export const webUtils = { getPathForFile: () => '' };

export default {
  app, BrowserWindow, Notification, clipboard, dialog, ipcMain, Menu, nativeTheme,
  net, powerMonitor, powerSaveBlocker, protocol, safeStorage, screen, shell, webUtils
};
