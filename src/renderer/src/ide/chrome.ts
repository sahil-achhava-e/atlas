/**
 * The IDE's shared bar chrome.
 *
 * These three style objects were previously private to IdePanel, which was fine
 * while IdePanel rendered every pane itself. The image preview renders its own
 * bar, and a second copy of "padding 3px 8px, cream-200, ink-700 hairline" would
 * drift the moment either file was touched — the two bars sit directly on top of
 * each other in the same tab strip, so any drift is immediately visible. One
 * definition, imported by both.
 *
 * Every colour is a token, never a literal: the app ships a light AND a dark
 * theme that swap by redefining these variables, so a hardcoded hex here would
 * look correct in exactly one of them.
 */
import type { CSSProperties } from 'react';

/** The horizontal bar above an editor / preview body. */
export const ideBarStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
  background: 'var(--cth-cream-100)', borderBottom: '1px solid var(--cth-ink-100)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-600)'
};

/** Square, borderless button that holds only an icon. */
export const ideIconBtn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  padding: 0, width: 24, height: 24, background: 'transparent', border: 'none',
  borderRadius: 'var(--cth-radius-btn)',
  cursor: 'pointer', color: 'var(--cth-ink-500)',
  transition: 'background 120ms ease, color 120ms ease'
};

/** Small labelled button used for bar actions (save, copy path, view toggles). */
export const ideTextBtn: CSSProperties = {
  padding: '0 10px', height: 24, fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600,
  color: 'var(--cth-ink-700)', background: 'var(--cth-paper-100)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 5
};

/** A colour per rail action, so a row of controls is not a row of grey squares.
 *  Same idea as the Command Center's tab glyphs: the hue is the label you read
 *  before the tooltip arrives. */
export const IDE_TONES = {
  refresh: 'var(--cth-sky)',
  git: 'var(--cth-peach)',
  save: 'var(--cth-mint)',
  copy: 'var(--cth-lilac)',
  close: 'var(--cth-coral)',
  diff: 'var(--cth-lemon)'
} as const;
