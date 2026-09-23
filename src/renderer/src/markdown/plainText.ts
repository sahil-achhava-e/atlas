/**
 * Markdown source → one line of readable text.
 *
 * For the places that show a PREVIEW of agent-written markdown and cannot
 * render it: the kanban card's two-line description clamp. Rendering real
 * markdown there would put headings, lists and paragraphs inside a
 * `-webkit-line-clamp: 2` box, and a board stops being scannable the moment a
 * card grows. But printing the source raw is what we had, and that shows
 * `**Plan the scan app**` with the asterisks — the syntax instead of the text.
 *
 * So: strip the syntax, keep the words, collapse to a single line.
 *
 * Extracted from the component for the same reason mdLinks.ts was — these are
 * string rules, and string rules deserve a test that does not need a renderer.
 *
 * This is deliberately a preview-grade stripper, not a parser. It is never used
 * to decide anything, only to show the first ~120 characters of a description,
 * and MarkdownPreview does the real rendering everywhere the full text is
 * shown. A construct it misses degrades to a stray character in a clamped
 * line, which is exactly what it degraded to before.
 */

/** Fenced code blocks, in full — a preview has no room for one, and showing
 *  its first line without the fence reads as prose that is not prose. */
const FENCE = /```[\s\S]*?(?:```|$)/g;
/** `code` → code. Handles the doubled-backtick form too. */
const INLINE_CODE = /`{1,2}([^`]+)`{1,2}/g;
/** ![alt](src) before [text](href): an image would otherwise leave its `!`. */
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
/** [text](href) → text. */
const LINK = /\[([^\]]*)\]\([^)]*\)/g;
/**
 * Emphasis, one marker per pass, LONGEST FIRST.
 *
 * A single alternation with a backreference — `(\*\*\*|\*\*|~~|__|[*_])…\1` —
 * looks tidier and is wrong: the regex engine takes the leftmost match, so a
 * lone `*` early in the text pairs with the first `*` of a later `**`, eats the
 * span between them, and leaves the other half of the bold marker standing.
 * Running `***`, then `**`, then `*` over the whole string each time means the
 * long markers are gone before a single one is ever considered.
 *
 * The `_` forms carry a word-boundary guard, which is markdown's own rule: an
 * underscore inside a word is not emphasis. Without it `scanner_app and
 * pos_agent` pairs the two underscores across the gap and renders
 * `scannerapp and posagent` — and these cards are full of snake_case paths.
 *
 * The inner class excludes the marker character so a span can never run past
 * its own closer.
 */
const EMPHASIS_PASSES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\*\*\*(?=\S)([^*]*?\S)\*\*\*/g, '$1'],
  [/\*\*(?=\S)([^*]*?\S)\*\*/g, '$1'],
  [/~~(?=\S)([\s\S]*?\S)~~/g, '$1'],
  [/(?<!\w)___(?=\S)([^_]*?\S)___(?!\w)/g, '$1'],
  [/(?<!\w)__(?=\S)([^_]*?\S)__(?!\w)/g, '$1'],
  [/\*(?=\S)([^*]*?\S)\*/g, '$1'],
  [/(?<!\w)_(?=\S)([^_]*?\S)_(?!\w)/g, '$1']
];
/** Leading `#`, `>`, `-`, `*`, `+`, `1.` on a line, and the ruler `---`. */
const LEADING_MARK = /^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+)/gm;
const RULER = /^[ \t]*(?:[-*_][ \t]*){3,}$/gm;
/** A markdown table's pipes and its `|---|---|` separator row. */
const TABLE_RULE = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)+\|?[ \t]*$/gm;

export function markdownToPlainText(source: string): string {
  if (!source) return '';
  let s = source
    .replace(FENCE, ' ')
    .replace(TABLE_RULE, ' ')
    .replace(RULER, ' ')
    .replace(IMAGE, '$1')
    .replace(LINK, '$1')
    .replace(INLINE_CODE, '$1')
    .replace(LEADING_MARK, '');
  // Emphasis last: the markers can wrap text that only became adjacent once a
  // link or a leading bullet was removed.
  for (const [re, to] of EMPHASIS_PASSES) s = s.replace(re, to);
  // Every newline becomes a space — the host clamps to two lines and a real
  // line break would spend one of them on a heading.
  return s.replace(/\s+/g, ' ').trim();
}
