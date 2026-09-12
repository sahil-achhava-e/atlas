import type { CSSProperties } from 'react';

/**
 * The two surfaces every settings-style screen is built from.
 *
 * A group is a card: its heading sits inside it, and its rows sit under that,
 * separated by a hairline. Cards separate sections better than rules do, and
 * they stop a long tab reading as one column of unrelated rows. Kept here
 * rather than in one screen's file because Settings and the setup panel render
 * side by side and have to agree.
 */
export const groupCard: CSSProperties = {
  background: 'var(--cth-paper-100)',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
  borderRadius: 'var(--cth-radius-card)',
  padding: '14px 16px'
};

/** The hairline between two rows inside one group. */
export const rowRule: CSSProperties = {
  height: 1, background: 'var(--cth-ink-100)', margin: '12px 0'
};
