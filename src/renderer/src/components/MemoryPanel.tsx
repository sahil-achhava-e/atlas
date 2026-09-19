import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { isComposingKey } from '@shared/imeGuard';
import { useRtl } from '@/i18n/useDirection';

/** Mirrors preload's MemoryStatus. `backend` is worth showing: the jsonl
 *  fallback is slower, and a user who sees it can ask why. */
interface MemoryStatus {
  available: boolean;
  enabled: boolean;
  active: boolean;
  initialized: boolean;
  palacePath: string | null;
  backend: string | null;
  chunks: number;
  agents: number;
}

/**
 * Lets the human search the shared memory agents build up across sessions, turn
 * it on/off, and pick how it searches. Agents read/write it directly; this is
 * the human-facing window into the same memory.
 */
export interface MemoryPanelProps {
  /** Docked inside the Command Center's Memory tab: no pill, no floating box,
   *  no Close. It used to hover over the office floor, where it covered the
   *  agents it was describing and read as a stray popup. */
  docked?: boolean;
}

export function MemoryPanel({ docked = false }: MemoryPanelProps) {
  const { t } = useTranslation();
  const rtl = useRtl();
  const [open, setOpen] = useState(docked);
  const [status, setStatus] = useState<MemoryStatus | null>(null);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const refreshStatus = async () => {
    try { setStatus(await window.cth.memoryStatus()); } catch { /* ignore */ }
  };
  useEffect(() => { refreshStatus(); }, []);

  const toggleEnabled = async () => {
    // The label and the action must read the SAME value. This defaulted the
    // unknown state to `true`, so before status loaded — or whenever the status
    // call fails — the button said "Turn on" and wrote `false`: one click that
    // claimed to enable memory and disabled it. The label already treats
    // unknown as off, so this does too.
    await window.cth.updateConfig({ semanticMemory: status?.enabled !== true });
    await refreshStatus();
  };

  const run = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setResult('');
    try {
      const res = await window.cth.searchMemory(query.trim());
      setResult(res.ok ? (res.output || t('memoryPanel.nothingMatched')) : `${t('memoryPanel.searchFailed')}: ${res.error}`);
    } finally {
      setBusy(false);
    }
  };

  const active = status?.active;
  const pill = active ? t('memoryPanel.pillActive') : t('memoryPanel.pill');

  // One clear state line. There is no "not installed" any more — the index
  // ships with the app — so the only states left are off, on and building.
  const state: { dot: string; label: string } = !status?.enabled
    ? { dot: 'var(--cth-ink-500)', label: t('common.off') }
    : status.initialized
      ? { dot: 'var(--cth-mint)', label: t('memoryPanel.onReady') }
      : { dot: 'var(--cth-lemon)', label: t('memoryPanel.onGettingReady') };

  const canSearch = !!status?.enabled;

  return (
    <div style={docked
      ? { width: '100%' }
      : { position: 'absolute', bottom: 12, left: 12, width: open ? 380 : 'auto', zIndex: 40 }}>
      {!open ? (
        <button
          onClick={() => { setOpen(true); refreshStatus(); }}
          style={{
            padding: '5px 16px 3px',
            background: active ? 'var(--cth-lemon-light)' : 'var(--cth-cream-200)',
            boxShadow: 'inset 0 0 0 1.5px var(--cth-ink-500)',
            fontFamily: 'var(--cth-font-ui)',
            fontSize: 13,
            color: 'var(--cth-ink-900)',
            cursor: 'pointer',
            border: 'none'
          }}
        >
          {pill}
        </button>
      ) : (
        <PixelPanel variant={docked ? 'default' : 'dialog'} title={docked ? undefined : t('memoryPanel.title')} noPadding>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>

            {/* What this is — one plain line. */}
            <div style={{ fontSize: 13, color: 'var(--cth-ink-700)', lineHeight: 1.5 }}>
              {t('memoryPanel.intro')}
            </div>

            {/* Status + on/off — the two things the user controls at a glance. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--cth-ink-900)', fontFamily: 'var(--cth-font-ui)' }}>
                <span style={{ width: 9, height: 9, background: state.dot, boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)' }} />
                {state.label}
              </span>
                <PixelButton
                  variant={status?.enabled ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={toggleEnabled}
                >
                  {status?.enabled ? t('memoryPanel.turnOff') : t('memoryPanel.turnOn')}
                </PixelButton>
            </div>

            {/* What the index holds. It replaced a row of install instructions:
                nothing needs installing, so the useful thing to say is how much
                there is to search and which backend answered. */}
            {status?.enabled && (
              <div style={{ fontSize: 12.5, color: 'var(--cth-ink-500)', lineHeight: 1.6 }}>
                {t('memoryPanel.indexed', {
                  chunks: status.chunks ?? 0,
                  agents: status.agents ?? 0,
                  backend: status.backend ?? '—'
                })}
              </div>
            )}

            {/* Search the memory. Not when docked: the tab this sits in has its
                own search, and two boxes asking the same question is worse than
                one. */}
            {!docked && canSearch && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter') run(); }}
                    placeholder={t('memoryPanel.searchPlaceholder')}
                    className="cth-input"
                    style={{
                      flex: 1, padding: '10px 12px 4px',
                      background: 'var(--cth-paper-100)', border: 'none',
                      borderRadius: 'var(--cth-radius-input)',
                      fontFamily: 'var(--cth-font-ui)', fontSize: 13,
                      color: 'var(--cth-ink-900)'
                    }}
                  />
                  <PixelButton variant="primary" size="sm" onClick={run} disabled={busy}>
                    {busy ? '…' : t('common.search')}
                  </PixelButton>
                </div>
                {result && (
                  <pre style={{
                    margin: 0, maxHeight: '40vh', overflow: 'auto',
                    background: 'var(--cth-cream-100)',
                    boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)',
                    padding: 12, fontFamily: 'var(--cth-font-mono)', fontSize: 13,
                    whiteSpace: 'pre-wrap', color: 'var(--cth-ink-900)'
                  }} dir={rtl ? 'auto' : undefined}>{result}</pre>
                )}
              </div>
            )}

            {!docked && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--cth-ink-300)', paddingTop: 10 }}>
                <PixelButton variant="ghost" size="sm" onClick={() => setOpen(false)}>{t('common.close')}</PixelButton>
              </div>
            )}
          </div>
        </PixelPanel>
      )}
    </div>
  );
}
