import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HarnessConfig } from '@/store/config';
import { MCP_CATALOG, mcpSecretEnvKeys, type DbConnection, type McpTier } from '@shared/mcpCatalog';
import { Switch } from './Switch';
import { Dropdown } from './Dropdown';
import { PixelButton } from './PixelButton';

export interface McpDefaultsSettingsProps {
  config: HarnessConfig;
}

const TIER_ORDER: McpTier[] = ['safe-readonly', 'write', 'secret'];
const TIER_LABEL_KEY: Record<McpTier, string> = {
  'safe-readonly': 'mcpDefaults.tiers.safeReadonly',
  'write': 'mcpDefaults.tiers.write',
  'secret': 'mcpDefaults.tiers.secret'
};
const TIER_NOTE_KEY: Record<McpTier, string> = {
  'safe-readonly': 'mcpDefaults.tiers.safeReadonlyNote',
  'write': 'mcpDefaults.tiers.writeNote',
  'secret': 'mcpDefaults.tiers.secretNote'
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
  fontSize: 11,
  lineHeight: '12px',
  color: 'var(--cth-ink-500)',
};

/** The database name out of a Postgres URL: the path segment, minus any query
 *  string. Returns undefined for anything that does not parse, in which case the
 *  row keeps the name it had. Never returns the host, the user or the password. */
function dbNameFromUrl(url: string): string | undefined {
  const path = url.split('?')[0].split('#')[0];
  const name = path.slice(path.lastIndexOf('/') + 1).trim();
  return name && !name.includes('@') && !name.includes(':') ? name : undefined;
}

export function McpDefaultsSettings({ config }: McpDefaultsSettingsProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  // Credentials are write-only: we keep what the user is typing, and a boolean
  // per field saying whether one is already stored. Nothing reads a value back.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [hasSecret, setHasSecret] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      const next: Record<string, boolean> = {};
      for (const entry of MCP_CATALOG) {
        if (entry.id === 'db') continue;              // handled per connection below
        for (const envName of mcpSecretEnvKeys(entry.id)) {
          try { next[entry.id + envName] = await window.cth.mcpSecretHas(entry.id, envName); }
          catch { next[entry.id + envName] = false; }
        }
      }
      const urls: Record<string, string> = {};
      for (const c of config.dbConnections ?? []) {
        try { next[c.id] = await window.cth.dbConnHasUrl(c.id); }
        catch { next[c.id] = false; }
        if (next[c.id]) {
          try { urls[c.id] = await window.cth.dbConnMaskedUrl(c.id); } catch { /* shows "set" */ }
        }
      }
      if (alive) { setHasSecret(next); setMasked(urls); }
    })();
    return () => { alive = false; };
  }, []);

  const saveSecret = async (id: string, envName: string) => {
    const value = (draft[id + envName] ?? '').trim();
    if (!value) return;
    const res = await window.cth.mcpSecretSet({ id, envName, value });
    if (res?.ok) {
      setHasSecret((h) => ({ ...h, [id + envName]: true }));
      setDraft((d) => ({ ...d, [id + envName]: '' }));
      setNote('saved — agents spawned from now on can use it');
    } else {
      setNote(res?.error ?? 'could not save');
    }
  };
  const clearSecret = async (id: string, envName: string) => {
    await window.cth.mcpSecretClear(id, envName);
    setHasSecret((h) => ({ ...h, [id + envName]: false }));
    setNote('removed — the server stops being offered to new agents');
  };

  // ── database connections: labels in config, URLs in the encrypted store ──
  const [conns, setConns] = useState<DbConnection[]>(config.dbConnections ?? []);
  // A saved row SHOWS its connection string (password masked) and offers
  // Replace; only a row being edited has a field and a Save. A Save button over
  // a box you cannot see the current value of is a button with nothing to say.
  const [masked, setMasked] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const loadMasked = async (id: string) => {
    try {
      const url = await window.cth.dbConnMaskedUrl(id);
      setMasked((m) => ({ ...m, [id]: url }));
    } catch { /* unreadable: the row falls back to saying it is set */ }
  };
  const persist = async (next: DbConnection[]) => {
    setConns(next);
    try { await window.cth.updateConfig({ dbConnections: next } as Partial<HarnessConfig>); }
    catch { setNote('could not save the list'); }
  };
  const addConn = () => persist([
    ...conns,
    { id: `db${Date.now().toString(36)}`, label: '' }
  ]);
  const scopeConn = (id: string, cwd?: string) =>
    persist(conns.map((c) => (c.id === id ? { ...c, cwd } : c)));
  const removeConn = async (id: string) => {
    await window.cth.dbConnClearUrl(id);
    setHasSecret((h) => ({ ...h, [id]: false }));
    await persist(conns.filter((c) => c.id !== id));
  };
  const saveUrl = async (id: string) => {
    const url = (draft[id] ?? '').trim();
    if (!url) return;
    const res = await window.cth.dbConnSetUrl({ id, url });
    if (res?.ok) {
      setHasSecret((h) => ({ ...h, [id]: true }));
      setDraft((d) => ({ ...d, [id]: '' }));
      // The URL itself is write-only: it goes to the encrypted store and is
      // never read back. The database NAME out of it is what the row is called,
      // so it is kept in the (non-secret) list. Nothing else from the URL is.
      const name = dbNameFromUrl(url);
      if (name) void persist(conns.map((c) => (c.id === id ? { ...c, label: name } : c)));
      setEditing((e) => ({ ...e, [id]: false }));
      void loadMasked(id);
      setNote('saved — agents spawned from now on can query it');
    } else {
      setNote(res?.error ?? 'could not save');
    }
  };

  const fieldStyle = {
    height: 34, padding: '0 12px', boxSizing: 'border-box',
    background: 'var(--cth-paper-100)', border: 'none',
    boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-btn)',
    fontFamily: 'var(--cth-font-mono)', fontSize: 12.5,
    color: 'var(--cth-ink-900)', outline: 'none'
  } as const;

  /** What to show in an empty field, per credential. */
  const PLACEHOLDER: Record<string, string> = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/acme_visits'
  };

  /** Seeded from config, then owned here: the prop does not change while the
   *  modal is open. */
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const e of MCP_CATALOG) out[e.id] = config.mcpDefaults?.[e.id]?.enabled ?? e.defaultEnabled ?? false;
    return out;
  });
  const enabledFor = (id: string): boolean => enabled[id] ?? false;

  const toggle = async (id: string) => {
    const next = !enabledFor(id);
    setEnabled((e) => ({ ...e, [id]: next }));   // the switch has to move now
    try {
      await window.cth.updateConfig({
        mcpDefaults: { ...(config.mcpDefaults ?? {}), [id]: { enabled: next } }
      });
    } catch {
      setEnabled((e) => ({ ...e, [id]: !next }));  // the write failed; put it back
      setNote(t('mcpDefaults.couldNotSave'));
      setTimeout(() => setNote(''), 2000);
    }
  };

  const byTier = (tier: McpTier) => MCP_CATALOG.filter((e) => e.tier === tier);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>{t('mcpDefaults.title')}</div>
        <span style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
          {t('mcpDefaults.desc')}
        </span>
      </div>

      {TIER_ORDER.map((tier) => {
        const entries = byTier(tier);
        if (entries.length === 0) return null;
        const isConsent = tier !== 'safe-readonly';
        return (
          <div key={tier} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{
                fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, lineHeight: '12px',
                color: isConsent ? 'var(--cth-coral-text)' : 'var(--cth-ink-500)',
              }}>
                {t(TIER_LABEL_KEY[tier])}
              </span>
              <span style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-400, var(--cth-ink-500))' }}>
                {t(TIER_NOTE_KEY[tier])}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {entries.map((entry) => {
                const on = enabledFor(entry.id);
                const envKeys = mcpSecretEnvKeys(entry.id);
                return (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 8,
                      padding: '10px 14px',
                      background: 'var(--cth-paper-100)',
                      boxShadow: `inset 0 0 0 1px ${isConsent && on ? 'var(--cth-coral)' : 'var(--cth-ink-100)'}`,
                      borderRadius: 'var(--cth-radius-card)'
                    }}
                  >
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-900)', fontWeight: 600 }}>
                        {entry.label}
                        <code style={{
                          marginLeft: 6,
                          fontFamily: 'var(--cth-font-mono)',
                          fontSize: 11,
                          color: 'var(--cth-ink-500)',
                          fontWeight: 400
                        }}>{entry.id}</code>
                      </span>
                      <span style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)', wordBreak: 'break-word' }}>
                        {entry.description}
                      </span>
                    </div>
                    <Switch
                      on={on}
                      label={entry.label}
                      onChange={() => { void toggle(entry.id); }}
                      tone={isConsent ? 'var(--cth-coral)' : 'var(--cth-mint)'}
                    />
                  </div>

                  {/* The Database entry is a LIST: one row per database, each
                      optionally tied to a project so an agent only ever sees its
                      own. URLs are write-only — they go to the encrypted store
                      and are never read back, so a row says "set", not the value. */}
                  {entry.id === 'db' && on && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* What a connection string looks like, before you are
                          asked to paste one. The parts are named rather than
                          filled in with a plausible-looking fake, so nothing
                          here can be pasted by mistake. */}
                      <div style={{
                        padding: 12, borderRadius: 'var(--cth-radius-card)',
                        background: 'var(--cth-cream-100)',
                        display: 'flex', flexDirection: 'column', gap: 6
                      }}>
                        <span style={{
                          fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12,
                          color: 'var(--cth-ink-600)'
                        }}>{t('mcpDefaults.dbUrlShape')}</span>
                        <code style={{
                          fontFamily: 'var(--cth-font-mono)', fontSize: 12.5, lineHeight: '20px',
                          color: 'var(--cth-ink-900)', overflowX: 'auto', whiteSpace: 'pre'
                        }}>postgresql://<span style={{ color: 'var(--cth-lilac-text)' }}>user</span>:<span style={{ color: 'var(--cth-lilac-text)' }}>password</span>@<span style={{ color: 'var(--cth-sky-text)' }}>host</span>:<span style={{ color: 'var(--cth-sky-text)' }}>5432</span>/<span style={{ color: 'var(--cth-mint-text)' }}>database</span></code>
                        <span style={{
                          fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)'
                        }}>{t('mcpDefaults.dbUrlHint')}</span>
                      </div>
                      {conns.map((c) => {
                        const set = !!hasSecret[c.id];
                        const open = !set || editing[c.id];
                        return (
                        <div key={c.id} style={{
                          display: 'flex', flexDirection: 'column', gap: 8,
                          padding: 12, borderRadius: 'var(--cth-radius-card)',
                          background: 'var(--cth-cream-100)'
                        }}>
                        {/* Name, scope and state on one line. The scope belongs
                            up here with the name: which project this database
                            is for is part of what the row IS, not part of
                            editing its string. */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{
                            fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13,
                            color: set ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)'
                          }}>{set && c.label ? c.label : t('mcpDefaults.dbUnset')}</span>
                          <span style={{ flex: 1 }} />
                          <Dropdown
                            value={c.cwd ?? ''}
                            options={[
                              { value: '', label: t('mcpDefaults.everyProject') },
                              ...(config.registeredRepos ?? []).map((r) => ({
                                value: r, label: r.split('/').filter(Boolean).pop() ?? r
                              }))
                            ]}
                            onChange={(v) => scopeConn(c.id, v || undefined)}
                            ariaLabel={t('mcpDefaults.dbScopeLabel')}
                            width={190}
                          />
                        </div>

                        {/* SET, and not being edited: the string itself, with
                            the password masked. A row that can only say "Set"
                            is a row you cannot check — and pointing at the
                            wrong database, or at a user with write access, is
                            visible in exactly these characters. */}
                        {!open && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <code style={{
                              flex: 1, minWidth: 0,
                              fontFamily: 'var(--cth-font-mono)', fontSize: 12.5, lineHeight: '30px',
                              color: 'var(--cth-ink-700)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }} title={masked[c.id] ?? ''}>{masked[c.id] || t('mcpDefaults.dbSet')}</code>
                            <PixelButton variant="secondary" size="sm" onClick={() => {
                              setEditing((e) => ({ ...e, [c.id]: true }));
                              setDraft((d) => ({ ...d, [c.id]: '' }));
                            }}>{t('mcpDefaults.dbReplace')}</PixelButton>
                            <PixelButton variant="secondary" size="sm" onClick={() => { void removeConn(c.id); }}>
                              {t('common.delete')}
                            </PixelButton>
                          </div>
                        )}

                        {/* Being edited, or never set. Plain text, not dots: a
                            connection string is a structure you check by
                            reading it, and a password field hides every part of
                            that. Write-only at rest all the same — stored
                            encrypted, and only ever read back masked. */}
                        {open && (
                          <>
                            <input
                              className="cth-input"
                              type="text"
                              spellCheck={false}
                              autoComplete="off"
                              autoFocus={!!editing[c.id]}
                              value={draft[c.id] ?? ''}
                              onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && (draft[c.id] ?? '').trim()) void saveUrl(c.id);
                                if (e.key === 'Escape' && set) setEditing((x) => ({ ...x, [c.id]: false }));
                              }}
                              placeholder="postgresql://user:pass@localhost:5432/acme_visits"
                              style={{ ...fieldStyle, width: '100%' }}
                            />
                            <div style={{ display: 'flex', gap: 8 }}>
                              <PixelButton
                                variant="primary"
                                size="sm"
                                disabled={!(draft[c.id] ?? '').trim()}
                                onClick={() => { void saveUrl(c.id); }}
                              >{t('common.save')}</PixelButton>
                              {set ? (
                                <PixelButton variant="secondary" size="sm" onClick={() => {
                                  setEditing((e) => ({ ...e, [c.id]: false }));
                                  setDraft((d) => ({ ...d, [c.id]: '' }));
                                }}>{t('common.cancel')}</PixelButton>
                              ) : (
                                <PixelButton variant="secondary" size="sm" onClick={() => { void removeConn(c.id); }}>
                                  {t('common.delete')}
                                </PixelButton>
                              )}
                            </div>
                          </>
                        )}
                        </div>
                        );
                      })}
                      <div>
                        <button
                          onClick={() => { void addConn(); }}
                          style={{
                            height: 30, padding: '0 14px', border: 'none', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12,
                            color: 'var(--cth-on-accent)', background: 'var(--cth-lilac)',
                            borderRadius: 'var(--cth-radius-btn)', boxShadow: 'var(--cth-shadow-sm)'
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                          </svg>
                          {t('mcpDefaults.addDatabase')}
                        </button>
                      </div>
                    </div>
                  )}

                  {entry.id !== 'db' && envKeys.map((envName) => (
                    <div key={envName} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        className="cth-input"
                        type="password"
                        autoComplete="off"
                        value={draft[entry.id + envName] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [entry.id + envName]: e.target.value }))}
                        placeholder={hasSecret[entry.id + envName]
                          ? `${envName} · set — paste a new one to replace it`
                          : PLACEHOLDER[envName] ?? envName}
                        style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
                      />
                      <PixelButton variant="secondary" size="sm" onClick={() => { void saveSecret(entry.id, envName); }}>
                        {t('common.save')}
                      </PixelButton>
                      {hasSecret[entry.id + envName] && (
                        <PixelButton variant="secondary" size="sm" onClick={() => { void clearSecret(entry.id, envName); }}>
                          {t('common.delete')}
                        </PixelButton>
                      )}
                    </div>
                  ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {note && (
        <span style={{ fontSize: 13, color: 'var(--cth-mint-text)' }}>{note}</span>
      )}
    </div>
  );
}
