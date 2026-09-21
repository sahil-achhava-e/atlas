/**
 * Where the break-room gossip comes from.
 *
 * The floor has forty hand-written exchanges. They never change, and they
 * cannot know that a review has been sitting for two days or that a card is
 * waiting on the human. So this asks a cheap model for exchanges grounded in
 * what is actually on the floor right now — the roster, the fleet snapshot and
 * the board — and keeps them in a queue the renderer can take from instantly.
 *
 * WHY A QUEUE AND NOT A CALL PER CONVERSATION. A conversation starts the moment
 * two agents meet and a generation takes seconds, so a call per conversation
 * would either stall the bubble or land after they had walked back to their
 * desks. One call yields a dozen exchanges; the queue is topped up in the
 * background when it runs low and refreshed when it goes stale. That is a
 * handful of calls an hour for content that still reflects today.
 *
 * COST AND RESTRAINT. Haiku, one call at a time, never more often than every
 * few minutes, and only while there is a floor to gossip about. It is
 * decoration: if the model is missing, slow, rate-limited or talking nonsense,
 * the static pool covers it and nobody sees a thing.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveCommand, userShellPath } from './shellEnv';
import {
  EMPTY_POOL, parseGossip, poolIsStale, poolIsUsable,
  type GossipPool
} from '../shared/gossipPool';

/** Cheap by design — this is flavour text, not a decision. */
const GOSSIP_MODEL = 'claude-haiku-4-5-20251001';
/** Measured at 99s on a real floor: the CLI's own startup dominates, not the
 *  model. Generous, because a slow batch costs nothing — the floor is using the
 *  static pool while it waits. */
const TIMEOUT_MS = 240_000;
/** Never more often than this, however empty the queue gets. */
const MIN_GAP_MS = 4 * 60 * 1000;

export interface GossipContext {
  /** Off means never call a model; the floor keeps its own pool. */
  enabled: boolean;
  /** Hive root — where the cache lives and where the session runs. */
  root: string | null;
  /** The provider command to run (`claude`, usually). */
  command: string;
  /** Agents on the floor: who they are and what they do. */
  crew: Array<{ name: string; role?: string; project?: string; isGod?: boolean; isLead?: boolean }>;
  /** A few lines of what is going on — cards, who is idle, what is stuck. */
  happenings: string[];
}

export class GossipWriter {
  private pool: GossipPool = EMPTY_POOL;
  private lastRunAt = 0;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly ctx: () => GossipContext) {}

  private cachePath(root: string): string { return join(root, 'gossip.json'); }

  /** Load whatever a previous run left, so a restart does not start silent. */
  load(): void {
    const { root } = this.ctx();
    if (!root) return;
    try {
      const p = this.cachePath(root);
      if (!existsSync(p)) return;
      const parsed = JSON.parse(readFileSync(p, 'utf8')) as GossipPool;
      if (poolIsUsable(parsed)) this.pool = parsed;
    } catch { /* a bad cache is the same as no cache */ }
  }

  /** What the renderer gets. Empty is a valid answer — the floor has its own. */
  current(): GossipPool {
    return this.pool;
  }

  /**
   * Top up if the queue is thin or stale. Safe to call often: it returns at
   * once unless it is actually time to write more, and only ever runs one
   * session at a time.
   */
  maybeRefresh(): void {
    const { enabled, root, crew } = this.ctx();
    if (!enabled) return;
    // Nobody to gossip about: one agent cannot talk behind their own back.
    if (!root || crew.length < 2) return;
    if (this.inFlight) return;
    if (Date.now() - this.lastRunAt < MIN_GAP_MS) return;
    if (!poolIsStale(this.pool)) return;
    this.lastRunAt = Date.now();
    this.inFlight = this.write().finally(() => { this.inFlight = null; });
  }

  /**
   * One headless answer, or nothing.
   *
   * `claude -p` rather than the hidden-PTY session used elsewhere: that one
   * drives a terminal and scrapes the transcript to find the reply, which on a
   * workspace full of live agent transcripts finds the wrong file. Print mode
   * hands the answer back on stdout, which is all this needs.
   */
  private ask(prompt: string, command: string, cwd: string): Promise<string | null> {
    return new Promise((resolve) => {
      const exe = resolveCommand(command) ?? command;
      const args = [
        '-p', prompt,
        '--model', GOSSIP_MODEL,
        // Two lists of short lines. It has no business touching a file or a
        // shell to write them.
        '--disallowedTools', 'Edit,Write,NotebookEdit,Bash,Task'
      ];
      execFile(exe, args, {
        cwd,
        timeout: TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PATH: userShellPath() }
      }, (err, stdout) => {
        if (err && !stdout) { resolve(null); return; }
        resolve(stdout || null);
      });
    });
  }

  private async write(): Promise<void> {
    const { root, command, crew, happenings } = this.ctx();
    if (!root) return;
    try {
      const text = await this.ask(this.prompt(crew, happenings), command, root);
      if (!text) { console.warn('[gossip] no answer — keeping the static pool'); return; }
      const next = parseGossip(text);
      if (!poolIsUsable(next)) {
        console.warn('[gossip] nothing usable came back — keeping the static pool');
        return;
      }
      this.pool = next;
      try { writeFileSync(this.cachePath(root), JSON.stringify(next), 'utf8'); }
      catch { /* the pool is in memory; the cache is only for the next boot */ }
      console.log(`[gossip] ${next.work.length} work + ${next.about.length} about-someone exchanges`);
    } catch (e) {
      console.warn('[gossip] generation failed:', e instanceof Error ? e.message : String(e));
    }
  }

  /** The brief. Specific about format because the parser is strict, and
   *  specific about tone because a model asked for gossip will overshoot. */
  private prompt(crew: GossipContext['crew'], happenings: string[]): string {
    const who = crew.map((a) => {
      const bits = [a.name];
      if (a.isGod) bits.push('(runs the floor)');
      else if (a.isLead) bits.push(`(lead${a.project ? `, ${a.project}` : ''})`);
      else if (a.project) bits.push(`(${a.project})`);
      if (a.role && !a.isGod) bits.push(`— ${a.role}`);
      return `- ${bits.join(' ')}`;
    }).join('\n');

    return [
      'You write the break-room chatter for a pixel-art office of coding agents.',
      'Two of them meet at the coffee machine and exchange a few words. That is all this is.',
      '',
      'THE CREW:',
      who,
      '',
      'WHAT IS ACTUALLY HAPPENING TODAY:',
      happenings.length ? happenings.map((h) => `- ${h}`).join('\n') : '- a quiet day, nothing much moving',
      '',
      'Write two lists as strict JSON, no prose around it:',
      '',
      '{"work": [["line","line"], …], "about": [["line with {name}","line"], …]}',
      '',
      'RULES, all of them load-bearing:',
      '- "work" is about the work itself: builds, reviews, cards, tests, tokens. No names at all.',
      '- "about" is two colleagues talking about a THIRD person who is not there.',
      '  Use the literal placeholder {name} instead of a real name — the app fills it',
      '  in with whoever is genuinely out of earshot. At least one line per exchange',
      '  must contain {name}.',
      '- NEVER about the human who owns this floor. They are not a colleague and they',
      '  are not in the room. Only the agents listed above.',
      '- 2 to 5 lines per exchange, alternating speakers. HARD LIMIT 50 characters a',
      '  line — anything longer is thrown away, so keep them clipped.',
      '- Make them TALK, not interview each other. A beat can be a reaction rather',
      '  than a reply: "oh no", "of course", "that tracks", "you are joking".',
      '- Let them laugh, and put the laugh on ITS OWN LINE with nothing else on it:',
      '  exactly "ha", "hah", "heh", "pfft", "lol" or "ha, no". Only a line that is',
      '  nothing but laughter makes the avatar laugh on screen — "ha, what else" is',
      '  just a sentence. Use one in about half the exchanges, where something lands.',
      '- They moan. Being blocked, a review nobody picked up, a card with no',
      '  description, the same question twice, waiting all afternoon. Dry and weary,',
      '  the way people actually complain to each other at a coffee machine.',
      '- Mild digs at each other are fine. What is not: anything about someone being',
      '  bad at their job, or a bad person. Annoyed, never cruel.',
      '- Lower case, no emoji, no markdown, no stage directions, no names in "work".',
      '- Ground them in the list above: a real card, a real repo, a real wait.',
      '- 8 of each.',
      '',
      'Reply with the JSON object and nothing else.'
    ].join('\n');
  }
}
