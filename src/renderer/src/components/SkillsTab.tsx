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


const PROVIDER_LABEL: Record<LocalSkill['provider'], string> = {
  claude: 'Claude Code',
  opencode: 'OpenCode',
  codex: 'Codex'
};

function Chip({ text, tone = 'quiet' }: { text: string; tone?: 'quiet' | 'accent' }) {
  return (
    <span style={{
      fontSize: 10, fontFamily: 'var(--cth-font-display)', letterSpacing: 0.4,
      padding: '2px 6px', flexShrink: 0, textTransform: 'uppercase',
      color: 'var(--cth-ink-900)',
      background: tone === 'accent' ? 'var(--cth-mint-light)' : 'var(--cth-cream-200)',
      boxShadow: `inset 0 0 0 1px ${tone === 'accent' ? 'var(--cth-mint)' : 'var(--cth-ink-300)'}`
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

  /** Skills that came with Atlas are not yours to manage — you cannot uninstall
   *  them from here and nothing about them changes. Listing them buried the two
   *  or three you actually added. The count below still names them, because a
   *  tab that silently omits live skills is lying about what agents can do. */
  const bundledCount = (local ?? []).filter((s) => s.scope === 'bundled').length;

  const shownLocal = useMemo(() => {
    const list = (local ?? []).filter((s) => s.scope !== 'bundled');
    if (!q) return list;
    return list.filter((s) =>
      s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [local, q]);

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
    }`
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {/* Controls */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        padding: 10, borderBottom: '1px solid var(--cth-ink-300)'
      }}>
        <span style={{
          fontFamily: 'var(--cth-font-display)', fontSize: 9, lineHeight: '13px',
          color: 'var(--cth-ink-700)', textTransform: 'uppercase'
        }}>
          {t('skillsTab.installed')}{local ? ` (${local.length - bundledCount})` : ''}
        </span>
        {bundledCount > 0 && (
          <span style={{
            fontFamily: 'var(--cth-font-ui)', fontSize: 11,
            color: 'var(--cth-ink-600)', flexShrink: 0
          }}>
            {t('skillsTab.plusBundled', { count: bundledCount })}
          </span>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('skillsTab.searchInstalled')}
          style={{
            flex: 1, minWidth: 140, padding: '4px 8px',
            background: 'var(--cth-paper-100)', color: 'var(--cth-ink-900)',
            border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
            fontFamily: 'var(--cth-font-ui)', fontSize: 12
          }}
        />
        <PixelButton variant="ghost" size="sm" onClick={() => void loadLocal()} disabled={busy}>
          {busy ? t('skillsTab.loading') : t('skillsTab.refresh')}
        </PixelButton>
        <PixelButton variant="secondary" size="sm" onClick={() => void addSkill()} disabled={adding}>
          {adding ? t('skillsTab.adding') : t('skillsTab.addSkill')}
        </PixelButton>
      </div>

      {addNote && (
        <div style={{
          flexShrink: 0, padding: '6px 10px', fontSize: 12,
          color: 'var(--cth-ink-700)', background: 'var(--cth-cream-100)',
          borderBottom: '1px solid var(--cth-ink-300)'
        }}>{addNote}</div>
      )}

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
        {local === null ? <Muted>{t('skillsTab.scanning')}</Muted>
          : shownLocal.length === 0 ? (
            <Muted>
              {local.length - bundledCount === 0
                ? t('skillsTab.noSkillsInstalled')
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
                    <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 11, flex: 1, minWidth: 0 }}>
                      {s.name.toUpperCase()}
                    </span>
                    <Chip text={PROVIDER_LABEL[s.provider]} />
                    <Chip text={s.scope} tone={s.scope === 'project' ? 'accent' : 'quiet'} />
                    <label style={{
                      display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer',
                      fontFamily: 'var(--cth-font-ui)', fontSize: 11,
                      color: disabled.includes(s.name) ? 'var(--cth-ink-500)' : 'var(--cth-ink-800)'
                    }}>
                      <input
                        type="checkbox"
                        checked={!disabled.includes(s.name)}
                        onChange={(e) => void toggle(s, e.target.checked)}
                        style={{ accentColor: 'var(--cth-mint)', cursor: 'pointer', margin: 0 }}
                      />
                      {disabled.includes(s.name) ? t('skillsTab.off') : t('skillsTab.on')}
                    </label>
                  </div>
                  {s.description && (
                    <div style={{ fontSize: 12, color: 'var(--cth-ink-700)', lineHeight: 1.45 }}>
                      {s.description.length > 220 ? `${s.description.slice(0, 220)}…` : s.description}
                    </div>
                  )}
                  <div style={{
                    fontFamily: 'var(--cth-font-mono)', fontSize: 10.5,
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
  background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
  color: 'var(--cth-ink-900)'
};

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--cth-ink-500)', padding: 6 }}>{children}</div>;
}
