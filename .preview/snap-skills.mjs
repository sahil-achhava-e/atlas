// Same scan and precedence as src/main/skills.ts, run on this machine so the
// browser preview shows the real list instead of an empty one.
import { readdirSync, readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const fm = (md) => {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out = {};
  const n = m[1].match(/^name:\s*(.+)$/m); if (n) out.name = n[1].trim().replace(/^["']|["']$/g, '');
  const b = m[1].match(/^description:\s*[|>]-?[ \t]*\r?\n((?:[ \t]+.*(?:\r?\n|$))+)/m);
  if (b) out.description = b[1].split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ').trim();
  else { const d = m[1].match(/^description:\s*(.+)$/m); if (d) out.description = d[1].trim().replace(/^["']|["']$/g, ''); }
  return out;
};
const scan = (dir, scope) => {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const sd = join(dir, e), md = join(sd, 'SKILL.md');
    if (!statSync(sd).isDirectory() || !existsSync(md)) continue;
    const f = fm(readFileSync(md, 'utf8'));
    out.push({ id: `${scope}:${e}`, name: f.name || e, description: f.description || '', provider: 'claude', scope, path: sd });
  }
  return out;
};

const cfgPath = join(homedir(), 'Library/Application Support/atlas/config.json');
const repos = existsSync(cfgPath) ? (JSON.parse(readFileSync(cfgPath, 'utf8')).registeredRepos ?? []) : [];
const cwds = [...new Set([...repos, process.cwd(), join(homedir(), 'Desktop/acme-events')])];

const found = [
  ...scan(join(process.cwd(), 'resources/skills'), 'bundled'),
  ...scan(join(homedir(), '.claude/skills'), 'user'),
  ...cwds.flatMap((c) => scan(join(c, '.claude/skills'), 'project'))
];
const rank = { project: 3, user: 2, bundled: 1 };
const best = new Map();
for (const s of found) {
  const k = s.name.toLowerCase();
  if (!best.has(k) || rank[s.scope] > rank[best.get(k).scope]) best.set(k, s);
}
const list = [...best.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync('.preview/skills-snapshot.json', JSON.stringify(list, null, 2));
console.log(list.length, 'skills:', list.map((s) => `${s.scope}/${s.name}`).join(', '));
