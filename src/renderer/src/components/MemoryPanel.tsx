import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { isComposingKey } from '@shared/imeGuard';
import { useRtl } from '@/i18n/useDirection';

interface MemoryStatus {
  available: boolean;
  preparing?: boolean;
  prepareError?: string | null;
  containerized?: boolean;
  docker?: { installed: boolean; running: boolean };
  enabled: boolean;
  active: boolean;
  initialized: boolean;
  palacePath: string | null;
  model: 'minilm' | 'embeddinggemma';
  bin: string | null;
}

type ModelId = 'minilm' | 'embeddinggemma';

// Plain-language framing of each model — lead with the benefit the user actually
// chooses between, not the model's codename. Labels are i18n keys.
const MODELS: { id: ModelId; titleKey: string; detailKey: string }[] = [
  { id: 'minilm',         titleKey: 'memoryPanel.modelFast',         detailKey: 'memoryPanel.modelFastDetail' },
  { id: 'embeddinggemma', titleKey: 'memoryPanel.modelMultilingual', detailKey: 'memoryPanel.modelMultilingualDetail' },
];

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

  const setModel = async (model: ModelId) => {
    await window.cth.updateConfig({ embeddingModel: model });
    await refreshStatus();
  };
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
  const pill = active ? `${t('memoryPanel.pillActive')} · ${status?.model}` : t('memoryPanel.pill');

  // One clear state line: is memory working, off, or not set up?
  // "Preparing" comes FIRST, before "not set up". A first run on a machine with
  // no native mempalace spends ~2 minutes building the container image, and
  // during that window `available` is false — so without this the panel tells
  // you to go and install something that is already installing itself.
  // "Not set up" was true and useless: it never said that the one thing in the
  // way is Docker. Turning memory on cannot do anything while the daemon is
  // down, so the line says which.
  const dockerBlocked = !!status?.enabled && !status?.available && !status?.preparing
    && !!status?.docker && !status.docker.running;
  const state: { dot: string; label: string } = status?.preparing
    ? { dot: 'var(--cth-lemon)', label: t('memoryPanel.preparing') }
    : status?.prepareError
      ? { dot: 'var(--cth-coral)', label: t('memoryPanel.prepareFailed') }
    : dockerBlocked
      ? { dot: 'var(--cth-lemon)', label: status?.docker?.installed
          ? t('memoryPanel.dockerStopped')
          : t('memoryPanel.dockerMissing') }
    : !status?.available
    ? { dot: 'var(--cth-coral)', label: t('memoryPanel.notSetUp') }
    : !status.enabled
      ? { dot: 'var(--cth-ink-500)', label: t('common.off') }
      : status.initialized
        ? { dot: 'var(--cth-mint)', label: t('memoryPanel.onReady') }
        : { dot: 'var(--cth-lemon)', label: t('memoryPanel.onGettingReady') };

  const canSearch = !!status?.available && !!status?.enabled;

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
              {/* Shown whether or not a CLI is resolved yet. It used to require
                  `available`, which deadlocked the one path that matters now:
                  switch memory off before the container image is built and
                  `available` stays false forever, so the button that would turn
                  it back on never renders. Turning it ON is what starts the
                  build. */}
              {!status?.preparing && (
                <PixelButton
                  variant={status?.enabled ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={toggleEnabled}
                >
                  {status?.enabled ? t('memoryPanel.turnOff') : t('memoryPanel.turnOn')}
                </PixelButton>
              )}
            </div>

            {/* Not installed: show full self-sufficient setup so any machine can follow it. */}
            {!status?.available && !status?.preparing && (
              <div style={{
                fontSize: 13, color: 'var(--cth-ink-700)', lineHeight: 1.6,
                background: 'var(--cth-cream-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)', padding: 16
              }}>
                {t('memoryPanel.needsDocker')}
                {/* The commands used to be inlined here, hardcoded for macOS
                    (`curl … | sh`, `source ~/.zshrc`) — dead text under cmd.exe or
                    PowerShell, on the platform most likely to be missing the tool.
                    Setup owns the platform-correct commands now, plus the uv
                    dependency, the live detected state, and the delegate-to-Michael
                    path. One source of truth beats two that disagree by OS. */}

                <div style={{ marginTop: 8, color: 'var(--cth-ink-500)' }}>
                  {t('memoryPanel.plainNotesStill')}
                </div>
              </div>
            )}

            {/* Model: a benefit-framed choice, not a codename dump. */}
            {status?.available && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--cth-ink-500)', fontFamily: 'var(--cth-font-ui)', fontWeight: 600, letterSpacing: 0.5 }}>
                  {t('memoryPanel.searchLanguage')}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {MODELS.map((m) => {
                    const sel = status.model === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setModel(m.id)}
                        style={{
                          flex: 1, textAlign: 'left', cursor: 'pointer', border: 'none',
                          padding: '7px 12px 10px',
                          background: sel ? 'var(--cth-lemon-light)' : 'var(--cth-cream-100)',
                          boxShadow: sel ? 'inset 0 0 0 1.5px var(--cth-ink-500)' : 'inset 0 0 0 1px var(--cth-ink-300)',
                          fontFamily: 'var(--cth-font-ui)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--cth-ink-900)' }}>
                          <span style={{
                            width: 8, height: 8, flexShrink: 0,
                            background: sel ? 'var(--cth-ink-900)' : 'transparent',
                            boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)'
                          }} />
                          {t(m.titleKey)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', marginTop: 3 }}>{t(m.detailKey)}</div>
                      </button>
                    );
                  })}
                </div>
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
