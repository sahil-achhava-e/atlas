/**
 * Atlas in a browser: the same main process, served over http.
 *
 *   npm run serve        → http://127.0.0.1:5188
 *
 * WHY. The desktop app is five binaries (the main process plus four helpers that
 * draw the window), and an endpoint policy that permits one and kills the rest
 * leaves the app running with nothing to render. `node` is permitted on those
 * machines. So this boots the portable half of the main process under plain node
 * and hands the UI to a browser tab.
 *
 * WHAT RUNS. The hive, the router, node-pty, the memory index, hooks, skills and
 * config — everything in src/main that never needed a window. Electron itself is
 * replaced at build time by src/server/electronShim.ts.
 *
 * WHAT DOES NOT. Native dialogs, the tray, the auto-updater, desktop
 * notifications. Those surfaces degrade the way a missing provider CLI does
 * rather than failing the app.
 *
 * LOOPBACK ONLY. It binds 127.0.0.1 and nothing else. This process can spawn
 * agents in your repositories, so it is not something to expose on a network —
 * the bind address is not a setting for that reason.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

import { app, ipcHandlers, ipcSyncHandlers, setNotificationSink, type RendererSink } from './electronShim';
import { INVOKE, SYNC, clientScript } from './bridge';

const PORT = Number(process.env.ATLAS_PORT ?? 5188);
const HOST = '127.0.0.1';
const RENDERER = resolve(__dirname, '../renderer');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.tmj': 'application/json; charset=utf-8'
};

/** Every connected page. One browser tab is the normal case; more than one is
 *  allowed because a second tab is how you watch the floor on another screen. */
const pages = new Set<ServerResponse>();

/** Push an event to every open page. This is the shim's RendererSink: the main
 *  process calls `wc.send(channel, …)` exactly as it does in Electron. */
function broadcast(channel: string, args: unknown[]): void {
  if (pages.size === 0) return;
  const frame = `data: ${JSON.stringify({ channel, args })}\n\n`;
  for (const res of pages) {
    try { res.write(frame); } catch { pages.delete(res); }
  }
}

export const browserSink: RendererSink = {
  send(channel: string, ...args: unknown[]): void { broadcast(channel, args); },
  isDestroyed(): boolean { return pages.size === 0; }
};

function json(res: ServerResponse, code: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** The page's index, with the bridge injected ahead of the app bundle. The built
 *  index.html is Electron's; nothing in it knows about `window.cth`, which is
 *  supplied by preload there and by this script here. */
function indexHtml(): string {
  const file = join(RENDERER, 'index.html');
  const html = readFileSync(file, 'utf8');
  const boot = `<script>window.__ATLAS_VERSION__=${JSON.stringify(app.getVersion())};`
    + `window.__ATLAS_PLATFORM__=${JSON.stringify(process.platform)};`
    + `window.__ATLAS_ARCH__=${JSON.stringify(process.arch)};</script>`
    + `<script src="/cth.js"></script>`;
  return html.replace('<head>', `<head>${boot}`);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);

  // ─── the event stream ─────────────────────────────────────────────────────
  if (url.pathname === '/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    });
    res.write(': connected\n\n');
    pages.add(res);
    // A comment frame every 20s: proxies and browsers drop an idle stream, and a
    // dropped stream is a floor that silently stops updating.
    const beat = setInterval(() => { try { res.write(': beat\n\n'); } catch { /* gone */ } }, 20_000);
    req.on('close', () => { clearInterval(beat); pages.delete(res); });
    return;
  }

  // ─── calls ────────────────────────────────────────────────────────────────
  if (url.pathname === '/rpc' && req.method === 'POST') {
    let payload: { method?: string; args?: unknown[] };
    try { payload = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad json' }); }

    const method = payload.method ?? '';

    // A sync method is one the renderer would have sent with `sendSync`: main
    // assigns `event.returnValue` instead of returning. The page blocks on the
    // XHR for exactly as long as Electron blocks on the IPC.
    if (SYNC[method]) {
      const fn = ipcSyncHandlers().get(SYNC[method]);
      if (!fn) return json(res, 200, { value: null });
      const evt: { returnValue: unknown; sender: RendererSink } = { returnValue: null, sender: browserSink };
      try { fn(evt, ...(payload.args ?? [])); } catch (e) { return json(res, 200, { error: String(e) }); }
      return json(res, 200, { value: evt.returnValue });
    }

    const channel = INVOKE[method];
    if (!channel) return json(res, 404, { error: `not available in browser mode: ${method}` });

    // A channel main did not register: answer empty rather than reject. The
    // renderer awaits several of these during boot, and a rejection there is a
    // page that never renders.
    const handler = ipcHandlers().get(channel);
    if (!handler) {
      console.warn(`[server] ${method} → ${channel}: no handler in browser mode`);
      return json(res, 200, { value: undefined });
    }

    try {
      // The first argument is Electron's IpcMainInvokeEvent. Handlers that use it
      // want `sender`; give them the page sink so a reply reaches the browser.
      const value = await handler({ sender: browserSink }, ...(payload.args ?? []));
      return json(res, 200, { value });
    } catch (e) {
      return json(res, 200, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (url.pathname === '/cth.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    return void res.end(clientScript());
  }

  // ─── static files, and the SPA fallback ───────────────────────────────────
  // Anything with an extension is a real file; anything else is an in-app route
  // and gets index.html, the same rule the packaged app's protocol handler uses.
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const onDisk = join(RENDERER, rel);
  if (extname(onDisk) && onDisk.startsWith(RENDERER) && existsSync(onDisk)) {
    const body = await readFile(onDisk);
    res.writeHead(200, { 'content-type': MIME[extname(onDisk)] ?? 'application/octet-stream' });
    return void res.end(body);
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(indexHtml());
}

export async function start(): Promise<void> {
  if (!existsSync(join(RENDERER, 'index.html'))) {
    console.error(`[server] no built UI at ${RENDERER} — run \`npm run build\` first.`);
    process.exit(1);
  }

  // Refuse to be a second brain over the same files. The desktop app writes this
  // lock while it holds the hive; two routers would deliver every message twice.
  const { readInstanceLock } = await import('../main/instanceLock');
  const held = readInstanceLock(app.getPath('userData'));
  if (held) {
    console.error(`\n  Atlas is already running (${held.mode}, pid ${held.pid}).`);
    console.error('  Both views share one state, so only one of them may run at a time.');
    console.error('  Quit the app, then start this again.\n');
    process.exit(1);
  }

  // Leaving on Ctrl-C releases the lock; main only clears it on `will-quit`,
  // which no one emits here.
  const release = (): never => {
    void import('../main/instanceLock').then((m) => m.clearInstanceLock(app.getPath('userData')));
    process.exit(0);
  };
  process.on('SIGINT', release);
  process.on('SIGTERM', release);

  // A main-process notification becomes an event the page can raise itself.
  setNotificationSink((title, body) => broadcast('app:notification', [{ title, body }]));

  // Boot the portable main-process modules and register their channels. Imported
  // here rather than at the top because handlers.ts imports `browserSink` from
  // this module — a cycle node resolves fine at call time, not at load time.
  const { registerHandlers } = await import('./handlers');
  await registerHandlers();
  console.log(`[server] main process up — ${ipcHandlers().size} channels`);

  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error('[server]', e);
      if (!res.headersSent) json(res, 500, { error: 'server error' });
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`\n  Atlas — browser mode\n  http://${HOST}:${PORT}\n`);
    console.log(`  state: ${app.getPath('userData')}`);
    console.log('  loopback only. Ctrl-C to stop.\n');
  });
}

if (require.main === module) void start();
