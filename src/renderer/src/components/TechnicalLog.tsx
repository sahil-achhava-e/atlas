import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, type Agent } from '@/store/store';
import { ActivityLog } from './ActivityLog';

/**
 * THE READABLE PANE, with the terminal folded behind it.
 *
 * The terminal is the most technical thing in the app: a TUI, tool calls, box
 * drawing, a permission prompt you answer by pressing a key — and it takes
 * typing, which invites typing into a session that is not yours to drive. What
 * a person is actually here to read is what the agent is SAYING and what it is
 * working on, and that is what this shows: prose as prose, work as one quiet
 * line each, read-only. It comes from the session transcript rather than the
 * terminal's bytes (see shared/activityFeed.ts).
 *
 * The terminal is one click away and stays one click away — hidden, not removed.
 * "Where did my terminal go" is a worse first day than a busy one, and there are
 * real moments (a stuck prompt, an engine error, a diff you want in full) where
 * only the engine's own output will do.
 *
 * The COMPOSER is not part of this. It lives below and is untouched either way:
 * folding the log must never remove the way to say something to an agent.
 *
 * Unmounting the terminal view is safe: `terminalPool` keeps one xterm per pty
 * for the app's lifetime and re-parents its host element on mount, so the
 * scrollback is still there when it is opened again.
 */
export function TechnicalLog({ agent, children }: { agent: Agent; children: ReactNode }) {
  const { t } = useTranslation();
  // Someone who chose the technical register gets the terminal open by default;
  // everyone else gets the readable pane and can open it. Either way it is the
  // same toggle, so neither audience is stuck with the other's choice.
  const simpleMode = useStore((s) => s.simpleMode);
  const [open, setOpen] = useState(!simpleMode);

  const toggle = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      style={{
        alignSelf: 'flex-start',
        border: 'none', background: 'transparent', cursor: 'pointer',
        padding: '6px 10px',
        fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, fontWeight: 600,
        color: 'var(--cth-ink-500)'
      }}
    >
      {open ? t('activity.hideTerminal') : t('activity.showTerminal')}
    </button>
  );

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {open
        ? <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>{children}</div>
        : <ActivityLog agent={agent} />}
      {toggle}
    </div>
  );
}
