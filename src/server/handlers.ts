/**
 * Browser mode boots the REAL main process.
 *
 * This used to register a hand-picked subset of channels against the portable
 * modules — config, the PTY manager, the hive. That subset was always wrong in
 * the same direction: src/main/index.ts registers 157 channels and does a page
 * of work on `whenReady` (seeding the hive, the hook server, missions, memory,
 * the skills a spawned agent gets copied into it), and a re-implementation of it
 * here is a second app to keep in step, which is exactly what the shim exists to
 * avoid. So: import it, and let it run.
 *
 * What makes that possible is that Electron itself is aliased to
 * electronShim.ts at build time. `app.whenReady()` resolves immediately,
 * `new BrowserWindow()` hands back a window whose webContents is the page, and
 * the native surfaces that have no meaning here — dialogs, the menu bar, the
 * protocol handler, the auto-updater — are no-ops.
 */

import { setPageSink } from './electronShim';
import { browserSink } from './index';

export async function registerHandlers(): Promise<void> {
  // Before the import: main creates its window during `whenReady`, and that
  // window's webContents has to be the page from the first push onward.
  setPageSink(browserSink);

  // Side-effect import. Everything main does at module load and on `whenReady`
  // happens here: ipcMain.handle × 157, the hive bootstrap, the hook server.
  await import('../main/index');
}
