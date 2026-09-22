/**
 * PersistStore — durable harness state in SQLite (better-sqlite3, synchronous).
 *
 * Phase A scope (the rest of the renderer state stays in localStorage for now):
 *   - kv:               scalar app state. Today: the main window's bounds.
 *   - command_history:  NET-NEW — every prompt the user submits to an agent.
 *
 * Lives in the Electron MAIN process (better-sqlite3 is native + synchronous);
 * the renderer reaches it over IPC. The DB file sits next to config.json under
 * app.getPath('userData'). WAL mode so reads never block the single writer.
 *
 * Schema evolves via PRAGMA user_version migrations: an ordered array where
 * migration N runs when user_version < N+1, then bumps it. NEVER edit a shipped
 * migration — only append. Phases B/C (agents + message_queue mirror) and the
 * cross-lane cost_ledger are reserved as future additive migrations (see below);
 * they are deliberately NOT built in v1.
 */
import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'node:path';

/** A captured user prompt, as returned to the renderer (camelCase columns). */
export interface CommandHistoryRow {
  id: number;
  agentId: string;
  cwd: string | null;
  text: string;
  ts: number;
}

/**
 * Ordered, append-only migrations. Index N takes the DB from user_version N to
 * N+1. To evolve the schema, APPEND a new function — never edit an existing one
 * (shipped DBs have already run it).
 *
 * FUTURE (do NOT build in v1 — reserved so the array isn't painted into a corner):
 *   - Phase B: `agents` + `message_queue` mirror of the renderer roster/queues
 *     (dual-write), enabling the eventual authority flip off localStorage.
 *   - Cross-lane (Lane A #6): migrate Jim's cost ledger onto this DB so his
 *     circuit-breaker can move off transcript-polling. Column names match his
 *     <harnessHome>/hive/cost-ledger.jsonl keys 1:1 for a straight INSERT…SELECT
 *     (coordinated w/ jim-mq290qkn 2026-06-06):
 *       cost_ledger(id, agent_id, session_id TEXT, ts, input, output,
 *                   cache_read, cache_creation, model TEXT, usd REAL)
 *     Rows are CUMULATIVE snapshots (one per agent per heartbeat beat) — diff
 *     consecutive rows for velocity; index (agent_id, session_id, ts). Additive;
 *     lands as a later migration.
 */
const MIGRATIONS: Array<(db: Database.Database) => void> = [
  // → user_version 1 (Phase A): scalar kv + net-new command history.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,     -- JSON-encoded
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS command_history (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        cwd      TEXT,
        text     TEXT NOT NULL,
        ts       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ch_agent_ts ON command_history(agent_id, ts DESC);
    `);
  },
  // → user_version 2: the conversation, so it survives a restart.
  //
  // WHY. The read-only activity view was built entirely from the engine's
  // session transcript, and a resume starts a NEW transcript: everything said
  // before the restart stayed in a file the app no longer reads. The human's
  // side looked wiped (they had nothing new to add) while the agent's side
  // looked fine (it kept talking). On top of that, only the last 512 KB of the
  // file was ever read, so on a 4 MB transcript 2 of 25 owner messages were
  // visible even without a restart.
  //
  // `say` and `ask` only — the conversation, not the tool rows. Tool work is
  // dense (ten rows per exchange, with paths and commands) and reading it back
  // after a restart is not what anyone wants from a message history.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        kind     TEXT NOT NULL,      -- 'say' (the agent) | 'ask' (the human)
        text     TEXT NOT NULL,
        ts       INTEGER NOT NULL,
        -- Ingest is idempotent: the same transcript window is re-read every
        -- poll and after every restart, so a row has to be recognisable as one
        -- already stored. Same agent, kind, second and text = same line.
        dedupe   TEXT NOT NULL,
        UNIQUE(agent_id, dedupe)
      );
      CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity(agent_id, ts, id);
    `);
  }
];

export class PersistStore {
  private db: Database.Database | null = null;

  /** @param dbPath  Override the DB location (tests). Defaults to userData/harness.db. */
  constructor(private dbPath?: string) {}

  /** Open (creating if needed) and migrate the DB. Idempotent — a second call is
   *  a no-op. Throws if the native module fails to load or the file is unusable;
   *  callers should guard so a DB failure can't crash app startup. */
  open(): void {
    if (this.db) return;
    const path = this.dbPath ?? join(app.getPath('userData'), 'harness.db');
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    this.migrate(db);
    this.db = db;
  }

  private migrate(db: Database.Database): void {
    const version = db.pragma('user_version', { simple: true }) as number;
    for (let i = version; i < MIGRATIONS.length; i++) {
      // Each migration + its version bump run in one transaction so a crash
      // mid-migration never leaves a half-applied schema at the wrong version.
      const run = db.transaction(() => {
        MIGRATIONS[i](db);
        db.pragma(`user_version = ${i + 1}`);
      });
      run();
    }
  }

  /** Close the handle (checkpoints WAL). Safe to call when already closed. */
  close(): void {
    try { this.db?.close(); } catch { /* best-effort on shutdown */ }
    this.db = null;
  }

  get isOpen(): boolean { return this.db !== null; }

  // ─── kv (scalar app state) ─────────────────────────────────────────────────

  /** Read a JSON-decoded scalar, or undefined if absent/unparseable. */
  getKv<T = unknown>(key: string): T | undefined {
    if (!this.db) return undefined;
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return undefined;
    try { return JSON.parse(row.value) as T; } catch { return undefined; }
  }

  /** Upsert a JSON-encoded scalar. */
  setKv(key: string, value: unknown): void {
    if (!this.db) return;
    this.db.prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(key, JSON.stringify(value), Date.now());
  }

  // ─── preferences ───────────────────────────────────────────────────────────
  //
  // Theme, language, terminal font size, which pane you had open. These used to
  // be localStorage, which is partitioned by ORIGIN: the desktop app and the
  // browser tab are two different origins onto the SAME hive, so setting dark
  // mode in one left the other in light. They are app-wide (not per-workspace),
  // so they live here in the app's own database rather than beside a hive.
  //
  // Stored under a `pref.` prefix in kv, as strings — the renderer's settings
  // are strings on both sides, and a JSON-typed pref would only mean two shapes
  // to keep in step.

  /** Every preference, keyed without the storage prefix. */
  prefs(): Record<string, string> {
    if (!this.db) return {};
    const rows = this.db.prepare("SELECT key, value FROM kv WHERE key LIKE 'pref.%'").all() as
      Array<{ key: string; value: string }>;
    const out: Record<string, string> = {};
    for (const r of rows) {
      try {
        const v = JSON.parse(r.value);
        if (typeof v === 'string') out[r.key.slice('pref.'.length)] = v;
      } catch { /* skip one unreadable pref rather than losing the rest */ }
    }
    return out;
  }

  /** Set one preference, or delete it when `value` is null. */
  setPref(name: string, value: string | null): void {
    if (!this.db || !name) return;
    if (value === null) this.db.prepare('DELETE FROM kv WHERE key = ?').run(`pref.${name}`);
    else this.setKv(`pref.${name}`, value);
  }

  // ─── command history (net-new) ─────────────────────────────────────────────

  /** Record one submitted prompt. Empty text or missing agent id are ignored. */
  addHistory(entry: { agentId: string; cwd?: string | null; text: string }): void {
    if (!this.db) return;
    const text = (entry.text ?? '').trim();
    if (!text || !entry.agentId) return;
    this.db.prepare('INSERT INTO command_history (agent_id, cwd, text, ts) VALUES (?, ?, ?, ?)')
      .run(entry.agentId, entry.cwd ?? null, text, Date.now());
  }

  /** Most-recent-first history, optionally scoped to one agent. */
  listHistory(agentId?: string, limit = 100): CommandHistoryRow[] {
    if (!this.db) return [];
    const lim = clampLimit(limit, 100);
    const rows = agentId
      ? this.db.prepare(
          'SELECT id, agent_id AS agentId, cwd, text, ts FROM command_history WHERE agent_id = ? ORDER BY ts DESC, id DESC LIMIT ?'
        ).all(agentId, lim)
      : this.db.prepare(
          'SELECT id, agent_id AS agentId, cwd, text, ts FROM command_history ORDER BY ts DESC, id DESC LIMIT ?'
        ).all(lim);
    return rows as CommandHistoryRow[];
  }

  // ─── conversation history (say/ask, across sessions) ──────────────────────

  /** How many rows of one agent's conversation are kept. Chosen with the human:
   *  weeks of a busy agent, a few MB for a floor of ten, and no unbounded
   *  growth. Trimmed oldest-first as new rows land. */
  static readonly ACTIVITY_CAP = 5000;

  /**
   * Store conversation rows, ignoring any already held.
   *
   * Idempotent by (agent, kind, second, text): callers re-read the same
   * transcript window on every poll and after every restart, and the owner's
   * side is ALSO written at the moment it is sent, so the same line legitimately
   * arrives twice from two directions.
   *
   * @returns how many rows were new
   */
  addActivity(agentId: string, rows: readonly { kind: 'say' | 'ask'; text: string; at?: number }[]): number {
    if (!this.db || !agentId || !rows.length) return 0;
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO activity (agent_id, kind, text, ts, dedupe) VALUES (?, ?, ?, ?, ?)'
    );
    const run = this.db.transaction((list: readonly { kind: 'say' | 'ask'; text: string; at?: number }[]) => {
      let added = 0;
      for (const r of list) {
        const text = (r.text ?? '').trim();
        if (!text || (r.kind !== 'say' && r.kind !== 'ask')) continue;
        const ts = Number.isFinite(r.at) ? Math.floor(r.at as number) : Date.now();
        added += insert.run(agentId, r.kind, text, ts, dedupeKey(r.kind, ts, text)).changes;
      }
      return added;
    });
    const added = run(rows);
    if (added) this.trimActivity(agentId);
    return added;
  }

  /** One agent's conversation, oldest first — the order it is read in. */
  activity(agentId: string, limit = PersistStore.ACTIVITY_CAP): Array<{ kind: 'say' | 'ask'; text: string; at: number }> {
    if (!this.db || !agentId) return [];
    // Not clampLimit: that caps at 1000, which is the right ceiling for a
    // history SEARCH and the wrong one for a conversation whose cap is 5000.
    const want = Math.min(PersistStore.ACTIVITY_CAP, Math.max(1, Math.floor(Number(limit) || 200)));
    const rows = this.db.prepare(
      'SELECT kind, text, ts FROM activity WHERE agent_id = ? ORDER BY ts DESC, id DESC LIMIT ?'
    ).all(agentId, want) as Array<{ kind: string; text: string; ts: number }>;
    return rows
      .reverse()
      .map((r) => ({ kind: r.kind === 'ask' ? 'ask' as const : 'say' as const, text: r.text, at: r.ts }));
  }

  /** Drop everything past the cap for one agent, oldest first. */
  private trimActivity(agentId: string): void {
    if (!this.db) return;
    this.db.prepare(
      `DELETE FROM activity WHERE agent_id = ? AND id NOT IN (
         SELECT id FROM activity WHERE agent_id = ? ORDER BY ts DESC, id DESC LIMIT ?
       )`
    ).run(agentId, agentId, PersistStore.ACTIVITY_CAP);
  }

  /** Forget one agent's conversation — for a deleted agent, or a reset. */
  forgetActivity(agentId: string): void {
    if (!this.db || !agentId) return;
    this.db.prepare('DELETE FROM activity WHERE agent_id = ?').run(agentId);
  }

  /** Substring search over prompt text, most-recent-first. */
  searchHistory(query: string, limit = 50): CommandHistoryRow[] {
    if (!this.db) return [];
    const q = (query ?? '').trim();
    if (!q) return [];
    const lim = clampLimit(limit, 50);
    // Escape LIKE wildcards so a literal % or _ in the query isn't a metachar.
    const needle = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    return this.db.prepare(
      "SELECT id, agent_id AS agentId, cwd, text, ts FROM command_history WHERE text LIKE ? ESCAPE '\\' ORDER BY ts DESC, id DESC LIMIT ?"
    ).all(needle, lim) as CommandHistoryRow[];
  }
}

/** The identity of one conversation line: who said it, when (to the second,
 *  because two reads of the same file can differ in nothing else) and what.
 *  Long text is hashed rather than stored twice — the row already has it. */
function dedupeKey(kind: string, ts: number, text: string): string {
  const second = Math.floor(ts / 1000);
  const head = text.slice(0, 64);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = (((h << 5) + h) ^ text.charCodeAt(i)) | 0;
  return `${kind}|${second}|${(h >>> 0).toString(36)}|${head}`;
}

/** Coerce an untrusted limit into [1, 1000] with a sane fallback. */
function clampLimit(n: number, fallback: number): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(1000, v);
}
