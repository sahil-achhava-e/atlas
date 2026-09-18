'use strict';
/**
 * memory-core.cjs — searchable memory for the hive, with no install of any kind.
 *
 * Every agent already writes `agents/<id>/memory.md` by hand. This indexes those
 * files so the whole crew can search each other's notes, which is the part
 * MemPalace did and the part that cost a Python toolchain, a container and a
 * model download to get. Keyword recall, not meaning — worth naming, because it
 * is the trade that makes "download the app and run it" true.
 *
 * TWO BACKENDS, ONE INTERFACE. SQLite is the default: it ships with the app
 * (better-sqlite3, already used by db.ts), writes in transactions, and gets bm25
 * ranking from FTS5. Where it cannot load — a policy that refuses native
 * addons, an ABI mismatch, a build without FTS5 — the store silently falls back
 * to a jsonl index scored with the knowledge graph's own scorer. Both are
 * exercised by the tests; neither is a stub.
 *
 * THE INDEX IS DERIVED. `memory.md` is the only copy of anything. Delete the
 * index, corrupt it, ship a version that reads it wrong: the repair is to
 * rebuild from the markdown, which is why neither backend needs a reaper, a
 * migration or a quarantine (cf. palaceReap.ts, which exists because Chroma held
 * the only copy of its vectors).
 *
 * PURE JS at the entry point, so a spawned agent's CLI can require it through
 * `hive-node` exactly like kg.cjs requires kg-core.cjs.
 *
 * Store layout (rooted at MEMORY_ROOT, default <hive>/memory-index/):
 *   index.db       sqlite backend: chunks + chunks_fts + sources
 *   index.jsonl    jsonl backend: one JSON line per chunk
 *   state.json     jsonl backend: per-source mtime/size, so a pass re-reads only what changed
 */

const fs = require('node:fs');
const path = require('node:path');

const kg = require('./kg-core.cjs');
const { tokenize, scoreChunk, makeSnippet, chunkText } = kg;

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;
/** A section longer than this is split with the document chunker — an agent that
 *  pastes a 40KB log under one heading should not become one unsearchable blob. */
const MAX_SECTION_CHARS = 4000;

function clampLimit(n, fallback = DEFAULT_LIMIT) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.floor(v), MAX_LIMIT);
}

/**
 * Split a memory.md into the sections its author wrote.
 *
 * `##` headings are the unit an agent writes and the unit reflect.ts keeps or
 * evicts when it condenses, so they make better chunks than a character window:
 * the heading is a real title, and a hit lands on a whole thought. Text before
 * the first heading is kept under a "(top)" title rather than dropped — that is
 * where the pinned durable facts live.
 */
function splitSections(md) {
  const text = String(md || '').replace(/\r\n/g, '\n');
  if (!text.trim()) return [];
  const out = [];
  const lines = text.split('\n');
  let title = '(top)';
  let buf = [];
  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) out.push({ title, text: body });
    buf = [];
  };
  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (h) {
      flush();
      title = h[2];
    } else {
      buf.push(line);
    }
  }
  flush();
  // Oversized sections become several chunks that keep the heading as title.
  const chunks = [];
  for (const s of out) {
    if (s.text.length <= MAX_SECTION_CHARS) { chunks.push(s); continue; }
    for (const piece of chunkText(s.text, MAX_SECTION_CHARS, 150)) {
      chunks.push({ title: s.title, text: piece });
    }
  }
  return chunks;
}

/** Read one source file into chunk records. Missing/unreadable → no records. */
function chunksFor(source) {
  let md = '';
  try { md = fs.readFileSync(source.path, 'utf8'); } catch { return []; }
  return splitSections(md).map((s, i) => ({
    agentId: source.agentId,
    title: s.title,
    text: s.text,
    chunkIdx: i,
    source: source.path
  }));
}

function statOf(p) {
  try {
    const st = fs.statSync(p);
    return { mtime: Math.floor(st.mtimeMs), size: st.size };
  } catch {
    return null;
  }
}

// ─── sqlite backend ──────────────────────────────────────────────────────────

/**
 * Open the SQLite store, or return null if this machine cannot give us one.
 *
 * Null is a normal answer, not an error: the module is loaded by the Electron
 * main process AND by an agent's CLI, and a native addon can fail in either for
 * reasons no retry fixes (blocked dlopen, ABI mismatch, no FTS5 compiled in).
 * The caller falls back; nothing is logged as a failure.
 */
function openSqlite(root, deps = {}) {
  if (process.env.MEMORY_FORCE_JSONL === '1') return null;
  // `deps.Database` exists so the tests can drive this SQL with a stand-in driver
  // on a machine where better-sqlite3 cannot load. It is never passed in
  // production — the default require IS the contract.
  let Database = deps.Database;
  if (!Database) {
    try { Database = require('better-sqlite3'); } catch { return null; }
  }
  let db;
  try {
    fs.mkdirSync(root, { recursive: true });
    db = new Database(path.join(root, 'index.db'));
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        path TEXT PRIMARY KEY, agentId TEXT NOT NULL, mtime INTEGER, size INTEGER);
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY, agentId TEXT NOT NULL, title TEXT, text TEXT NOT NULL,
        chunkIdx INTEGER, source TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        text, title, content='chunks', content_rowid='id');
    `);
  } catch {
    try { if (db) db.close(); } catch { /* nothing to close */ }
    return null;   // no FTS5, no write permission, no module — jsonl it is
  }
  return sqliteStore(db, root);
}

function sqliteStore(db, root) {
  const replace = db.transaction((source, recs, st) => {
    const olds = db.prepare('SELECT id FROM chunks WHERE source = ?').all(source.path);
    const delFts = db.prepare("INSERT INTO chunks_fts(chunks_fts, rowid, text, title) VALUES('delete', ?, ?, ?)");
    const getRow = db.prepare('SELECT id, text, title FROM chunks WHERE id = ?');
    for (const { id } of olds) {
      const row = getRow.get(id);
      if (row) delFts.run(row.id, row.text, row.title);
    }
    db.prepare('DELETE FROM chunks WHERE source = ?').run(source.path);
    const ins = db.prepare(
      'INSERT INTO chunks (agentId, title, text, chunkIdx, source) VALUES (?, ?, ?, ?, ?)');
    const insFts = db.prepare('INSERT INTO chunks_fts(rowid, text, title) VALUES (?, ?, ?)');
    for (const r of recs) {
      const info = ins.run(r.agentId, r.title, r.text, r.chunkIdx, r.source);
      insFts.run(info.lastInsertRowid, r.text, r.title);
    }
    db.prepare('INSERT OR REPLACE INTO sources (path, agentId, mtime, size) VALUES (?, ?, ?, ?)')
      .run(source.path, source.agentId, st ? st.mtime : 0, st ? st.size : 0);
  });

  return {
    backend: 'sqlite',
    root,
    close() { try { db.close(); } catch { /* already closed */ } },

    index(sources) {
      let indexed = 0, skipped = 0;
      for (const source of sources) {
        const st = statOf(source.path);
        if (!st) continue;
        const prev = db.prepare('SELECT mtime, size FROM sources WHERE path = ?').get(source.path);
        if (prev && prev.mtime === st.mtime && prev.size === st.size) { skipped++; continue; }
        replace(source, chunksFor(source), st);
        indexed++;
      }
      return { indexed, skipped, backend: 'sqlite' };
    },

    search(query, opts = {}) {
      const terms = tokenize(query);
      if (!terms.length) return [];
      const limit = clampLimit(opts.limit);
      // Every term ORed as a prefix match: an agent searching "deploy keys" should
      // still find "deploy key". FTS5 syntax characters are stripped by tokenize.
      const match = terms.map((t) => `${t}*`).join(' OR ');
      let rows;
      try {
        rows = db.prepare(`
          SELECT c.agentId, c.title, c.text, c.chunkIdx, c.source, bm25(chunks_fts) AS rank
          FROM chunks_fts JOIN chunks c ON c.id = chunks_fts.rowid
          WHERE chunks_fts MATCH ? ${opts.agentId ? 'AND c.agentId = ?' : ''}
          ORDER BY rank LIMIT ?
        `).all(...(opts.agentId ? [match, opts.agentId, limit] : [match, limit]));
      } catch {
        return [];
      }
      return rows.map((r) => ({
        agentId: r.agentId, title: r.title, source: r.source, chunkIdx: r.chunkIdx,
        // bm25 returns lower-is-better; flip it so every backend ranks the same way.
        score: Math.round(-r.rank * 1000) / 1000,
        snippet: makeSnippet(r.text, terms)
      }));
    },

    stats() {
      const c = db.prepare('SELECT COUNT(*) AS n FROM chunks').get();
      const a = db.prepare('SELECT COUNT(DISTINCT agentId) AS n FROM chunks').get();
      return { backend: 'sqlite', chunks: c ? c.n : 0, agents: a ? a.n : 0, root };
    }
  };
}

// ─── jsonl backend ───────────────────────────────────────────────────────────

/**
 * The fallback: an append-free jsonl index rewritten atomically.
 *
 * Every write goes to a temp file and is renamed over the old one, so a crash
 * mid-write leaves either the previous index or the new one, never half a line.
 * Only the main process writes; agents read. That is the same arrangement the
 * hive router uses for messages, for the same reason.
 */
function jsonlStore(root) {
  fs.mkdirSync(root, { recursive: true });
  const idxPath = path.join(root, 'index.jsonl');
  const statePath = path.join(root, 'state.json');

  const readAll = () => {
    let raw = '';
    try { raw = fs.readFileSync(idxPath, 'utf8'); } catch { return []; }
    const out = [];
    for (const line of raw.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try { out.push(JSON.parse(s)); } catch { /* a torn line is dropped, not fatal */ }
    }
    return out;
  };
  const writeAll = (recs) => {
    const tmp = `${idxPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, recs.map((r) => JSON.stringify(r)).join('\n') + (recs.length ? '\n' : ''), 'utf8');
    fs.renameSync(tmp, idxPath);
  };
  const readState = () => {
    try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return {}; }
  };
  const writeState = (st) => {
    const tmp = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(st, null, 2), 'utf8');
    fs.renameSync(tmp, statePath);
  };

  return {
    backend: 'jsonl',
    root,
    close() { /* nothing held open */ },

    index(sources) {
      const state = readState();
      let recs = null;
      let indexed = 0, skipped = 0;
      for (const source of sources) {
        const st = statOf(source.path);
        if (!st) continue;
        const prev = state[source.path];
        if (prev && prev.mtime === st.mtime && prev.size === st.size) { skipped++; continue; }
        if (recs === null) recs = readAll();
        recs = recs.filter((r) => r.source !== source.path).concat(chunksFor(source));
        state[source.path] = { agentId: source.agentId, mtime: st.mtime, size: st.size };
        indexed++;
      }
      if (recs !== null) { writeAll(recs); writeState(state); }
      return { indexed, skipped, backend: 'jsonl' };
    },

    search(query, opts = {}) {
      const terms = tokenize(query);
      if (!terms.length) return [];
      const limit = clampLimit(opts.limit);
      const scored = [];
      for (const rec of readAll()) {
        if (opts.agentId && rec.agentId !== opts.agentId) continue;
        const score = scoreChunk(rec, terms, query);
        if (score > 0) scored.push({ rec, score });
      }
      scored.sort((a, b) =>
        b.score - a.score
        || String(a.rec.agentId).localeCompare(String(b.rec.agentId))
        || (a.rec.chunkIdx - b.rec.chunkIdx));
      return scored.slice(0, limit).map(({ rec, score }) => ({
        agentId: rec.agentId, title: rec.title, source: rec.source, chunkIdx: rec.chunkIdx,
        score: Math.round(score * 1000) / 1000,
        snippet: makeSnippet(rec.text, terms)
      }));
    },

    stats() {
      const recs = readAll();
      return {
        backend: 'jsonl',
        chunks: recs.length,
        agents: new Set(recs.map((r) => r.agentId)).size,
        root
      };
    }
  };
}

/**
 * Open the memory store for `root`, SQLite first, jsonl if it cannot be had.
 *
 * Callers never choose. `store.backend` says which one answered, which is what
 * the Memory panel reports and what the tests assert against.
 */
function openStore(root, deps = {}) {
  return openSqlite(root, deps) || jsonlStore(root);
}

module.exports = { openStore, splitSections, chunksFor, DEFAULT_LIMIT, MAX_SECTION_CHARS };
