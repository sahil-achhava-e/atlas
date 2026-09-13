import { useTranslation } from 'react-i18next';
import { type SidebarTab } from '@/store/store';
import { Icon, type IconName } from './Icon';

// v0.3.4: the files tab is gone — the per-agent IDE button (header) opens the
// full Monaco editor + file tree, which superseded the read-only browser.
//
// `tone` is the glyph's colour when the tab is NOT selected, and matches what
// the same idea wears in the command centre's bar: the terminal's idle green,
// the bell's coral, git's sky. The WORD never takes it — a 12.5px label in
// status green measured 2.1:1 on white, and a marker used as body text stops
// being readable.
const TABS: { key: SidebarTab; labelKey: string; icon: IconName; tone: string }[] = [
  { key: 'terminal', labelKey: 'sidebar.terminal', icon: 'terminal', tone: 'var(--cth-status-idle)' },
  { key: 'git',      labelKey: 'sidebar.git',      icon: 'code',     tone: 'var(--cth-sky)' },
  { key: 'messages', labelKey: 'sidebar.messages', icon: 'bell',     tone: 'var(--cth-coral)' },
  { key: 'traces',   labelKey: 'sidebar.traces',   icon: 'web',      tone: 'var(--cth-indigo)' }
];

export interface SidebarTabsProps {
  current: SidebarTab;
  /** Focus mode has the width for words; the docked panel does not. Icon-only
   *  there, with the name on a hover bubble (.cth-iconbar), which is exactly
   *  what the command centre's bar does in the same two places. */
  fullscreen?: boolean;
  onChange: (tab: SidebarTab) => void;
}

/**
 * The focus view's tab bar.
 *
 * Built to the same rules as the command centre's: equal shares of the row so
 * it reads as one control, a filled pill for the selected tab, and everything
 * from tokens so both themes work. What it replaced was the pre-redesign
 * treatment — a cream strip under a hard 2px ink-900 rule, SHOUTED labels, and
 * ink-900 hairlines down each side of the selected tab. In dark mode that rule
 * and those hairlines were drawn in the token that flips to near-WHITE, so the
 * bar came out banded in bright lines nothing else in the app has.
 */
export function SidebarTabs({ current, fullscreen = false, onChange }: SidebarTabsProps) {
  const { t } = useTranslation();
  return (
    <div className="cth-tabbar cth-iconbar" style={{
      display: 'flex',
      gap: 2,
      padding: '8px 8px',
      background: 'var(--cth-paper-100)',
      borderBottom: '1px solid var(--cth-ink-100)',
      flexShrink: 0
    }}>
      {TABS.map(tab => {
        const active = current === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            data-label={fullscreen ? undefined : t(tab.labelKey)}
            aria-label={t(tab.labelKey)}
            aria-pressed={active}
            style={{
              flex: '1 1 0',
              minWidth: 0,
              height: 32,
              padding: fullscreen ? '0 10px' : 0,
              border: 'none',
              cursor: 'pointer',
              borderRadius: 'var(--cth-radius-btn)',
              // Brand lilac, not the agent's accent. Filling with the accent was
              // the obvious idea and it does not survive measurement: at 12.5px
              // the label needs 4.5:1, and on lemon, peach, jade and indigo
              // NEITHER white nor near-black reaches it — those hues sit in the
              // middle of the luminance range. Lilac is 6.12:1 with white in
              // light and 5.23:1 with near-black in dark. Which agent you are
              // looking at is already said by the name and face directly above.
              background: active ? 'var(--cth-lilac)' : 'transparent',
              color: active ? 'var(--cth-on-accent)' : 'var(--cth-ink-700)',
              boxShadow: active ? 'var(--cth-shadow-sm)' : 'none',
              fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
              fontSize: 12.5,
              lineHeight: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: fullscreen ? 7 : 0,
              transition: 'background 120ms ease, color 120ms ease'
            }}
          >
            <span style={{ display: 'inline-flex', color: active ? 'inherit' : tab.tone }}>
              <Icon name={tab.icon} />
            </span>
            {fullscreen && (
              <span style={{
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>{t(tab.labelKey)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
