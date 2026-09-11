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
      title={on ? onText : offText}
      onClick={() => onChange(!on)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: 0, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0
      }}
    >
      <span style={{
        position: 'relative', width: 26, height: 14, flexShrink: 0,
        background: on ? 'var(--cth-mint)' : 'var(--cth-cream-200)',
        boxShadow: `inset 0 0 0 1px var(--cth-ink-${on ? '400' : '300'})`,
            borderRadius: 'var(--cth-radius-input)',
        transition: 'background 120ms steps(2)'
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 14 : 2, width: 10, height: 10,
          background: on ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)',
          transition: 'left 120ms steps(3)'
        }} />
      </span>
      <span style={{
        fontFamily: 'var(--cth-font-ui)', fontSize: 11,
        color: on ? 'var(--cth-ink-800)' : 'var(--cth-ink-500)'
      }}>{on ? onText : offText}</span>
    </button>
  );
}

const PROVIDER_LABEL: Record<LocalSkill['provider'], string> = {
  claude: 'Claude Code',
  opencode: 'OpenCode',
  codex: 'Codex'
};

function Chip({ text, tone = 'quiet' }: { text: string; tone?: 'quiet' | 'accent' }) {
  return (
    <span style={{
      fontSize: 11, fontFamily: 'var(--cth-font-ui)', fontWeight: 600, letterSpacing: 0.4,
      padding: '2px 6px', flexShrink: 0,
      color: 'var(--cth-ink-900)',
      background: tone === 'accent' ? 'var(--cth-mint-light)' : 'var(--cth-cream-200)',
      boxShadow: `inset 0 0 0 1px ${tone === 'accent' ? 'var(--cth-mint)' : 'var(--cth-ink-300)'}`,
            borderRadius: 'var(--cth-radius-input)'
    }}>{text}</span>
  );
}

export function SkillsTab({ agentCwd }: { agentCwd?: string }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [addNote, setAddNote] = useState('');

  /** Add a skill you already have on disk. A skill runs inside an agent holding
   *  your keys, so the only route in is a folder you chose and can read. */
  const addSkill = async () => {
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
  };

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
    padding: '3px 9px 2px', border: 'none', cursor: 'pointer', flexShrink: 0,
    fontFamily: 'var(--cth-font-ui)', fontSize: 11,
    color: 'var(--cth-ink-900)',
    background:
      kind === 'primary' ? 'var(--cth-mint-light)'
      : kind === 'danger' ? 'var(--cth-coral-light)'
      : 'var(--cth-cream-200)',
    boxShadow: `inset 0 0 0 1px ${
      kind === 'primary' ? 'var(--cth-mint)' : kind === 'danger' ? 'var(--cth-coral)' : 'var(--cth-ink-300)'
    }`,
            borderRadius: 'var(--cth-radius-input)'
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {/* Controls */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        padding: 10, borderBottom: '1px solid var(--cth-ink-300)'
      }}>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {(['yours', 'bundled'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setPane(k)}
              style={{
                padding: '4px 10px 3px', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, letterSpacing: '.4px',
                color: pane === k ? 'var(--cth-ink-900)' : 'var(--cth-ink-600)',
                background: pane === k ? 'var(--cth-cream-100)' : 'transparent',
                boxShadow: pane === k ? 'inset 0 -2px 0 var(--cth-mint)' : 'none'
              }}
            >
              {t(k === 'yours' ? 'skillsTab.paneYours' : 'skillsTab.paneBundled')}
              {local ? ` (${k === 'yours' ? counts.yours : counts.bundled})` : ''}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('skillsTab.searchInstalled')}
          style={{
            flex: 1, minWidth: 140, padding: '4px 8px',
            background: 'var(--cth-paper-100)', color: 'var(--cth-ink-900)',
            border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)',
            fontFamily: 'var(--cth-font-ui)', fontSize: 13
          }}
        />
        <PixelButton variant="ghost" size="sm" onClick={() => void loadLocal()} disabled={busy}>
          {busy ? t('skillsTab.loading') : t('skillsTab.refresh')}
        </PixelButton>
        {pane === 'yours' && (
          <PixelButton variant="secondary" size="sm" onClick={() => void addSkill()} disabled={adding}>
            {adding ? t('skillsTab.adding') : t('skillsTab.addSkill')}
          </PixelButton>
        )}
      </div>

      {addNote && (
        <div style={{
          flexShrink: 0, padding: '6px 10px', fontSize: 13,
          color: 'var(--cth-ink-700)', background: 'var(--cth-cream-100)',
          borderBottom: '1px solid var(--cth-ink-300)'
        }}>{addNote}</div>
      )}

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
        {local === null ? <Muted>{t('skillsTab.scanning')}</Muted>
          : shownLocal.length === 0 ? (
            <Muted>
              {(pane === 'yours' ? counts.yours : counts.bundled) === 0
                ? t(pane === 'yours' ? 'skillsTab.noSkillsInstalled' : 'skillsTab.noneBundled')
                : t('skillsTab.nothingMatches')}
            </Muted>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {shownLocal.map((s) => (
                <div
                  key={s.id + s.path}
                  style={disabled.includes(s.name) ? { ...rowStyle, opacity: 0.55 } : rowStyle}
                >
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, flex: 1, minWidth: 0 }}>
                      {s.name.toUpperCase()}
                    </span>
                    <Chip text={PROVIDER_LABEL[s.provider]} />
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
                    <div style={{ fontSize: 13, color: 'var(--cth-ink-700)', lineHeight: 1.45 }}>
                      {s.description.length > 220 ? `${s.description.slice(0, 220)}…` : s.description}
                    </div>
                  )}
                  <div style={{
                    fontFamily: 'var(--cth-font-mono)', fontSize: 11,
                    color: 'var(--cth-ink-500)', wordBreak: 'break-all'
                  }}>{s.path}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => void window.cth.skillsReveal(s.path)} style={actionBtn('quiet')}>
                      {t('skillsTab.openFolder')}
                    </button>
                    {s.scope === 'bundled' ? (
                      // Bundled skills ship inside the app and are re-copied into
                      // every agent on spawn, so "removing" one would silently come
                      // back. Say that instead of offering a button that lies.
                      <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
                        {t('skillsTab.shipsWithApp')}
                      </span>
                    ) : confirming === s.path ? (
                      <>
                        <button onClick={() => void uninstall(s)} style={actionBtn('danger')}>
                          {t('skillsTab.deleteConfirm', { name: s.name })}
                        </button>
                        <button onClick={() => setConfirming(null)} style={actionBtn('quiet')}>{t('common.cancel')}</button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirming(s.path)}
                        disabled={action[s.path]?.busy}
                        style={actionBtn('quiet')}
                      >{action[s.path]?.busy ? t('skillsTab.removing') : t('skillsTab.uninstall')}</button>
                    )}
                    {action[s.path]?.error && (
                      <span style={{ fontSize: 11, color: 'var(--cth-coral)' }}>{action[s.path]?.error}</span>
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

const rowStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, padding: 10,
  background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)',
  color: 'var(--cth-ink-900)'
};

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'var(--cth-ink-500)', padding: 6 }}>{children}</div>;
}
