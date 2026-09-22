#!/usr/bin/env node
/**
 * open-card.cjs — open a card on the board with a real id.
 *
 * WHY THIS EXISTS. `tasks.json` is hand-written by Atlas, by every project lead
 * and by the engineers patching their own card. Until now each of them invented
 * an id, so the board read `wi-7670` next to `pr-2115-review` and nothing could
 * be ordered. Worse: the ledger MERGES BY ID, so two agents inventing the same
 * slug silently fold two different cards into one. One allocator, one number
 * line per project, and a lock so two agents opening a card in the same second
 * get different numbers.
 *
 * Usage (HIVE_ROOT and AGENT_ID are already in every agent's environment):
 *   node open-card.cjs --project EVENTS --title "…" --description "…" \
 *        [--assignee <agent id>] [--status todo] [--priority 3] \
 *        [--depends TASK-EVENTS-1,TASK-EVENTS-2] [--hive /path/to/hive]
 *
 * Prints the new card's id on stdout and nothing else, so it can be captured.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LOCK_STALE_MS = 10_000;   // a lock older than this belonged to a dead run
const LOCK_WAIT_MS = 3_000;     // give up rather than hang an agent's turn

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

function fail(msg) {
  process.stderr.write(`open-card: ${msg}\n`);
  process.exit(1);
}

/** Mirrors shared/cardId.ts — kept in step by test/card-id.test.cjs. */
const CARD_ID_RE = /^TASK-([A-Z][A-Z0-9]{1,11})-([1-9][0-9]*)$/;

function cleanCode(raw) {
  const code = String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 2 || code.length > 12 || !/^[A-Z]/.test(code)) return null;
  return code;
}

function nextNumber(code, tasks, counters) {
  const stored = Number(counters?.[code]);
  let highest = Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
  for (const t of tasks) {
    const m = t && typeof t.id === 'string' ? CARD_ID_RE.exec(t.id) : null;
    if (m && m[1] === code) highest = Math.max(highest, Number(m[2]));
  }
  return highest + 1;
}

/** An exclusive lock via mkdir, which is atomic on every filesystem we run on. */
function withLock(lockDir, fn) {
  const started = Date.now();
  for (;;) {
    try { fs.mkdirSync(lockDir); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let age = Infinity;
      try { age = Date.now() - fs.statSync(lockDir).mtimeMs; } catch { age = Infinity; }
      if (age > LOCK_STALE_MS) { try { fs.rmdirSync(lockDir); } catch { /* raced */ } continue; }
      if (Date.now() - started > LOCK_WAIT_MS) fail('the board is locked by another write — try again');
      // Busy-wait briefly: this runs for milliseconds and blocking is the point.
      const until = Date.now() + 40;
      while (Date.now() < until) { /* spin */ }
    }
  }
  try { return fn(); } finally { try { fs.rmdirSync(lockDir); } catch { /* already gone */ } }
}

const args = parseArgs(process.argv.slice(2));
const hive = String(args.hive || process.env.HIVE_ROOT || '').trim();
if (!hive) fail('no hive root — pass --hive or run with HIVE_ROOT set');

const code = cleanCode(args.project);
if (!code) fail('--project must be the project\'s card code, 2-12 letters/digits (e.g. EVENTS)');

const title = String(args.title || '').trim();
if (!title) fail('--title is required: what will be true when the card is done');
const description = String(args.description || '').trim();
if (!description) fail('--description is required: two or three sentences someone who has not read the code can follow');

const file = path.join(hive, 'tasks.json');

const id = withLock(path.join(hive, '.tasks.lock'), () => {
  let doc = { tasks: [] };
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') fail(`tasks.json is unreadable: ${e.message}`); }
  const tasks = Array.isArray(doc.tasks) ? doc.tasks : [];
  const counters = (doc.counters && typeof doc.counters === 'object') ? doc.counters : {};

  const n = nextNumber(code, tasks, counters);
  const cardId = `TASK-${code}-${n}`;
  const card = {
    id: cardId,
    title,
    description,
    status: String(args.status || 'todo'),
    assignee: String(args.assignee || process.env.AGENT_ID || '').trim() || undefined,
    dependsOn: String(args.depends || '').split(',').map((d) => d.trim()).filter(Boolean),
    priority: Number.isFinite(Number(args.priority)) ? Number(args.priority) : 3,
    createdAt: new Date().toISOString()
  };
  if (!card.assignee) delete card.assignee;

  fs.writeFileSync(file,
    JSON.stringify({ ...doc, tasks: [...tasks, card], counters: { ...counters, [code]: n } }, null, 2));
  return cardId;
});

process.stdout.write(`${id}\n`);
