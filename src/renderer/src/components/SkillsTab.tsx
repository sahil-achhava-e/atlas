/**
 * SKILLS — what the coding agents here can already do, and 1,200 more they could.
 *
 * Two modes behind one toggle rather than two tabs: "installed" answers "why did
 * A read-only list of what is installed, plus one button to add a folder you
 * already have. The 1,200-skill remote catalogue is gone on purpose: a skill is
 * instructions that run inside an agent holding your tools, your ADO credentials
 * and your database connection, so installing one off a stranger's list is
 * closer to running unknown code than to picking a theme.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import type { LocalSkill } from '../../../preload';
import { useNativeDialog } from '@/hooks/useNativeDialog';


/** A switch, not a checkbox: it flips a thing that is already running rather
 *  than ticking a box in a form nobody submits. Square knob, no radius — the
 *  rest of the app has no rounded corners. role/aria make it a real switch for
 *  the keyboard and for a screen reader. */
function SkillSwitch({ on, label, onText, offText, onChange }: {
  on: boolean; label: string; onText: string; offText: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: 0, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0
      }}
    >
      <span style={{
        position: 'relative', width: 26, height: 14, flexShrink: 0,
        background: on ? 'var(--cth-mint)' : 'var(--cth-ink-300)',
        boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--cth-control-edge)',
        borderRadius: 'var(--cth-radius-input)',
        transition: 'background 120ms steps(2)'
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 14 : 2, width: 10, height: 10,
          borderRadius: '50%', background: 'var(--cth-paper-100)',
          boxShadow: '0 1px 2px rgba(0,0,0,.25)',
          transition: 'left 120ms ease'
        }} />
      </span>
      <span style={{
        fontFamily: 'var(--cth-font-ui)', fontSize: 11,
        color: on ? 'var(--cth-ink-800)' : 'var(--cth-ink-500)'
      }}>{on ? onText : offText}</span>
    </button>
  );
}

function Chip({ text, tone = 'quiet' }: { text: string; tone?: 'quiet' | 'accent' }) {
  return (
    <span style={{
      fontSize: 11, fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
      padding: '2px 9px', flexShrink: 0, borderRadius: 999,
      color: tone === 'accent' ? 'var(--cth-mint-text)' : 'var(--cth-ink-600)',
      background: tone === 'accent' ? 'var(--cth-mint-light)' : 'var(--cth-cream-100)'
    }}>{text}</span>
  );
}

export function SkillsTab({ agentCwd }: { agentCwd?: string }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [addNote, setAddNote] = useState('');

  /** Add a skill you already have on disk. A skill runs inside an agent holding
   *  your keys, so the only route in is a folder you chose and can read. */
  const [addSkillPending, addSkill] = useNativeDialog(async () => {
    setAddNote('');
    const picked = await window.cth.chooseFolder();
    const dir = Array.isArray(picked) ? picked[0] : picked;
    if (!dir) return;
    setAdding(true);
    try {
      const res = await window.cth.skillsAddLocal(dir);
      if (res.ok) { setAddNote(t('skillsTab.added', { name: res.name })); await loadLocal(); }
      else setAddNote(res.error);
    } catch (e) {
      setAddNote(e instanceof Error ? e.message : String(e));
    } finally { setAdding(false); }
  });

  const [query, setQuery] = useState('');
  const [local, setLocal] = useState<LocalSkill[] | null>(null);
  const [busy, setBusy] = useState(false);
  /** Per-row action state, keyed by catalog url / local path. Keeps one row's
   *  spinner or error from being mistaken for the whole tab failing. */
  const [action, setAction] = useState<Record<string, { busy?: boolean; error?: string; done?: string }>>({});
  /** Uninstall is destructive, so it is two clicks: the first arms this, the
   *  second does it. No modal — the row itself becomes the confirmation. */
  const [confirming, setConfirming] = useState<string | null>(null);

  /** Names switched off. An agent never loads these: a bundled one is not copied
   *  into its folder, and every scope is denied in the spawned settings. */
  const [disabled, setDisabled] = useState<string[]>([]);

  /** Two panes, because they answer different questions: what did WE add here,
   *  and what shipped in the app. Both switch on and off the same way. */
  const [pane, setPane] = useState<'yours' | 'bundled'>('yours');

  const loadLocal = useCallback(async () => {
    try { setLocal(await window.cth.skillsLocal(agentCwd)); } catch { setLocal([]); }
    try { setDisabled(await window.cth.skillsDisabled()); } catch { /* off list unknown → treat all as on */ }
  }, [agentCwd]);

  const toggle = async (sk: LocalSkill, on: boolean) => {
    // Optimistic: the switch must feel instant, and a failed write just leaves
    // the next refresh to correct it.
    setDisabled((d) => (on ? d.filter((n) => n !== sk.name) : [...new Set([...d, sk.name])]));
    try { setDisabled(await window.cth.skillsSetEnabled(sk.name, on)); } catch { void loadLocal(); }
  };


  useEffect(() => { void loadLocal(); }, [loadLocal]);
  const q = query.trim().toLowerCase();

  const counts = useMemo(() => {
    const all = local ?? [];
    const bundled = all.filter((s) => s.scope === 'bundled').length;
    return { bundled, yours: all.length - bundled };
  }, [local]);

  const shownLocal = useMemo(() => {
    const want = pane === 'bundled';
    const list = (local ?? []).filter((s) => (s.scope === 'bundled') === want);
    if (!q) return list;
    return list.filter((s) =>
      s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [local, q, pane]);

  const uninstall = async (sk: LocalSkill) => {
    setConfirming(null);
    setAction((a) => ({ ...a, [sk.path]: { busy: true } }));
    try {
      const res = await window.cth.skillsUninstall(sk.path);
      if (res.ok) { setAction((a) => { const n = { ...a }; delete n[sk.path]; return n; }); void loadLocal(); }
      else setAction((a) => ({ ...a, [sk.path]: { error: res.error ?? t('skillsTab.removeFailed') } }));
    } catch (e) {
      setAction((a) => ({ ...a, [sk.path]: { error: e instanceof Error ? e.message : t('skillsTab.uninstallFailed') } }));
    }
  };

  const actionBtn = (kind: 'primary' | 'quiet' | 'danger'): React.CSSProperties => ({
    height: 26, padding: '0 12px', border: 'none', cursor: 'pointer', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11.5,
    borderRadius: 'var(--cth-radius-btn)',
    color:
      kind === 'primary' ? 'var(--cth-lilac-text)'
      : kind === 'danger' ? 'var(--cth-coral-text)'
      : 'var(--cth-ink-600)',
    background:
      kind === 'primary' ? 'var(--cth-lilac-light)'
      : kind === 'danger' ? 'var(--cth-coral-light)'
      : 'var(--cth-cream-100)',
    transition: 'background 120ms ease, color 120ms ease'
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {/* Controls — two rows so nothing wraps: what you are looking at on
          top, what you are looking for underneath. */}
      <div style={{
        flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10,
        padding: '12px 16px', borderBottom: '1px solid var(--cth-ink-100)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', gap: 2, padding: 3, flexShrink: 0,
            background: 'var(--cth-cream-100)', borderRadius: 'var(--cth-radius-btn)'
          }}>
            {(['yours', 'bundled'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setPane(k)}
                aria-pressed={pane === k}
                style={{
                  height: 26, padding: '0 12px', border: 'none', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12,
                  borderRadius: 'calc(var(--cth-radius-btn) - 2px)',
                  color: pane === k ? 'var(--cth-lilac-text)' : 'var(--cth-ink-500)',
                  background: pane === k ? 'var(--cth-paper-100)' : 'transparent',
                  boxShadow: pane === k ? 'var(--cth-shadow-sm)' : 'none',
                  transition: 'background 120ms ease, color 120ms ease'
                }}
              >
                {t(k === 'yours' ? 'skillsTab.paneYours' : 'skillsTab.paneBundled')}
                {local && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                    padding: '0 6px', borderRadius: 999,
                    color: pane === k ? 'var(--cth-lilac-text)' : 'var(--cth-ink-500)',
                    background: pane === k ? 'var(--cth-lilac-light)' : 'var(--cth-paper-100)'
                  }}>{k === 'yours' ? counts.yours : counts.bundled}</span>
                )}
              </button>
            ))}
          </span>

          <span style={{ flex: 1 }} />

          {/* Refresh sits beside Add skill, so it is the same pill in a quieter
              colour rather than a lone disc fighting the primary button. */}
          <button
            onClick={() => void loadLocal()}
            disabled={busy}
            style={{
              height: 30, padding: '0 12px', flexShrink: 0, border: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.55 : 1,
              fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12,
              color: 'var(--cth-ink-600)', background: 'var(--cth-paper-100)',
              borderRadius: 'var(--cth-radius-btn)', boxShadow: 'var(--cth-shadow-sm)',
              transition: 'background 120ms ease, color 120ms ease'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.4V7h-3.6"
                stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {busy ? t('skillsTab.loading') : t('skillsTab.refresh')}
          </button>

          {pane === 'yours' && (
            <button
              onClick={() => void addSkill()}
              disabled={adding || addSkillPending}
              style={{
                height: 30, padding: '0 14px', flexShrink: 0, border: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                cursor: adding || addSkillPending ? 'default' : 'pointer', opacity: adding || addSkillPending ? 0.6 : 1,
                fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12,
                color: 'var(--cth-on-accent)', background: 'var(--cth-lilac)',
                borderRadius: 'var(--cth-radius-btn)', boxShadow: 'var(--cth-shadow-sm)'
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
              {adding ? t('skillsTab.adding') : t('skillsTab.addSkill')}
            </button>
          )}
        </div>

        {/* Same field as Needs you: icon in, clear out. */}
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', insetInlineStart: 12, top: '50%', transform: 'translateY(-50%)',
            display: 'inline-flex', color: 'var(--cth-ink-400)', pointerEvents: 'none'
          }}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="5.6" stroke="currentColor" strokeWidth="1.7" />
              <path d="M13.2 13.2l3.4 3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <input
            className="cth-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('skillsTab.searchInstalled')}
            style={{
              width: '100%', boxSizing: 'border-box', height: 34, padding: '0 34px',
              background: 'var(--cth-paper-100)', border: 'none',
              borderRadius: 'var(--cth-radius-btn)',
              fontFamily: 'var(--cth-font-ui)', fontSize: 13,
              color: 'var(--cth-ink-900)', outline: 'none'
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('skillsTab.clearSearch')}
              style={{
                position: 'absolute', insetInlineEnd: 8, top: '50%', transform: 'translateY(-50%)',
                width: 22, height: 22, border: 'none', background: 'transparent',
                borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--cth-ink-400)'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {addNote && (
        <div style={{
          flexShrink: 0, padding: '10px 16px', fontSize: 13,
          color: 'var(--cth-ink-700)', background: 'var(--cth-cream-100)',
          borderBottom: '1px solid var(--cth-ink-300)'
        }}>{addNote}</div>
      )}

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
        {local === null ? <Muted>{t('skillsTab.scanning')}</Muted>
          : shownLocal.length === 0 ? (
            <Muted>
              {(pane === 'yours' ? counts.yours : counts.bundled) === 0
                ? t(pane === 'yours' ? 'skillsTab.noSkillsInstalled' : 'skillsTab.noneBundled')
                : t('skillsTab.nothingMatches')}
            </Muted>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shownLocal.map((s) => (
                <div
                  key={s.id + s.path}
                  style={disabled.includes(s.name) ? { ...rowStyle, opacity: 0.55 } : rowStyle}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13.5,
                      flex: 1, minWidth: 0, whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis'
                    }}>{s.name}</span>
                    <Chip text={s.scope} tone={s.scope === 'project' ? 'accent' : 'quiet'} />
                    <SkillSwitch
                      on={!disabled.includes(s.name)}
                      label={s.name}
                      onText={t('skillsTab.on')}
                      offText={t('skillsTab.off')}
                      onChange={(next) => void toggle(s, next)}
                    />
                  </div>
                  {s.description && (
                    <div style={{
                      fontSize: 12.5, color: 'var(--cth-ink-600)', lineHeight: 1.45,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>{s.description}</div>
                  )}
                  <div title={s.path} style={{
                    fontFamily: 'var(--cth-font-mono)', fontSize: 11,
                    color: 'var(--cth-ink-400)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}>{shortPath(s.path)}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => void window.cth.skillsReveal(s.path)} style={actionBtn('quiet')}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M2 4.4A1.4 1.4 0 0 1 3.4 3h2.3l1.3 1.6h5.6A1.4 1.4 0 0 1 14 6v5.6A1.4 1.4 0 0 1 12.6 13H3.4A1.4 1.4 0 0 1 2 11.6z"
                          stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                      </svg>
                      {t('skillsTab.openFolder')}
                    </button>
                    {s.scope === 'bundled' ? (
                      // Bundled skills ship inside the app and are re-copied into
                      // every agent on spawn, so "removing" one would silently come
                      // back. Say that instead of offering a button that lies.
                      <Chip text={t('skillsTab.shipsWithApp')} />
                    ) : confirming === s.path ? (
                      <>
                        <button
                          onClick={() => void uninstall(s)}
                          style={{ ...actionBtn('danger'), color: 'var(--cth-on-danger)', background: 'var(--cth-coral)' }}
                        >{t('skillsTab.deleteConfirm', { name: s.name })}</button>
                        <button onClick={() => setConfirming(null)} style={actionBtn('quiet')}>{t('common.cancel')}</button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirming(s.path)}
                        disabled={action[s.path]?.busy}
                        style={actionBtn('danger')}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M3.4 4.6h9.2M6.4 4.6V3.3h3.2v1.3M4.6 4.6l.5 7.4a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.5-7.4"
                            stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {action[s.path]?.busy ? t('skillsTab.removing') : t('skillsTab.uninstall')}
                      </button>
                    )}
                    {action[s.path]?.error && (
                      <span style={{ fontSize: 11, color: 'var(--cth-coral-text)' }}>{action[s.path]?.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

/** A path is shown to say *where*, not to be copied: $HOME collapses to ~ so the
 *  interesting tail fits on one line. The full value stays in the tooltip. */
function shortPath(path: string): string {
  const home = path.match(/^(\/(?:Users|home)\/[^/]+)\//);
  return home ? `~${path.slice(home[1].length)}` : path;
}

const rowStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px',
  background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
  borderRadius: 'var(--cth-radius-card)', color: 'var(--cth-ink-900)'
};

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'var(--cth-ink-500)', padding: 10 }}>{children}</div>;
}
