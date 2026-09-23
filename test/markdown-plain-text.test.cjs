'use strict';

/**
 * The task card printed markdown SYNTAX instead of text: a description written
 * as `**Plan the merchandise scan app**` showed its asterisks on the board.
 *
 * The detail overlay now renders the real thing through MarkdownPreview. The
 * kanban card cannot — it clamps the description to two lines, and headings and
 * lists inside a clamp are what a board exists not to have — so it strips the
 * syntax instead. These are that stripper's rules.
 *
 * Run: node --test test/markdown-plain-text.test.cjs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { markdownToPlainText } = loadTs('src/renderer/src/markdown/plainText.ts');

test('the real card that surfaced this (Feature 7670)', () => {
  // The real card's shape, with the project name swapped for a placeholder:
  // bold, nested bullets, inline code with paths and underscores, and a bold run
  // ending in a colon. Every one of these leaked its markers onto the board.
  const source = [
    '**Plan the merchandise scan app + admin Merchandise tab + counts/conflicts reconciliation (Feature 7670).**',
    '',
    'Three parts:',
    '',
    '- **Mobile app** (`scanner_app`, Flutter) — log in → scan products → submit counts to the server',
    '- **Admin Merchandise tab** in acme-events (standalone)',
    '',
    '**Confirmed bindings (2026-09-23):** Flutter SDK installed; app name `scanner_app`; lives as `scanner_app/` at the ROOT.'
  ].join('\n');

  const out = markdownToPlainText(source);

  assert.ok(!out.includes('**'), `bold markers survived: ${out}`);
  assert.ok(!out.includes('`'), `backticks survived: ${out}`);
  assert.ok(!/(^|\s)-\s/.test(out), `a bullet marker survived: ${out}`);
  assert.ok(out.startsWith('Plan the merchandise scan app'), out);
  // The words themselves are all still there, in order, on one line.
  assert.ok(out.includes('Mobile app (scanner_app, Flutter)'), out);
  assert.ok(out.includes('Confirmed bindings (2026-09-23): Flutter SDK installed'), out);
  assert.ok(!out.includes('\n'), 'the preview must be a single line');
});

test('emphasis, in each of its spellings', () => {
  assert.equal(markdownToPlainText('**bold**'), 'bold');
  assert.equal(markdownToPlainText('__bold__'), 'bold');
  assert.equal(markdownToPlainText('*em*'), 'em');
  assert.equal(markdownToPlainText('_em_'), 'em');
  assert.equal(markdownToPlainText('~~struck~~'), 'struck');
  assert.equal(markdownToPlainText('***both***'), 'both');
  assert.equal(markdownToPlainText('a **b** c *d* e'), 'a b c d e');
});

test('an underscore inside a word is not emphasis', () => {
  // The thing a naive /_(.+?)_/ gets wrong, and these cards are full of
  // snake_case paths.
  assert.equal(markdownToPlainText('`scanner_app` and pos_agent'), 'scanner_app and pos_agent');
});

test('headings, quotes, bullets and numbered items lose their marker only', () => {
  assert.equal(markdownToPlainText('# Title'), 'Title');
  assert.equal(markdownToPlainText('### Deep'), 'Deep');
  assert.equal(markdownToPlainText('> quoted'), 'quoted');
  assert.equal(markdownToPlainText('- one\n- two'), 'one two');
  assert.equal(markdownToPlainText('* one\n+ two'), 'one two');
  assert.equal(markdownToPlainText('1. first\n2. second'), 'first second');
  // A hyphen that is not a bullet stays put.
  assert.equal(markdownToPlainText('well-known trade-off'), 'well-known trade-off');
});

test('links and images become their text', () => {
  assert.equal(markdownToPlainText('see [the board](https://example.com/x)'), 'see the board');
  assert.equal(markdownToPlainText('![a chart](./chart.png)'), 'a chart');
  assert.equal(markdownToPlainText('[](https://example.com)'), '');
});

test('fenced code, rulers and table separators are dropped', () => {
  assert.equal(markdownToPlainText('before\n```js\nconst x = 1;\n```\nafter'), 'before after');
  assert.equal(markdownToPlainText('a\n---\nb'), 'a b');
  assert.equal(markdownToPlainText('| a | b |\n| --- | --- |\n| 1 | 2 |'), '| a | b | | 1 | 2 |');
  // An unterminated fence must not swallow only half the document and leave ```
  assert.ok(!markdownToPlainText('text\n```\nstill open').includes('`'));
});

test('empty and syntax-only input collapse to empty, so the card hides the line', () => {
  assert.equal(markdownToPlainText(''), '');
  assert.equal(markdownToPlainText('   \n\n  '), '');
  assert.equal(markdownToPlainText('---'), '');
  assert.equal(markdownToPlainText(undefined ?? ''), '');
});

test('plain text is returned unchanged', () => {
  assert.equal(
    markdownToPlainText('Naruto finalises the plan; Atlas shows it to you.'),
    'Naruto finalises the plan; Atlas shows it to you.'
  );
});
