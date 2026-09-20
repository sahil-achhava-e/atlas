/**
 * The roster on disk — agents, their notes, worktree paths, archived and
 * restorable entries, and parked message queues, in a SQLite database beside
 * the hive (`<harnessHome>/roster.db`).
 *
 * WHY THIS EXISTS. This is the UI floor (cards, notes, queues, worktrees).
 * Hive identity — id, role, cwd, session — lives in `<harnessHome>/hive/registry.json`
 * and is what agents read. The two must not drift: `description` here is the
 * same durable job string as registry `role`, never live status (pause/idle).
 *
 * It used to live in the renderer's localStorage, which is partitioned by
 * ORIGIN: a dev run loads the renderer from `http://localhost:5173`, a packaged
 * build from `file://`, and browser mode from `http://127.0.0.1:5188`. None of
 * them see each other's storage, so the same hive showed a different floor
 * depending on how you opened it. A JSON mirror bridged that, and brought its
 * own failure: the mirror was written as ONE SNAPSHOT, so a window that knew
 * about one agent wrote its whole roster over a file holding three.
 *
 * ROWS, NOT SNAPSHOTS. That is the point of this file. An agent is a row. A
 * window that knows less than the database does can only fail to mention rows,
 * and a row nobody mentions is left alone. Deleting is a separate, explicit
 * instruction naming the agent. There is no write shaped like "here is the
 * whole world, replace it", so there is no write that can flatten the roster.
 *
 * Durability:
 *   1. Every save is one transaction — it lands completely or not at all.
 *   2. WAL journalling with synchronous=FULL, so a crash mid-write rolls back
 *      rather than truncating.
 *   3. A reset copies the whole database into `roster-backups/` before clearing
 *      it. That is the only copy anything keeps: one store, no mirrors to drift.
 */
import Database from 'better-sqlite3';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** What the renderer loads at boot. The inner agent shape is deliberately opaque
 *  here — the renderer's store owns it, and repeating it would mean editing this
 *  file every time an agent gains a field. */
export interface RosterSnapshot {
  version: 1;
  savedAt: string;
  agents: unknown[];
  archived: unknown[];
  restorable: unknown[];
  queues: Record<string, unknown[]>;
  selectedId: string | null;
  /** True once anything has ever been saved for this hive. An EMPTY seeded
   *  roster is a real answer — "you deleted everyone" — and the renderer must
   *  not fall back to localStorage and resurrect them. */
  seeded: boolean;
}

/** One save from a window: what it knows, and what it deliberately removed.
 *  Every field is optional — a window sends the slices it touched. */
export interface RosterSave {
  agents?: unknown[];
  archived?: unknown[];
  restorable?: unknown[];
  /** Keyed by agent id. Authoritative for the ids in it AND for any id in the
   *  `agents`/`archived`/`restorable` arrays above (so emptying a queue clears
   *  it), and silent about every other agent. */
  queues?: Record<string, unknown[]>;
  selectedId?: string | null;
  /** Agents this window removed since it loaded. The ONLY way a row is deleted. */
  removes?: string[];
}

export interface RosterWriteResult {
  ok: boolean;
  error?: string;
}

type Bucket = 'active' | 'archived' | 'restorable';

export function rosterDbPath(home: string): string {
  return join(home, 'roster.db');
}

export function rosterBackupDir(home: string): string {
  return join(home, 'roster-backups');
}

const MIGRATIONS: Array<(db: Database.Database) => void> = [
  // → user_version 1: agents as rows, queues as rows, scalars in meta.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent (
        id         TEXT PRIMARY KEY,
        bucket     TEXT NOT NULL,
        ord        INTEGER NOT NULL,
        data       TEXT NOT NULL,      -- JSON: the renderer's agent card
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_bucket ON agent(bucket, ord);
      CREATE TABLE IF NOT EXISTS queue (
        agent_id TEXT NOT NULL,
        pos      INTEGER NOT NULL,
        data     TEXT NOT NULL,        -- JSON: one queued message
        PRIMARY KEY (agent_id, pos)
      );
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }
];

function idOf(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object') return null;
  const id = (entry as { id?: unknown }).id;
  return typeof id === 'string' && id ? id : null;
}

/**
 * Reads and writes one home folder's roster.
 *
 * A class because the handle is cached and has to be reopened when the user
 * switches workspace. One instance per process in `index.ts`; tests make their
 * own.
 */
export class RosterStore {
  private db: Database.Database | null = null;
  /** The home the open handle belongs to, so switching workspace reopens. */
  private openFor: string | null = null;

  constructor(private readonly getHome: () => string | null) {}

  private home(): string | null {
    try { return this.getHome(); } catch { return null; }
  }

  /** Open (creating and migrating if needed) the database for the current home.
   *  Null when there is no home yet, or when SQLite cannot be opened at all. */
  private conn(): Database.Database | null {
    const home = this.home();
    if (!home) return null;
    if (this.db && this.openFor === home) return this.db;
    this.close();
    try {
      mkdirSync(home, { recursive: true });
      const db = new Database(rosterDbPath(home));
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = FULL'); // a roster is worth the fsync
      db.pragma('busy_timeout = 5000');
      const version = db.pragma('user_version', { simple: true }) as number;
      for (let i = version; i < MIGRATIONS.length; i++) {
        db.transaction(() => {
          MIGRATIONS[i](db);
          db.pragma(`user_version = ${i + 1}`);
        })();
      }
      this.db = db;
      this.openFor = home;
      return db;
    } catch (e) {
      console.error('[roster] could not open the database:', e);
      return null;
    }
  }

  close(): void {
    try { this.db?.close(); } catch { /* best-effort */ }
    this.db = null;
    this.openFor = null;
  }

  private getMeta(key: string): string | null {
    const row = this.db?.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  /** The stored roster, or null when this hive has none — which the renderer
   *  reads as "no opinion" and answers from localStorage instead. */
  read(): RosterSnapshot | null {
    const db = this.conn();
    if (!db) return null;
    try {
      const rows = db.prepare('SELECT id, bucket, data FROM agent ORDER BY bucket, ord').all() as
        Array<{ id: string; bucket: string; data: string }>;
      const seeded = this.getMeta('seeded') === '1';
      if (!rows.length && !seeded) return null;

      const out: RosterSnapshot = {
        version: 1,
        savedAt: this.getMeta('savedAt') ?? new Date(0).toISOString(),
        agents: [], archived: [], restorable: [],
        queues: {},
        selectedId: this.getMeta('selectedId'),
        seeded
      };
      for (const r of rows) {
        let card: unknown;
        try { card = JSON.parse(r.data); } catch { continue; }
        if (r.bucket === 'archived') out.archived.push(card);
        else if (r.bucket === 'restorable') out.restorable.push(card);
        else out.agents.push(card);
      }
      const q = db.prepare('SELECT agent_id, data FROM queue ORDER BY agent_id, pos').all() as
        Array<{ agent_id: string; data: string }>;
      for (const r of q) {
        try { (out.queues[r.agent_id] ??= []).push(JSON.parse(r.data)); } catch { /* skip one bad row */ }
      }
      return out;
    } catch (e) {
      console.error('[roster] read failed:', e);
      return null;
    }
  }

  /**
   * Apply one window's save.
   *
   * Everything named is written; everything unnamed is left exactly as it is.
   * The only deletions are the ids in `removes`, which the window has to ask for
   * by name. That is what makes a half-informed window harmless: the worst it
   * can do is repeat what it already knows.
   */
  save(patch: RosterSave): RosterWriteResult {
    const db = this.conn();
    if (!db) return { ok: false, error: 'no harnessHome' };
    if (!patch || typeof patch !== 'object') return { ok: false, error: 'invalid save' };
    try {
      const upsert = db.prepare(
        `INSERT INTO agent (id, bucket, ord, data, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET bucket = excluded.bucket, ord = excluded.ord,
           data = excluded.data, updated_at = excluded.updated_at`
      );
      const dropAgent = db.prepare('DELETE FROM agent WHERE id = ?');
      const dropQueue = db.prepare('DELETE FROM queue WHERE agent_id = ?');
      const addQueued = db.prepare('INSERT INTO queue (agent_id, pos, data) VALUES (?, ?, ?)');
      const setMeta = db.prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      );

      const run = db.transaction(() => {
        const now = Date.now();
        /** Every id this window mentioned — the scope its queue map speaks for. */
        const mentioned = new Set<string>();
        const writeBucket = (bucket: Bucket, list: unknown[] | undefined): void => {
          if (!Array.isArray(list)) return;
          list.forEach((entry, i) => {
            const id = idOf(entry);
            if (!id) return;
            mentioned.add(id);
            upsert.run(id, bucket, i, JSON.stringify(entry), now);
          });
        };
        writeBucket('active', patch.agents);
        writeBucket('archived', patch.archived);
        writeBucket('restorable', patch.restorable);

        for (const id of patch.removes ?? []) {
          if (typeof id !== 'string' || !id) continue;
          dropAgent.run(id);
          dropQueue.run(id);
        }

        if (patch.queues && typeof patch.queues === 'object') {
          for (const id of Object.keys(patch.queues)) mentioned.add(id);
          for (const id of mentioned) {
            dropQueue.run(id);
            const list = patch.queues[id];
            if (!Array.isArray(list)) continue;
            list.forEach((msg, i) => addQueued.run(id, i, JSON.stringify(msg)));
          }
        }

        if (patch.selectedId !== undefined) {
          if (typeof patch.selectedId === 'string' && patch.selectedId) {
            setMeta.run('selectedId', patch.selectedId);
          } else {
            db.prepare('DELETE FROM meta WHERE key = ?').run('selectedId');
          }
        }
        setMeta.run('savedAt', new Date().toISOString());
        setMeta.run('seeded', '1');
      });
      run();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Retire the roster during a full reset: the database is copied into
   * `roster-backups/` and then emptied.
   *
   * Reset wipes the hive, and the roster must not be left behind as the one
   * survivor — pointing the home folder back here afterwards would show a floor
   * full of agents whose sessions, memory and inboxes no longer exist. Archived
   * rather than destroyed, because a roster is never destroyed, only superseded.
   */
  archive(): void {
    const home = this.home();
    if (!home) return;
    const db = this.conn();
    if (!db) return;
    try {
      const dir = rosterBackupDir(home);
      mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      // Checkpoint first so the copy is a complete database, not one missing
      // whatever is still sitting in the WAL.
      db.pragma('wal_checkpoint(TRUNCATE)');
      copyFileSync(rosterDbPath(home), join(dir, `roster-${stamp}-reset.db`));
      // Remove the file rather than emptying it. An empty database left behind
      // is a workspace that still looks occupied — the folder cannot be reused
      // under the same name, and the app has to explain why.
      this.close();
      for (const suffix of ['', '-wal', '-shm']) {
        rmSync(`${rosterDbPath(home)}${suffix}`, { force: true });
      }
    } catch (e) {
      console.warn('[roster] archive failed:', e);
    }
  }
}
