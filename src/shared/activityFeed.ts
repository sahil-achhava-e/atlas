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
  /** `say` is the agent talking. `do` is it working. */
  kind: 'say' | 'do';
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
    if (entry.type !== 'assistant') continue;

    const at = entry.timestamp ? Date.parse(entry.timestamp) || undefined : undefined;
    const content = entry.message?.content;
    const blocks: RawBlock[] = typeof content === 'string'
      ? [{ type: 'text', text: content }]
      : Array.isArray(content) ? content : [];

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
