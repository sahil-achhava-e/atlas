import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import type { Agent } from '@/store/store';
import type { ActivityRow } from '@shared/activityFeed';

/**
 * What the agent is saying and doing — the pane you read instead of the terminal.
 *
 * The terminal is the engine's own TUI: box drawing, ANSI, a spinner, a
 * permission prompt answered by keystroke. It is the truth of the session, and
 * it is also unreadable unless you already know what you are looking at, and it
 * takes typing — which invites typing into a session that is not yours to drive.
 *
 * So this is the default: prose as prose, work as one line each, read-only. It
 * comes from the session TRANSCRIPT rather than the terminal's bytes, because
 * the transcript is already structured (see shared/activityFeed.ts) and
 * un-drawing a terminal is not.
 *
 * The terminal is still there, one click away, for the times a person needs to
 * see exactly what the engine printed.
 */

const POLL_MS = 1500;

export function ActivityLog({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  // Stick to the bottom while the reader is at the bottom, and stop the moment
  // they scroll up — a feed that yanks you back to the end is unreadable.
  const pinned = useRef(true);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const next = await window.cth.agentActivity(agent.id, 200);
        if (live && Array.isArray(next)) setRows(next as ActivityRow[]);
      } catch { /* no transcript yet — the agent has not started talking */ }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [agent.id]);

  useEffect(() => {
    if (!pinned.current) return;
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--cth-paper-100)' }}>
      <div ref={scroller} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px' }}>
        {rows.length === 0 && (
          <div style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-500)' }}>
            {t('activity.nothingYet', { name: agent.name })}
          </div>
        )}
        {rows.map((row, i) => (row.kind === 'say' ? <Said key={i} row={row} /> : <Did key={i} row={row} />))}
      </div>
    </div>
  );
}

/** The agent talking. The thing a person is actually here to read, so it gets
 *  the readable face, full width and room around it. */
function Said({ row }: { row: ActivityRow }) {
  return (
    <div style={{
      margin: '10px 0',
      padding: '10px 14px',
      background: 'var(--cth-cream-50)',
      boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
      borderRadius: 'var(--cth-radius-input)',
      fontFamily: 'var(--cth-font-ui)', fontSize: 13.5, lineHeight: '21px',
      color: 'var(--cth-ink-900)', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
    }}>{row.text}</div>
  );
}

/** The agent working. One quiet line each: these are the steps between the
 *  things it says, and a wall of them is the noise this pane exists to avoid. */
function Did({ row }: { row: ActivityRow }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 2px',
      fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, lineHeight: '18px',
      color: 'var(--cth-ink-500)'
    }}>
      <span style={{ flexShrink: 0, opacity: 0.6, transform: 'translateY(2px)' }}><Icon name="arrow-right" /></span>
      <span style={{ flexShrink: 0 }}>{row.text}</span>
      {row.detail && (
        <span style={{
          fontFamily: 'var(--cth-font-mono)', fontSize: 12,
          color: 'var(--cth-ink-400, var(--cth-ink-500))',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>{row.detail}</span>
      )}
    </div>
  );
}

export const activityToggleStyle: CSSProperties = {
  alignSelf: 'flex-start',
  border: 'none', background: 'transparent', cursor: 'pointer',
  padding: '6px 10px',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, fontWeight: 600,
  color: 'var(--cth-ink-500)'
};
