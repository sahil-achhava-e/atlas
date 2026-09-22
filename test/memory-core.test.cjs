'use strict';

// Memory index: the same contract must hold on both backends.
//
// The sqlite one is the default and the jsonl one is what answers when a native
// addon cannot load — so the interesting assertions run TWICE, once per backend,
// rather than testing the fallback as an afterthought. The sqlite pass is skipped
// (not failed) where better-sqlite3 cannot load at all, which is the case on a
// machine whose policy blocks native modules: that is the very condition the
// fallback exists for, and a red test there would be noise.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openStore, splitSections } = require('../src/main/memory-core.cjs');

function tmpRoot(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `atlas-mem-${tag}-`));
}

function writeMemory(dir, agentId, body) {
  const agentDir = path.join(dir, 'agents', agentId);
  fs.mkdirSync(agentDir, { recursive: true });
  const p = path.join(agentDir, 'memory.md');
  fs.writeFileSync(p, body, 'utf8');
  return { agentId, path: p };
}

const PAM = `Durable facts pinned at the top.

## Deploy notes

The deploy key rotates every 90 days and lives in the vault.

## Rollbacks

Never roll back past a migration.
`;

test('sections come from the headings the agent wrote', () => {
  const secs = splitSections(PAM);
  assert.deepEqual(secs.map((s) => s.title), ['(top)', 'Deploy notes', 'Rollbacks']);
  // Text above the first heading is kept: that is where pinned facts live.
  assert.match(secs[0].text, /Durable facts/);
});

test('an oversized section is split but keeps its heading', () => {
  const big = `## Log dump\n\n${'x y z '.repeat(2000)}`;
  const secs = splitSections(big);
  assert.ok(secs.length > 1, 'should split');
  assert.ok(secs.every((s) => s.title === 'Log dump'));
});

test('empty input indexes to nothing rather than throwing', () => {
  assert.deepEqual(splitSections(''), []);
  assert.deepEqual(splitSections(null), []);
});

// ─── the contract, run against each available backend ───────────────────────

function contractTests(label, makeStore) {
  test(`${label}: indexes memory.md and finds it by keyword`, () => {
    const hive = tmpRoot(`${label}-find`);
    const store = makeStore(hive);
    try {
      const src = writeMemory(hive, 'pam', PAM);
      const res = store.index([src]);
      assert.equal(res.indexed, 1);

      const hits = store.search('deploy key');
      assert.ok(hits.length > 0, 'expected a hit for "deploy key"');
      assert.equal(hits[0].agentId, 'pam');
      assert.equal(hits[0].title, 'Deploy notes');
      assert.match(hits[0].snippet, /rotates every 90 days/);

      // A query that matches nothing returns nothing, not everything.
      assert.deepEqual(store.search('kubernetes helm chart'), []);
      // An empty query is not a wildcard.
      assert.deepEqual(store.search('   '), []);
    } finally { store.close(); }
  });

  test(`${label}: an unchanged file is skipped, a changed one is re-read`, () => {
    const hive = tmpRoot(`${label}-incr`);
    const store = makeStore(hive);
    try {
      const src = writeMemory(hive, 'pam', PAM);
      assert.equal(store.index([src]).indexed, 1);
      assert.equal(store.index([src]).skipped, 1, 'second pass must not re-read');

      // Rewrite with different content AND a different size, so the mtime
      // granularity of the filesystem cannot mask the change.
      fs.writeFileSync(src.path, `${PAM}\n## Vault\n\nThe vault is sealed on Fridays for maintenance.\n`, 'utf8');
      assert.equal(store.index([src]).indexed, 1);

      const hits = store.search('vault sealed');
      assert.ok(hits.some((h) => h.title === 'Vault'), 'new section must be searchable');
      // The old rows for that file are replaced, not duplicated.
      const deploy = store.search('deploy key');
      assert.equal(deploy.filter((h) => h.title === 'Deploy notes').length, 1);
    } finally { store.close(); }
  });

  test(`${label}: one agent's search can be scoped to one agent`, () => {
    const hive = tmpRoot(`${label}-scope`);
    const store = makeStore(hive);
    try {
      store.index([
        writeMemory(hive, 'pam', PAM),
        writeMemory(hive, 'jim', '## Deploy notes\n\nJim also knows the deploy key story.\n')
      ]);
      assert.equal(store.stats().agents, 2);
      const mine = store.search('deploy key', { agentId: 'jim' });
      assert.ok(mine.length > 0);
      assert.ok(mine.every((h) => h.agentId === 'jim'));
    } finally { store.close(); }
  });

  test(`${label}: a missing source file is not fatal`, () => {
    const hive = tmpRoot(`${label}-missing`);
    const store = makeStore(hive);
    try {
      const res = store.index([{ agentId: 'ghost', path: path.join(hive, 'agents', 'ghost', 'memory.md') }]);
      assert.equal(res.indexed, 0);
      assert.deepEqual(store.search('anything'), []);
    } finally { store.close(); }
  });
}

// jsonl always runs — it is the floor, and it has no dependencies.
contractTests('jsonl', (hive) => {
  process.env.MEMORY_FORCE_JSONL = '1';
  const store = openStore(path.join(hive, 'memory-index'));
  delete process.env.MEMORY_FORCE_JSONL;
  assert.equal(store.backend, 'jsonl');
  return store;
});

// ─── sqlite ─────────────────────────────────────────────────────────────────
//
// The SQL is the risky half — FTS5 external-content tables want their deletes
// spelled a particular way — and it is also the half that runs for every normal
// user. So it is exercised even where better-sqlite3 cannot load, by driving the
// same code with node:sqlite through a small adapter. That tests OUR SQL against
// a real SQLite; what it cannot test is better-sqlite3 itself.
function nodeSqliteDriver() {
  let DatabaseSync;
  try { ({ DatabaseSync } = require('node:sqlite')); } catch { return null; }
  try {
    const probe = new DatabaseSync(':memory:');
    probe.exec('CREATE VIRTUAL TABLE t USING fts5(x)');   // no FTS5 → no stand-in
    probe.close();
  } catch { return null; }

  return function Database(file) {
    const db = new DatabaseSync(file);
    return {
      pragma: (p) => db.exec(`PRAGMA ${p}`),
      exec: (sql) => db.exec(sql),
      prepare: (sql) => {
        const st = db.prepare(sql);
        return {
          run: (...a) => st.run(...a),
          get: (...a) => st.get(...a),
          all: (...a) => st.all(...a)
        };
      },
      transaction: (fn) => (...a) => {
        db.exec('BEGIN');
        try { const r = fn(...a); db.exec('COMMIT'); return r; }
        catch (e) { try { db.exec('ROLLBACK'); } catch { /* already rolled back */ } throw e; }
      },
      close: () => db.close()
    };
  };
}

const realSqlite = (() => {
  const probe = tmpRoot('probe');
  try {
    const store = openStore(path.join(probe, 'memory-index'));
    const ok = store.backend === 'sqlite';
    store.close();
    return ok;
  } catch { return false; }
})();

if (realSqlite) {
  contractTests('sqlite', (hive) => {
    const store = openStore(path.join(hive, 'memory-index'));
    assert.equal(store.backend, 'sqlite', 'expected the sqlite backend');
    return store;
  });
} else {
  const Database = nodeSqliteDriver();
  if (Database) {
    contractTests('sqlite(node:sqlite stand-in)', (hive) => {
      const store = openStore(path.join(hive, 'memory-index'), { Database });
      assert.equal(store.backend, 'sqlite', 'the stand-in driver must yield the sqlite backend');
      return store;
    });
  } else {
    test('no sqlite driver here at all — openStore still returns a working store', () => {
      const hive = tmpRoot('fallback');
      const store = openStore(path.join(hive, 'memory-index'));
      try {
        assert.equal(store.backend, 'jsonl', 'openStore must degrade, never throw');
      } finally { store.close(); }
    });
  }
}

test('a broken sqlite driver falls back instead of throwing', () => {
  const hive = tmpRoot('broken');
  const Database = function () { throw new Error('dlopen refused by policy'); };
  const store = openStore(path.join(hive, 'memory-index'), { Database });
  try {
    assert.equal(store.backend, 'jsonl');
    const src = writeMemory(hive, 'pam', PAM);
    store.index([src]);
    assert.ok(store.search('deploy key').length > 0, 'the fallback must actually work');
  } finally { store.close(); }
});

// THE ABORT. `db.prepare(...)` makes a native Statement whose destructor calls
// RemoveEnvironmentCleanupHook, and finalizing one at the wrong moment kills the
// process outright:
//
//   node[36452]: void node::RemoveEnvironmentCleanupHook(...) at hooks.cc:142
//   Assertion failed: (env) != nullptr
//
// This indexer re-prepared nine statements for every memory.md it touched, on a
// timer. That is what took the browser-mode server down.

test('the indexer prepares its statements once, not per file', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/memory-core.cjs'), 'utf8');
  const store = src.slice(src.indexOf('function sqliteStore'), src.indexOf('function jsonlStore'));
  const inside = store.slice(store.indexOf('const replace = db.transaction'));
  assert.doesNotMatch(inside, /db\.prepare\(/,
    'nothing past the statement cache may prepare — see the abort above');
  assert.match(store, /const q = \{/);
});

test('indexing the same file repeatedly stays correct with cached statements', () => {
  // The rewrite reused one set of statements across sources and passes; this is
  // the behaviour that would break if a cached statement held stale state.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-cached-'));
  const a = path.join(dir, 'a.md');
  const b = path.join(dir, 'b.md');
  fs.writeFileSync(a, '# One\n\nalphaoriginal wording\n');
  fs.writeFileSync(b, '# Two\n\nbetaword wording\n');
  const store = openStore(path.join(dir, 'index'));
  const sources = [{ path: a, agentId: 'ana' }, { path: b, agentId: 'bo' }];

  assert.equal(store.index(sources).indexed, 2);
  assert.equal(store.index(sources).skipped, 2, 'unchanged files are skipped on the second pass');

  fs.writeFileSync(a, '# One\n\nalpharewritten entirely\n');
  const again = store.index(sources);
  assert.equal(again.indexed, 1);
  assert.equal(again.skipped, 1);

  assert.equal(store.search('alpharewritten').length, 1);
  assert.equal(store.search('alphaoriginal').length, 0, 'the replaced chunk is really gone');
  assert.equal(store.search('betaword', { agentId: 'bo' }).length, 1, 'the filtered query works too');
  assert.equal(store.search('betaword', { agentId: 'ana' }).length, 0);
  assert.equal(store.stats().agents, 2);
  store.close();
});
