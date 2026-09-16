import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, type Agent } from '@/store/store';

/**
 * SIMPLE MODE — the raw engine terminal, folded away.
 *
 * The terminal is the most technical thing in the app: a TUI, tool calls, box
 * drawing, and a permission prompt you answer by pressing a key. For someone who
 * does not code it is noise at best. But it is also the pane that holds the
 * COMPOSER — the only way to say anything to an agent — so "hide the terminal"
 * cannot mean unmounting the tab. The composer stays; the log folds.
 *
 * Collapsed, the pane shows the last thing the agent said, which is the answer to
 * the question a non-technical user actually has. The log is one click away and
 * stays one click away: hidden, not removed, because "where did my terminal go"
 * is a worse first day than a busy one.
 *
 * Technical mode renders `children` untouched — no wrapper, no extra chrome.
 *
 * Unmounting the terminal view is safe: `terminalPool` keeps one xterm per pty
 * for the app's lifetime and re-parents its host element on mount, so the
 * scrollback is still there when the log is opened again.
 */
export function TechnicalLog({ agent, children }: { agent: Agent; children: ReactNode }) {
  const { t } = useTranslation();
  const simpleMode = useStore((s) => s.simpleMode);
  const [open, setOpen] = useState(false);

  if (!simpleMode) return <>{children}</>;

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
      {open ? t('simpleMode.hideLog') : t('simpleMode.showLog')}
    </button>
  );

  if (open) {
    return (
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {toggle}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>{children}</div>
      </div>
    );
  }

  const said = agent.recentAssistantText?.trim();
  return (
    <div style={{
      flex: 1, minWidth: 0, minHeight: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--cth-paper-100)'
    }}>
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        padding: '16px 18px'
      }}>
        <div style={{
          fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, fontWeight: 700,
          letterSpacing: '0.04em', textTransform: 'uppercase',
          color: 'var(--cth-ink-400)', marginBottom: 8
        }}>
          {t('simpleMode.lastMessage', { name: agent.name })}
        </div>
        <div style={{
          fontFamily: 'var(--cth-font-ui)', fontSize: 13.5, lineHeight: '21px',
          color: said ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word'
        }}>
          {said || t('simpleMode.nothingYet')}
        </div>
      </div>
      {toggle}
    </div>
  );
}
