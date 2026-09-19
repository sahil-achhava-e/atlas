/**
 * The handlers browser mode answers with.
 *
 * In Electron these live in src/main/index.ts, alongside a BrowserWindow, a
 * protocol handler, a tray and an auto-updater — none of which exist here, and
 * that file cannot be imported without them. So this registers the SAME channels
 * against the SAME portable modules: config, the PTY manager, the hive.
 *
 * Deliberately a subset. Terminals, the roster, the hive and the board are what
 * make the floor usable; everything else resolves empty in the page rather than
 * pretending. Adding a channel is adding a line here plus a line in bridge.ts.
 */

import { ipcMain } from './electronShim';
import { browserSink } from './index';
import { readConfig, writeConfig } from '../main/config';
import { PtyManager } from '../main/pty';
import { HiveManager } from '../main/hive';

export interface ServerRuntime {
  pty: PtyManager;
  hive: HiveManager;
}

export function registerHandlers(): ServerRuntime {
  const pty = new PtyManager();
  // The sink is the page, not a window: `wc.send('pty:data:<id>', …)` becomes an
  // SSE frame. PtyManager never learns the difference.
  pty.attachWebContents(browserSink as never);

  const hive = new HiveManager(
    () => readConfig().harnessHome ?? null,
    (channel, payload) => { browserSink.send(channel, payload); return true; }
  );

  // ─── config ────────────────────────────────────────────────────────────────
  ipcMain.handle('config:get', () => readConfig());
  ipcMain.handle('config:update', (_e, patch) => {
    const next = writeConfig((patch ?? {}) as Parameters<typeof writeConfig>[0]);
    // Every window is told when a setting is saved, so Settings never goes stale.
    browserSink.send('config:changed', next);
    return next;
  });
  ipcMain.handle('config:home', () => readConfig().harnessHome ?? null);

  // ─── terminals ─────────────────────────────────────────────────────────────
  ipcMain.handle('pty:spawn', (_e, opts) => pty.spawn(opts as never, browserSink as never));
  ipcMain.handle('pty:write', (_e, id, data) => pty.write(String(id), String(data)));
  ipcMain.handle('pty:resize', (_e, id, cols, rows) => pty.resize(String(id), Number(cols), Number(rows)));
  ipcMain.handle('pty:kill', (_e, id) => pty.kill(String(id)));
  ipcMain.handle('pty:list', () => pty.list());

  // ─── the hive ──────────────────────────────────────────────────────────────
  // `registry()` is the hive's own view of who exists — the same JSON the
  // orchestrator reads, which is what the floor's roster is built from.
  ipcMain.handle('hive:state', () => hive.registry());
  ipcMain.handle('hive:send', (_e, msg, from) => hive.send(msg as never, (from as string) ?? 'human'));
  ipcMain.handle('hive:tasks', () => hive.tasks());
  ipcMain.handle('hive:board', () => hive.board());

  // ─── app ───────────────────────────────────────────────────────────────────
  ipcMain.handle('app:info', () => ({ version: process.env.ATLAS_VERSION ?? '', changelog: '' }));

  hive.startRouter();
  return { pty, hive };
}
