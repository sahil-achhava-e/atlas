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
  at?: number;
}

/** Tool name → what to call it when a person reads it. Anything not here falls
 *  back to the tool's own name, which is better than dropping the row: an agent
 *  doing something unnamed is still an agent doing something. */
const TOOL_VERBS: Record<string, string> = {
  Read: 'Reading', Write: 'Writing', Edit: 'Editing', NotebookEdit: 'Editing a notebook',
  Bash: 'Running a command', Glob: 'Looking for files', Grep: 'Searching',
  WebFetch: 'Reading a page', WebSearch: 'Searching the web',
  Task: 'Handing work to a helper', TodoWrite: 'Updating its plan',
  Agent: 'Handing work to a helper'
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
        // `thinking` is deliberately absent: it is the model's scratchpad, and
        // putting it in front of someone who asked for less noise is more.
        rows.push({ kind: 'do', text: TOOL_VERBS[name] ?? name, detail: toolDetail(block.input), at });
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
