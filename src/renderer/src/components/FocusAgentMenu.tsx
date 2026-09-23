import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store/store';
import { SpritePortrait } from './SpritePortrait';
import { StatusGlyph } from './StatusGlyph';
import { accentCss, accentFillCss } from '@/design/tokens';
import { canSwitch, switchOptions } from './agentSwitcher';

/**
 * Change agent from inside focus mode, without spending a pixel on it.
 *
 * WHY HERE. The title bar sits at zIndex 400, above the focus overlay at 250,
 * so it is the one row already on screen in BOTH branches of focus mode — the
 * orchestrator's full-bleed Command Center, which has no header of its own, and
 * every other agent's header-and-tabs. Its centre already holds a line saying
 * what the floor is doing, and that line was `pointerEvents: 'none'`: a readout
 * occupying the most central space in the app and doing nothing when clicked.
 *
 * So this adds no chrome at all. The row exists, the space is already paid for,
 * and the thing that was only readable becomes the thing you act on. That is
 * the difference from the chip strip that came before it: the strip was correct
 * about where a switcher has to live and wrong about making you pay height for
 * it on every screen, forever.
 *
 * Out of focus mode this renders nothing — the sidebar already lists the
 * roster, and a second way to do the same thing in the same window is clutter.
 */
export function FocusAgentMenu() {
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);
  const fullscreenAgentId = useStore((s) => s.fullscreenAgentId);
  const setFullscreen = useStore((s) => s.setFullscreen);
  const select = useStore((s) => s.select);
  const open = useStore((s) => s.focusMenuOpen);
  const setOpen = useStore((s) => s.setFocusMenuOpen);
  const box = useRef<HTMLDivElement | null>(null);

  const options = switchOptions(agents, fullscreenAgentId);
  const current = options.find((o) => o.current);
  const waiting = options.filter((o) => o.needsYou && !o.current).length;

  // Click anywhere else closes it. Escape is NOT bound here: focus mode already
  // owns Escape (it leaves focus mode) and guards it on the store flags of
  // whatever is open above it, so this menu joins that guard rather than
  // fighting for the key. See FullscreenTerminal's Esc handler.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [open, setOpen]);

  // Leaving focus mode with the menu still open would strand the flag, and the
  // next Esc would be swallowed by a guard for a menu nobody can see.
  useEffect(() => {
    if (!fullscreenAgentId && open) setOpen(false);
  }, [fullscreenAgentId, open, setOpen]);

  if (!fullscreenAgentId || !current) return null;

  return (
    <div
      ref={box}
      className="cth-titlebar-nodrag"
      style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
        display: 'inline-flex', flexDirection: 'column', alignItems: 'center'
      }}
    >
      <button
        onClick={() => canSwitch(options) && setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('focusMenu.label', { name: current.name })}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          height: 30, padding: '0 10px 0 5px',
          border: 'none', borderRadius: 'var(--cth-radius-btn)',
          // A menu of one is an ordinary readout: no hover, no chevron, no
          // pointer. The control stops advertising an action it cannot perform.
          cursor: canSwitch(options) ? 'pointer' : 'default',
          background: open ? 'var(--cth-cream-100)' : 'transparent',
          fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 500,
          color: 'var(--cth-ink-900)', whiteSpace: 'nowrap',
          transition: 'background 120ms ease'
        }}
      >
        <span style={{
          position: 'relative', flexShrink: 0,
          width: 22, height: 22, borderRadius: 7, overflow: 'hidden',
          background: accentFillCss(current.accent),
          boxShadow: `0 0 0 1.5px var(--cth-status-${current.status})`,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
        }}>
          <SpritePortrait character={current.character} scale={0.45} />
        </span>
        {current.name}
        {/* The number the readout used to carry, kept: while you read one
            terminal the useful question is still "is anyone waiting on me". */}
        {waiting > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '0 7px', height: 18, borderRadius: 999,
            background: 'var(--cth-coral)', color: 'var(--cth-on-accent)',
            fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums'
          }}>
            <StatusGlyph status="blocked" size={11} />
            {waiting}
          </span>
        )}
        {canSwitch(options) && (
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"
            style={{ color: 'var(--cth-ink-400)', transform: open ? 'rotate(180deg)' : undefined }}>
            <path d="M3.5 6l4.5 4.5L12.5 6" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 34, left: '50%', transform: 'translateX(-50%)',
            minWidth: 248, maxHeight: 420, overflowY: 'auto',
            padding: 6,
            background: 'var(--cth-paper-100)',
            borderRadius: 'var(--cth-radius-card)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-100), var(--cth-shadow-card)'
          }}
        >
          {options.map((o) => (
            <button
              key={o.id}
              role="menuitem"
              onClick={() => {
                // Selection follows the switch, so leaving focus mode lands on
                // the agent you were reading rather than the one you came from.
                select(o.id);
                setFullscreen(o.id);
                setOpen(false);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '7px 9px', textAlign: 'left',
                border: 'none', cursor: 'pointer',
                borderRadius: 'var(--cth-radius-btn)',
                background: o.current ? 'var(--cth-cream-100)' : 'transparent',
                fontFamily: 'var(--cth-font-ui)', fontSize: 13,
                fontWeight: o.current ? 600 : 400,
                color: 'var(--cth-ink-900)'
              }}
            >
              <span style={{
                position: 'relative', flexShrink: 0,
                width: 26, height: 26, borderRadius: 8, overflow: 'hidden',
                background: accentFillCss(o.accent),
                boxShadow: `0 0 0 1.5px ${accentCss(o.accent)}`,
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
              }}>
                <SpritePortrait character={o.character} scale={0.55} />
              </span>
              <span style={{
                flex: 1, minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>{o.name}</span>
              {/* Waiting on you, in words as well as colour. */}
              {o.needsYou && (
                <span style={{
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '0 7px', height: 18, borderRadius: 999,
                  background: 'var(--cth-coral-light)', color: 'var(--cth-coral-text)',
                  fontSize: 11, fontWeight: 600
                }}>
                  <StatusGlyph status="blocked" size={11} />
                  {t('focusMenu.needsYou')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
