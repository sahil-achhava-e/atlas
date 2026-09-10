import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HarnessConfig } from '@/store/config';
import { MCP_CATALOG, mcpSecretEnvKeys, type McpTier } from '@shared/mcpCatalog';
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
  fontFamily: 'var(--cth-font-display)',
  fontSize: 8,
  lineHeight: '12px',
  color: 'var(--cth-ink-500)',
  textTransform: 'uppercase'
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
        for (const envName of mcpSecretEnvKeys(entry.id)) {
          try { next[entry.id + envName] = await window.cth.mcpSecretHas(entry.id, envName); }
          catch { next[entry.id + envName] = false; }
        }
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
        <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
          {t('mcpDefaults.desc')}
        </span>
      </div>

      {TIER_ORDER.map((tier) => {
        const entries = byTier(tier);
        if (entries.length === 0) return null;
        const isConsent = tier !== 'safe-readonly';
        return (
          <div key={tier} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{
                fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px',
                color: isConsent ? '#6E1423' : 'var(--cth-ink-500)',
                textTransform: 'uppercase'
              }}>
                {t(TIER_LABEL_KEY[tier])}
              </span>
              <span style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-400, var(--cth-ink-500))' }}>
                {t(TIER_NOTE_KEY[tier])}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {entries.map((entry) => {
                const on = enabledFor(entry.id);
                const envKeys = mcpSecretEnvKeys(entry.id);
                return (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 8,
                      padding: '7px 10px',
                      background: 'var(--cth-paper-100)',
                      boxShadow: `inset 0 0 0 1px ${isConsent && on ? '#6E1423' : 'var(--cth-ink-300)'}`
                    }}
                  >
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink-900)', fontWeight: 600 }}>
                        {entry.label}
                        <code style={{
                          marginLeft: 6,
                          fontFamily: 'var(--cth-font-mono)',
                          fontSize: 11,
                          color: 'var(--cth-ink-500)',
                          fontWeight: 400
                        }}>{entry.id}</code>
                      </span>
                      <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)', wordBreak: 'break-word' }}>
                        {entry.description}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { void toggle(entry.id); }}
                      style={{
                        flexShrink: 0,
                        padding: '3px 10px 1px',
                        background: on
                          ? (isConsent ? 'var(--cth-coral-light, #f6d3c4)' : 'var(--cth-lemon)')
                          : 'var(--cth-cream-200)',
                        boxShadow: `inset 0 0 0 1px ${on ? 'var(--cth-ink-900)' : 'var(--cth-ink-700)'}`,
                        border: 'none',
                        fontFamily: 'var(--cth-font-display)',
                        fontSize: 8,
                        lineHeight: '14px',
                        color: 'var(--cth-ink-900)',
                        cursor: 'pointer',
                        textTransform: 'uppercase'
                      }}
                    >
                      {on ? t('common.on') : t('common.off')}
                    </button>
                  </div>

                  {/* A keyed server needs its credential before it can start, so
                      the field lives with the switch rather than in another tab.
                      Write-only: it goes to the encrypted store and is never read
                      back, so the box shows "set" rather than the value. */}
                  {envKeys.map((envName) => (
                    <div key={envName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="password"
                        autoComplete="off"
                        value={draft[entry.id + envName] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [entry.id + envName]: e.target.value }))}
                        placeholder={hasSecret[entry.id + envName]
                          ? `${envName} · set — paste a new one to replace it`
                          : PLACEHOLDER[envName] ?? envName}
                        style={{
                          flex: 1, minWidth: 0, padding: '6px 8px 5px',
                          background: 'var(--cth-cream-100)', border: 'none',
                          boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
                          fontFamily: 'var(--cth-font-mono)', fontSize: 12,
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
        <span style={{ fontSize: 12, color: 'var(--cth-mint)' }}>{note}</span>
      )}
    </div>
  );
}
