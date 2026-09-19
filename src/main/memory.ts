/**
 * Searchable memory for the hive.
 *
 * Every agent writes `agents/<id>/memory.md` by hand — plain markdown, the only
 * copy of anything it has learned. This indexes those files so the whole crew
 * can search each other's notes.
 *
 * WHY THERE IS NO MEMPALACE ANY MORE. The previous implementation shelled out
 * to a Python CLI (`mempalace mine` / `search` / `wake-up`), which meant a uv
 * toolchain, a model download and — when that would not install — a Docker
 * image built on first run. On this machine it ended where those stacks
 * usually end: `wake-up` crashing inside numpy's native loader, semantic recall
 * dead, and a memory panel that said "on" about something unusable. The
 * feature that mattered was "search the crew's notes", and that does not need
 * any of it.
 *
 * WHAT REPLACED IT. `memory-core.cjs` — SQLite with FTS5 and bm25 ranking,
 * through better-sqlite3, which the app already ships for its own database; a
 * pure-JS jsonl index when that cannot load. Keyword recall rather than
 * meaning, and worth naming as the trade: a search for "auth" will not surface
 * a note about "login" unless the word is in it. In exchange there is nothing
 * to install, nothing to keep running, and no state that can be lost — the
 * index is derived, and the repair for any corruption is to rebuild it from the
 * markdown.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Non-memory files an indexing pass must not ingest: the agent's own settings
 *  and cursor, the raw inbox/outbox message JSON, a Codex worker's private
 *  CODEX_HOME. None of it is a note anyone wrote, and all of it is noise in a
 *  search result — and in the hive's git history, which is the other half of
 *  why this list exists.
 *
 *  MUST STAY IN SYNC with the same list in hive.ts (which writes it at spawn;
 *  this one reaches agents that are not currently running). A test pins them
 *  together, because drift here has no symptom until a repo bloats. */
const MINE_IGNORE_LINES = ['settings.json', 'cursor.json', 'inbox/', 'outbox/', '.codex/'];

function ensureMineIgnore(agentDir: string): void {
  const path = join(agentDir, '.gitignore');
  let existing = '';
  try { if (existsSync(path)) existing = readFileSync(path, 'utf8'); } catch { return; }
  const have = new Set(existing.split('\n').map((l) => l.trim()));
  const missing = MINE_IGNORE_LINES.filter((l) => !have.has(l));
  if (missing.length === 0) return;
  const prefix = existing && !existing.endsWith('\n') ? existing + '\n' : existing;
  try { writeFileSync(path, prefix + missing.join('\n') + '\n', 'utf8'); } catch { /* best-effort */ }
}

export interface MemorySettings { enabled: boolean }

export interface MemoryStatus {
  /** Always true: the index ships with the app. Kept because the UI and the
   *  hive prompt both read it, and "is memory available" is still a question
   *  worth answering — it is just no longer ever "no". */
  available: boolean;
  enabled: boolean;
  active: boolean;
  /** An index exists on disk. */
  initialized: boolean;
  /** Where the index lives. Named `palacePath` still because the renderer, the
   *  IPC channel and the hive prompt all read that key; renaming it is a
   *  separate change from removing the thing it used to point at. */
  palacePath: string | null;
  /** Which backend answered — 'sqlite' or 'jsonl'. The panel says so, because
   *  the fallback is slower and worth knowing about. */
  backend: string | null;
  chunks: number;
  agents: number;
}

/** Re-index changed memories on this cadence. Cheap: a pass re-reads only the
 *  files whose mtime or size moved. */
const INDEX_INTERVAL_MS = 5 * 60_000;

interface Store {
  backend: string;
  root: string;
  close(): void;
  index(sources: Array<{ path: string; agentId: string }>): { indexed: number; skipped: number; backend: string };
  search(query: string, opts?: { limit?: number; agentId?: string }): Array<{
    agentId: string; title: string; source: string; chunkIdx: number; score: number; snippet: string;
  }>;
  stats(): { backend: string; chunks: number; agents: number; root: string };
}

/** Loaded through `require` rather than an import: it is a .cjs the spawned
 *  agents' own CLI also requires, and it must stay the same single copy. */
function core(): { openStore(root: string): Store } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('./memory-core.cjs') as { openStore(root: string): Store };
}

export class MemoryManager {
  private store: Store | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly getHome: () => string | null,
    private readonly getSettings: () => MemorySettings
  ) {}

  /** Where the index lives — beside the hive, not inside it, so a `git clean`
   *  in the hive repo cannot take it (and it is derived, so that would be
   *  survivable anyway). */
  palacePath(): string | null {
    const home = this.getHome();
    return home ? join(home, 'memory-index') : null;
  }

  available(): boolean { return true; }
  enabled(): boolean { return this.getSettings().enabled !== false; }
  active(): boolean { return this.enabled() && this.getHome() !== null; }

  /** The hive's agents directory, or null. */
  private agentsDir(): string | null {
    const home = this.getHome();
    return home ? join(home, 'hive', 'agents') : null;
  }

  /** Every `memory.md` on the floor, with the agent it belongs to. */
  private sources(): Array<{ path: string; agentId: string }> {
    const dir = this.agentsDir();
    if (!dir || !existsSync(dir)) return [];
    const out: Array<{ path: string; agentId: string }> = [];
    let ids: string[] = [];
    try { ids = readdirSync(dir); } catch { return out; }
    for (const agentId of ids) {
      const agentDir = join(dir, agentId);
      const md = join(agentDir, 'memory.md');
      if (!existsSync(md)) continue;
      ensureMineIgnore(agentDir);
      out.push({ path: md, agentId });
    }
    return out;
  }

  private open(): Store | null {
    if (this.store) return this.store;
    const root = this.palacePath();
    if (!root || !this.enabled()) return null;
    try { this.store = core().openStore(root); } catch (e) {
      console.error('[memory] could not open the index:', e);
      return null;
    }
    return this.store;
  }

  status(): MemoryStatus {
    const root = this.palacePath();
    const store = this.open();
    const stats = store ? store.stats() : null;
    return {
      available: true,
      enabled: this.enabled(),
      active: this.active(),
      initialized: !!root && existsSync(root),
      palacePath: root,
      backend: stats?.backend ?? null,
      chunks: stats?.chunks ?? 0,
      agents: stats?.agents ?? 0
    };
  }

  refresh(): MemoryStatus { return this.status(); }

  /** Index everything that changed. Returns what a caller can report. */
  mineNow(): { ok: boolean; output: string; error?: string } {
    const store = this.open();
    if (!store) return { ok: false, output: '', error: 'memory is off, or no workspace is open' };
    try {
      const res = store.index(this.sources());
      return { ok: true, output: `indexed ${res.indexed}, unchanged ${res.skipped} (${res.backend})` };
    } catch (e) {
      return { ok: false, output: '', error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Search the crew's notes. Returns text, because every call site prints it
   *  into a terminal or a panel rather than rendering rows. */
  search(query: string, opts: { wing?: string; results?: number } = {}): Promise<{ ok: boolean; output: string; error?: string }> {
    const store = this.open();
    if (!store) return Promise.resolve({ ok: false, output: '', error: 'memory is off, or no workspace is open' });
    try {
      // Index first: a search that misses a note written a minute ago reads as
      // memory not working, and the pass is a no-op when nothing changed.
      store.index(this.sources());
      const hits = store.search(query, { limit: opts.results ?? 8, agentId: opts.wing });
      if (hits.length === 0) return Promise.resolve({ ok: true, output: `no memory matches "${query}"` });
      const lines = hits.map((h) => `${h.agentId} · ${h.title || 'note'}\n  ${h.snippet}`);
      return Promise.resolve({ ok: true, output: lines.join('\n\n') });
    } catch (e) {
      return Promise.resolve({ ok: false, output: '', error: e instanceof Error ? e.message : String(e) });
    }
  }

  /** What an agent reads at the start of a task: its own notes, most recent
   *  first. The old CLI called this "wake-up" and the name stuck in the IPC. */
  wakeUp(wing?: string): Promise<{ ok: boolean; output: string; error?: string }> {
    const store = this.open();
    if (!store) return Promise.resolve({ ok: false, output: '', error: 'memory is off, or no workspace is open' });
    try {
      store.index(this.sources());
      const stats = store.stats();
      const own = wing
        ? this.sources().find((s) => s.agentId === wing)
        : undefined;
      const notes = own && existsSync(own.path) ? readFileSync(own.path, 'utf8').slice(-4000) : '';
      const head = `memory index: ${stats.chunks} sections from ${stats.agents} agent(s) (${stats.backend})`;
      return Promise.resolve({ ok: true, output: notes ? `${head}\n\n${notes}` : head });
    } catch (e) {
      return Promise.resolve({ ok: false, output: '', error: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Environment handed to each spawned agent. Empty now: recall is an IPC call
   *  and a `hive-node` require, not a CLI on PATH with a model to point at. */
  env(): Record<string, string> { return {}; }

  start(): void {
    if (this.timer || !this.active()) return;
    this.mineNow();
    this.timer = setInterval(() => { this.mineNow(); }, INDEX_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    try { this.store?.close(); } catch { /* already closed */ }
    this.store = null;
  }
}
