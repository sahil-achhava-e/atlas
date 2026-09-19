/**
 * One brain, two views.
 *
 * The desktop app and `npm run serve` are the same main process over the same
 * state: the same config, the same workspace folder, the same registry, tasks
 * and memory on disk. That is the point — a workspace opened in one is the
 * workspace you see in the other.
 *
 * What must NOT happen is both running at once. Each would start its own
 * message router, its own hook server and its own mission scheduler against the
 * same files: mail delivered twice, a mission dispatched twice, and two servers
 * racing for the port agents were told to call back on.
 *
 * So whichever starts first writes a lock naming its pid, and the other refuses
 * while that pid is alive. The liveness check is what makes this safe to apply
 * to the app as well: a lock left behind by a crash names a dead process, and a
 * dead process holds nothing — so a stale lock can never be the reason someone's
 * app will not open.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface InstanceLock { pid: number; mode: 'app' | 'server'; startedAt: string }

function lockPath(userData: string): string { return join(userData, 'instance.lock'); }

/** The live lock, or null when there is none (or it names a dead process). */
export function readInstanceLock(userData: string): InstanceLock | null {
  const p = lockPath(userData);
  if (!existsSync(p)) return null;
  let lock: InstanceLock;
  try { lock = JSON.parse(readFileSync(p, 'utf8')) as InstanceLock; } catch { return null; }
  if (!lock || typeof lock.pid !== 'number' || lock.pid === process.pid) return null;
  // Signal 0 tests for existence without touching the process. ESRCH = gone, so
  // the lock is stale and whoever asked may proceed.
  try { process.kill(lock.pid, 0); } catch { return null; }
  return lock;
}

export function writeInstanceLock(userData: string, mode: 'app' | 'server'): void {
  try {
    writeFileSync(lockPath(userData), JSON.stringify({ pid: process.pid, mode, startedAt: new Date().toISOString() }), 'utf8');
  } catch { /* a lock we cannot write is a warning we cannot give, not a failure */ }
}

export function clearInstanceLock(userData: string): void {
  try {
    const held = JSON.parse(readFileSync(lockPath(userData), 'utf8')) as InstanceLock;
    if (held.pid !== process.pid) return; // someone else's lock — leave it alone
    rmSync(lockPath(userData), { force: true });
  } catch { /* nothing to clear */ }
}
