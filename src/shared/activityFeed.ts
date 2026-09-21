/**
 * What an agent is saying and doing, in a form a person can read.
 *
 * The terminal shows the engine's TUI: box drawing, ANSI, spinners, a
 * permission prompt answered by keystroke. That is the truth of the session and
 * it is unreadable unless you already know what you are looking at.
 *
 * The SAME session writes a transcript — one JSON object per line — and that is
 * structured: assistant prose is prose, a tool call names its tool and its
 * argument. So the readable view is built from the transcript, not by trying to
 * un-draw a terminal.
 *
 * Pure on purpose: it takes lines and returns rows, so what a person ends up
 * reading is testable without a session, a PTY or a screen.
 */

export interface ActivityRow {
  /** `say` is the agent talking, `do` is it working, `ask` is the HUMAN — what
   *  they typed into the message box. Without it the view was one side of a
   *  conversation: answers with the questions cut out. */
  kind: 'say' | 'do' | 'ask';
  /** One line, already in plain words. */
  text: string;
  /** For a `do` row: the file, command or pattern it acted on. */
  detail?: string;
  /** What KIND of work, so the page can colour it without re-deriving the
   *  answer from the label. Reading and changing files are different risks and
   *  should not look the same at a glance. */
  tone?: ActivityTone;
  at?: number;
}

/** Deliberately few: six colours a person can learn, not one per tool. */
export type ActivityTone = 'read' | 'write' | 'run' | 'search' | 'delegate' | 'plan' | 'other';

/** Tool name → what to call it when a person reads it. Anything not here falls
 *  back to the tool's own name, which is better than dropping the row: an agent
 *  doing something unnamed is still an agent doing something. */
const TOOLS: Record<string, { verb: string; tone: ActivityTone }> = {
  Read: { verb: 'Reading', tone: 'read' },
  Write: { verb: 'Writing', tone: 'write' },
  Edit: { verb: 'Editing', tone: 'write' },
  NotebookEdit: { verb: 'Editing a notebook', tone: 'write' },
  Bash: { verb: 'Running a command', tone: 'run' },
  Glob: { verb: 'Looking for files', tone: 'search' },
  Grep: { verb: 'Searching', tone: 'search' },
  WebFetch: { verb: 'Reading a page', tone: 'read' },
  WebSearch: { verb: 'Searching the web', tone: 'search' },
  // NOT a hire. Task/Agent start a helper INSIDE this agent's own session — it
  // has no desk, no name and no card on the floor, and it is gone when the step
  // is. "Handing work to a helper" read as delegating to a worker who did not
  // exist, which is alarming on a floor with nobody on it. Hiring is a spawn,
  // and a spawn puts an agent on the floor where you can see it.
  Task: { verb: 'Side task', tone: 'delegate' },
  Agent: { verb: 'Side task', tone: 'delegate' },
  TodoWrite: { verb: 'Updating its plan', tone: 'plan' }
};

/** Noise that is true but not worth a line: the engine's own error banners, and
 *  the bookkeeping it prints to itself. */
const SKIP_TEXT = [
  /^API Error:/i,
  /^\s*<[a-z-]+>/i,          // system-reminder and friends
  /^Caveat: The messages below/i
];

interface RawBlock { type?: string; text?: string; name?: string; input?: Record<string, unknown> }
interface RawEntry { type?: string; timestamp?: string; message?: { content?: RawBlock[] | string } }

/**
 * Prompts the APP wrote, not the human.
 *
 * Everything typed at an agent lands in the transcript as a `user` entry, and
 * so does everything the harness types on the human's behalf: the orientation
 * seed on a fresh spawn, the resume nudge, the inbox wake, a circuit-breaker
 * warning. Showing those as the owner's words would be a lie — and the inbox
 * nudge alone accounts for 37 of the 61 user entries in a day's transcript,
 * so it would bury the four things the human actually said.
 *
 * Matched against the START of the text, plus a couple of phrases that only
 * ever appear inside a nudge (a long one arrives split across lines, so the
 * head is not always there).
 */
const INJECTED_PROMPT = [
  /^You have new hive inbox message/i,
  /^Continue from where you left off/i,
  /^<pasted_content/i,
  /^ENRICH TASK:/i,
  /^Circuit breaker:/i,
  /^\[?Heartbeat/i,
  // The CLI's own preamble when a skill runs — not something anyone typed.
  /^Base directory for this skill:/i,
  /inbox\/\.done\//,
  /Act autonomously; only message/i
];

/** Did the human type this, or did the app? */
export function isOwnerPrompt(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (SKIP_TEXT.some((re) => re.test(t))) return false;
  return !INJECTED_PROMPT.some((re) => re.test(t));
}

/**
 * Turn transcript lines into readable rows, newest last.
 *
 * @param lines  raw JSONL lines, in file order
 * @param limit  how many rows to keep — the tail is what anyone reads
 */
export function activityRows(lines: readonly string[], limit = 200): ActivityRow[] {
  const rows: ActivityRow[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let entry: RawEntry;
    try { entry = JSON.parse(line) as RawEntry; } catch { continue; }
    if (entry.type !== 'assistant' && entry.type !== 'user') continue;

    const at = entry.timestamp ? Date.parse(entry.timestamp) || undefined : undefined;
    const content = entry.message?.content;
    const blocks: RawBlock[] = typeof content === 'string'
      ? [{ type: 'text', text: content }]
      : Array.isArray(content) ? content : [];

    // The human's side. A `user` entry is either what they typed or a tool
    // result coming back from the engine — the latter is machinery, and it is
    // most of them, so only text blocks count.
    if (entry.type === 'user') {
      const said = blocks
        .filter((b) => (b.type ?? 'text') === 'text')
        .map((b) => (b.text ?? '').trim())
        .filter(Boolean)
        .join('\n')
        .trim();
      if (said && isOwnerPrompt(said)) rows.push({ kind: 'ask', text: said, at });
      continue;
    }

    for (const block of blocks) {
      if (block.type === 'text') {
        const text = (block.text ?? '').trim();
        if (!text || SKIP_TEXT.some((re) => re.test(text))) continue;
        rows.push({ kind: 'say', text, at });
      } else if (block.type === 'tool_use') {
        const name = block.name ?? '';
        const known = TOOLS[name];
        // `thinking` is deliberately absent: it is the model's scratchpad, and
        // putting it in front of someone who asked for less noise is more.
        rows.push({
          kind: 'do',
          text: known?.verb ?? name,
          tone: known?.tone ?? 'other',
          detail: toolDetail(block.input),
          at
        });
      }
    }
  }

  return rows.slice(-limit);
}

/** The one argument worth showing. A file path beats a description beats a
 *  pattern; a whole command or a whole file body does not belong on one line. */
function toolDetail(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  for (const key of ['description', 'file_path', 'path', 'pattern', 'query', 'url', 'prompt']) {
    const v = input[key];
    if (typeof v === 'string' && v.trim()) return oneLine(v);
  }
  return undefined;
}

function oneLine(s: string): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 119)}…` : flat;
}

/** The last thing the agent actually SAID, for a one-line summary. */
export function lastSaid(rows: readonly ActivityRow[]): string | undefined {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].kind === 'say') return rows[i].text;
  return undefined;
}

/**
 * What to say an agent is DOING, in a thought bubble or under its name.
 *
 * The floor said "using Bash", which is the tool's name and nobody's business
 * but the engine's — and it said it to someone who chose the plain register as
 * readily as to an engineer. This is the same table the feed reads, phrased as
 * an activity rather than an instrument: a person watching a floor wants to know
 * whether an agent is reading, writing, running something or stuck, and the name
 * of the tool answers none of that.
 *
 * Lowercase and gerund, because it lands mid-sentence: "Atlas · reading a file".
 */
export function toolPhrase(tool: string): string {
  return TOOL_PHRASES[tool] ?? 'working';
}

const TOOL_PHRASES: Record<string, string> = {
  Read: 'reading a file',
  Write: 'writing a file',
  Edit: 'editing a file',
  NotebookEdit: 'editing a notebook',
  Bash: 'running a command',
  Glob: 'looking for files',
  Grep: 'searching the code',
  WebFetch: 'reading a page',
  WebSearch: 'searching the web',
  Task: 'on a side task',
  Agent: 'on a side task',
  TodoWrite: 'planning',
  // The pty parser sees a few names the transcript does not.
  MultiEdit: 'editing files',
  BashOutput: 'checking a command',
  KillShell: 'stopping a command'
};
