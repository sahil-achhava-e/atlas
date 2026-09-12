import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HarnessConfig } from '@/store/config';
import { MCP_CATALOG, mcpSecretEnvKeys, type DbConnection, type McpTier } from '@shared/mcpCatalog';
import { Switch } from './Switch';
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
      for (const c of config.dbConnections ?? []) {
        try { next[c.id] = await window.cth.dbConnHasUrl(c.id); }
        catch { next[c.id] = false; }
      }
      if (alive) setHasSecret(next);
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
  const persist = async (next: DbConnection[]) => {
    setConns(next);
    try { await window.cth.updateConfig({ dbConnections: next } as Partial<HarnessConfig>); }
    catch { setNote('could not save the list'); }
  };
  const addConn = () => persist([
    ...conns,
    { id: `db${Date.now().toString(36)}`, label: `database ${conns.length + 1}` }
  ]);
  const renameConn = (id: string, label: string) =>
    persist(conns.map((c) => (c.id === id ? { ...c, label } : c)));
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
      setNote('saved — agents spawned from now on can query it');
    } else {
      setNote(res?.error ?? 'could not save');
    }
  };

  const fieldStyle = {
    padding: '10px 12px 5px',
    background: 'var(--cth-cream-100)', border: 'none',
    boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-btn)',
    fontFamily: 'var(--cth-font-mono)', fontSize: 13,
    color: 'var(--cth-ink-900)', outline: 'none'
  } as const;

  /** What to show in an empty field, per credential. */
  const PLACEHOLDER: Record<string, string> = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/epicxp_visits'
  };

  const enabledFor = (id: string): boolean =>
    config.mcpDefaults?.[id]?.enabled ?? MCP_CATALOG.find((e) => e.id === id)?.defaultEnabled ?? false;

  const toggle = async (id: string) => {
    const next = !enabledFor(id);
    try {
      await window.cth.updateConfig({
        mcpDefaults: { ...(config.mcpDefaults ?? {}), [id]: { enabled: next } }
      });
      setNote(t('mcpDefaults.toggleNote', { id, state: next ? t('common.on') : t('common.off') }));
      setTimeout(() => setNote(''), 1800);
    } catch {
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
                color: isConsent ? '#6E1423' : 'var(--cth-ink-500)',
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
                  {entry.id === 'db' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {conns.map((c) => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <input
                            className="cth-input"
                            value={c.label}
                            onChange={(e) => renameConn(c.id, e.target.value)}
                            placeholder="label, e.g. visits"
                            style={{ ...fieldStyle, width: 120, fontFamily: 'var(--cth-font-ui)' }}
                          />
                          <select
                            value={c.cwd ?? ''}
                            onChange={(e) => scopeConn(c.id, e.target.value || undefined)}
                            style={{ ...fieldStyle, width: 190 }}
                            aria-label="project this database belongs to"
                          >
                            <option value="">every project</option>
                            {(config.registeredRepos ?? []).map((r) => (
                              <option key={r} value={r}>{r.split('/').filter(Boolean).pop()}</option>
                            ))}
                          </select>
                          <input
                            className="cth-input"
                            type="password"
                            autoComplete="off"
                            value={draft[c.id] ?? ''}
                            onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                            placeholder={hasSecret[c.id]
                              ? 'set — paste a new one to replace it'
                              : 'postgresql://user:pass@localhost:5432/epicxp_visits'}
                            style={{ ...fieldStyle, flex: 1, minWidth: 200 }}
                          />
                          <PixelButton variant="secondary" size="sm" onClick={() => { void saveUrl(c.id); }}>
                            {t('common.save')}
                          </PixelButton>
                          <PixelButton variant="secondary" size="sm" onClick={() => { void removeConn(c.id); }}>
                            {t('common.delete')}
                          </PixelButton>
                        </div>
                      ))}
                      <div>
                        <PixelButton variant="secondary" size="sm" onClick={() => { void addConn(); }}>
                          + add a database
                        </PixelButton>
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
                        style={{
                          flex: 1, minWidth: 0, padding: '10px 12px 5px',
                          background: 'var(--cth-cream-100)', border: 'none',
                          boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-btn)',
                          fontFamily: 'var(--cth-font-mono)', fontSize: 13,
                          color: 'var(--cth-ink-900)', outline: 'none'
                        }}
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
        <span style={{ fontSize: 13, color: 'var(--cth-mint)' }}>{note}</span>
      )}
    </div>
  );
}
