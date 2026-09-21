/**
 * Break-room gossip, written by a model instead of by hand.
 *
 * The static pools in scene/office/cafeteriaLines.ts are fine and they are the
 * fallback, but they are the same forty lines forever and they cannot know that
 * Hinata has had a review sitting for two days or that vms-sec-1 is still
 * waiting on a budget. So the floor also asks for exchanges about what is
 * ACTUALLY happening, grounded in the registry, the fleet snapshot and the
 * board.
 *
 * NOT one call per conversation. A generation takes seconds and a conversation
 * has to start the moment two agents meet, so a per-conversation call would
 * either stall the bubble or arrive after they had gone. Instead the main
 * process keeps a small queue, tops it up in the background, and the floor
 * takes from it instantly — live content, no latency, and a handful of calls an
 * hour rather than one a minute.
 *
 * THIS FILE IS THE TRUST BOUNDARY. What comes back is model output that goes
 * straight onto the screen above somebody's head, so it is parsed, measured and
 * filtered here rather than rendered hopefully. Anything malformed is dropped,
 * not repaired: a missing exchange costs nothing because the static pool is
 * right there.
 */

/** One exchange: alternating lines, starting with whoever spoke first. */
export type GossipExchange = readonly string[];

export interface GossipPool {
  /** Exchanges about the work: no names, safe to play between any two agents. */
  work: GossipExchange[];
  /** Exchanges about one person, carrying `{name}` — the floor only fills it
   *  with somebody who is out of earshot. */
  about: GossipExchange[];
  /** When this was generated, so a stale pool can be refreshed. */
  at: number;
}

export const EMPTY_POOL: GossipPool = { work: [], about: [], at: 0 };

/** A bubble is small. Longer than this and it truncates mid-word on screen. */
const MAX_LINE = 52;
/** Two to five beats. One is not a conversation; six outlasts the break, which
 *  now runs 18-32s at roughly 1.2-2.4s a line. */
const MIN_BEATS = 2;
const MAX_BEATS = 5;
/** Enough for variety, few enough that one bad generation is cheap to discard. */
const MAX_EXCHANGES = 12;

/**
 * Where the moaning stops.
 *
 * Relaxed on purpose, at the human's call: a break room where nobody can say
 * "that card was sloppy" is not a break room, so mild digs are allowed now.
 * What is still dropped is the handful of words that are about a PERSON rather
 * than their work — the ones you would not want a colleague to read over your
 * shoulder. A model asked for gossip will reach for them unprompted.
 *
 * Anything matching is dropped whole, and the hand-written pool covers the gap,
 * so the cost of this list being slightly too strict is nothing.
 */
const UNKIND = /\b(idiot|moron|incompetent|pathetic|worthless|hopeless|hate[sd]?|fired|clown)\b/i;

/** A beat that is just laughter, so the floor can play the bob on it. */
const LAUGH = /^(ha(ha)*h?|heh+|lol|pff+t?|hmph|ha[, ]+no)[.!]*$/i;

export function isLaughBeat(line: string): boolean {
  return LAUGH.test(line.trim());
}

/** One line, or null when it cannot be shown. */
function cleanLine(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // One line, no markdown, no stage directions.
  const flat = value.replace(/\s+/g, ' ').replace(/[*_`#>]/g, '').trim();
  if (!flat || flat.length > MAX_LINE) return null;
  if (UNKIND.test(flat)) return null;
  return flat;
}

function cleanExchange(value: unknown, wantName: boolean): GossipExchange | null {
  if (!Array.isArray(value)) return null;
  const beats: string[] = [];
  for (const raw of value) {
    const line = cleanLine(raw);
    if (!line) return null;              // one bad beat spoils the exchange
    beats.push(line);
  }
  if (beats.length < MIN_BEATS || beats.length > MAX_BEATS) return null;
  const hasName = beats.some((b) => b.includes('{name}'));
  // An `about` exchange with no placeholder cannot be aimed at anybody, and a
  // `work` exchange with one would render the word "{name}" on screen.
  if (wantName !== hasName) return null;
  return beats;
}

/**
 * Parse what the model returned.
 *
 * Tolerates the CLI's JSON envelope and a stray ```json fence, because both
 * show up in practice. Returns an empty pool rather than throwing: this is
 * decoration, and decoration must never break the floor.
 */
export function parseGossip(text: string | undefined, now = Date.now()): GossipPool {
  const raw = (text ?? '').trim();
  if (!raw) return EMPTY_POOL;

  let inner = raw;
  try {
    const env = JSON.parse(raw) as { result?: unknown; text?: unknown };
    if (typeof env.result === 'string') inner = env.result;
    else if (typeof env.text === 'string') inner = env.text;
  } catch { /* not the envelope — the text itself is the payload */ }
  inner = inner.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  // A model often frames JSON in prose. Take the outermost object.
  const start = inner.indexOf('{');
  const end = inner.lastIndexOf('}');
  if (start > 0 || end < inner.length - 1) {
    if (start === -1 || end <= start) return EMPTY_POOL;
    inner = inner.slice(start, end + 1);
  }

  let obj: { work?: unknown; about?: unknown };
  try { obj = JSON.parse(inner) as typeof obj; } catch { return EMPTY_POOL; }

  const take = (value: unknown, wantName: boolean): GossipExchange[] => {
    if (!Array.isArray(value)) return [];
    const out: GossipExchange[] = [];
    for (const item of value) {
      const ex = cleanExchange(item, wantName);
      if (ex) out.push(ex);
      if (out.length >= MAX_EXCHANGES) break;
    }
    return out;
  };

  const work = take(obj.work, false);
  const about = take(obj.about, true);
  if (!work.length && !about.length) return EMPTY_POOL;
  return { work, about, at: now };
}

/** Is this pool worth keeping, or should the floor fall back to the static one? */
export function poolIsUsable(pool: GossipPool | null | undefined): boolean {
  return !!pool && (pool.work.length + pool.about.length) > 0;
}

/** Older than this and the floor asks for a fresh batch — the board has moved
 *  on, and gossip about last week is not gossip. */
export const POOL_MAX_AGE_MS = 45 * 60 * 1000;

export function poolIsStale(pool: GossipPool | null | undefined, now = Date.now()): boolean {
  return !poolIsUsable(pool) || now - (pool?.at ?? 0) > POOL_MAX_AGE_MS;
}
