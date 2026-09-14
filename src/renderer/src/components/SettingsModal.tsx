import { useState, useEffect, type CSSProperties } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { useTranslation } from 'react-i18next';
import { COMPACT_MAINTENANCE_MISSION, agentModels, type HarnessConfig } from '@/store/config';
import { useStore } from '@/store/store';
import {
  CLONE_NODE_BLURB,
  DEFAULT_TRIGGER_MODE,
  DEFAULT_WEBHOOK_SCHEMA,
  TRIGGER_MODES,
  type OrgTriggerConfig,
  type TriggerMode,
  type WebhookTrigger
} from '@shared/triggers';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { Dropdown } from './Dropdown';
import { Switch } from './Switch';
import { providerPreset } from '@/store/config';
import { groupCard, rowRule } from '@/design/surfaces';
import { SetupPanel } from './SetupPanel';
import { Icon } from './Icon';
import { McpDefaultsSettings } from './McpDefaultsSettings';
import { REALTIME_MODEL } from '@shared/realtimePricing';
import { RealtimeDevicePicker } from '@/realtime/DevicePicker';
import { isComposingKey } from '@shared/imeGuard';
import { LANGUAGES, setLanguage } from '@/i18n';

export interface SettingsModalProps {
  config: HarnessConfig;
  onClose: () => void;
  /** Open straight to a section instead of General. Used by deep links from
   *  elsewhere in the UI — "set it now" beside a disabled Talk button lands on
   *  the tab that actually holds the field, rather than making the user hunt. */
  initialSection?: Section;
}

/**
 * The triggers IPC surface. `src/preload/index.ts` is owned by another lane and
 * these methods are landing there in parallel, so `CthApi` doesn't declare them
 * yet — read them off a narrow local view instead of widening the preload
 * contract from the renderer. Every call site wraps them in try/catch, which also
 * covers the window in which a method is still missing at runtime.
 */
interface TriggersApi {
  listWebhooks: () => Promise<WebhookTrigger[]>;
  saveWebhooks: (list: WebhookTrigger[]) => Promise<{ ok: boolean; error?: string }>;
  deleteWebhook: (id: string) => Promise<{ ok: boolean; error?: string }>;
  generateWebhookSecret: () => Promise<{ ok: boolean; secret?: string }>;
  webhooksStatus: () => Promise<{ running: boolean; url?: string }>;
  getOrgTrigger: () => Promise<OrgTriggerConfig>;
  setOrgTrigger: (cfg: OrgTriggerConfig) => Promise<{ ok: boolean; error?: string }>;
}
const triggersApi = (): TriggersApi => window.cth as unknown as TriggersApi;

/** Process-unique id for a new webhook — it is the path segment callers POST to,
 *  so it must be stable and collision-free across renames. */
function newWebhookId(): string {
  return `wh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Pixel-aesthetic text input, mirroring AddAgentModal's inputStyle. */
const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--cth-paper-100)',
  border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
  borderRadius: 'var(--cth-radius-btn)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 13.5,
  lineHeight: '20px',
  color: 'var(--cth-ink-900)',
  outline: 'none',
  boxSizing: 'border-box'
};

const fieldLabelStyle: CSSProperties = {
  fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
  fontSize: 12,
  lineHeight: '14px',
  color: 'var(--cth-ink-600)',
};

/** Clear every renderer-side persisted key so a relaunch starts truly empty. */
function clearLocalState(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('cth.')) keys.push(k);
    }
    for (const k of keys) window.localStorage.removeItem(k);
  } catch { /* noop */ }
}

// v0.3.4 redesign: six tabs, one topic each. 'AI Engines' folded into
// Agents & Models; Connections is the MCP server list;
// voice gets its own tab; Danger Zone became a red row at the bottom of General.
/* The small-caps section heading, defined once. It was written out inline
   seventeen times, in three slightly different forms, which is how a tab ends
   up looking subtly unlike its neighbours. */
const sectionHead = {
  fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 13, lineHeight: '16px',
  color: 'var(--cth-ink-900)', marginBottom: 12
} as const;
/** Same heading, tight under a section that supplies its own spacing. */
const sectionHeadTight = { ...sectionHead, marginBottom: 2 } as const;
/** Same heading with no bottom margin at all. */
const sectionHeadFlush = { ...sectionHead, marginBottom: 0 } as const;
/** The 2px rule between Settings sections. */
const sectionRule = { height: 1, background: 'var(--cth-ink-100)' } as const;
export type Section = 'General' | 'Agents & Models' | 'Connections' | 'Voice';
// No Autonomy & Budgets tab: autonomy and who-may-hire moved next to the
// model and the keys, and the circuit breaker is gone — it only ticked inside
// the heartbeat, which ships disabled, so it governed nothing.
// No Memory & Knowledge tab: semantic memory is MemPalace, which cannot run
// on this machine, and the knowledge graph has no corpus to hold.
const NAV_SECTIONS: Section[] = ['General', 'Agents & Models', 'Connections', 'Voice'];
/** i18n key for each nav section's label — the Section values themselves stay
 *  as stable identifiers (tab state, deep links). */
const NAV_SECTION_KEYS: Record<Section, string> = {
  'General': 'settings.nav.general',
  'Agents & Models': 'settings.nav.agentsModels',
  'Connections': 'settings.nav.connections',
  'Voice': 'settings.nav.voice'
};

export function SettingsModal({ config, onClose, initialSection }: SettingsModalProps) {
  const { t, i18n } = useTranslation();
  const godName = useStore((s) => s.agents.find((a) => a.isGod)?.name) ?? 'the orchestrator';
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Why a reset did not happen. Empty until one fails. */
  const [resetErr, setResetErr] = useState('');
  const [activeSection, setActiveSection] = useState<Section>(initialSection ?? 'General');

  // Change-home flow: null until the user picks a new folder, then the sub-modal
  // confirms move-vs-fresh. Pre-selects 'move' (recommended - keeps the data).
  const [changeHome, setChangeHome] = useState<string | null>(null);
  const [changeMode, setChangeMode] = useState<'move' | 'fresh'>('move');
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeErr, setChangeErr] = useState('');

  // `notifications` is an optional field on the main-process config; the renderer
  // mirror type may not declare it yet, so read it defensively.
  const [notifications, setNotifications] = useState<boolean>(
    (config as HarnessConfig & { notifications?: boolean }).notifications === true
  );

  const toggleNotifications = async () => {
    const next = !notifications;
    setNotifications(next); // optimistic
    try { await window.cth.setNotifications(next); }
    catch { setNotifications(!next); /* revert on failure */ }
  };

  // ─── v0.3.4 redesign: settings that were onboarding-trapped or UI-less ────
  const cfgX = config as HarnessConfig & {
    strongKeepalive?: boolean; audience?: string; autoMode?: boolean;
    defaultModel?: string; maxTurns?: number; semanticMemory?: boolean;
  };
  /**
   * ONE SAVE BUTTON.
   *
   * Settings used to persist three different ways: toggles wrote to disk the
   * instant you clicked them, some sections had their own Save, and a couple of
   * fields saved on blur. Nothing told you which kind you were looking at, so
   * "did that stick?" had no answer you could learn once and reuse.
   *
   * Now every setting that goes through `updateConfig` is STAGED here and
   * written by the footer Save, in a single call.
   *
   * Two things stay immediate, on purpose, and they are not settings:
   *   - API keys, which go to the write-only secret broker. Nothing can read
   *     one back to diff it, so there is no staged value to hold.
   *   - Free Flow, which arms a global hotkey in main. Staging that would leave
   *     the hotkey and the checkbox disagreeing until you pressed Save.
   * The MCP servers keep their own controls too: those connect and
   * disconnect live rather than storing a preference.
   */
  const [pending, setPending] = useState<Partial<HarnessConfig>>({});
  /** Auto-compact lives inside the missions array, so it is resolved at save
   *  time against the config on disk rather than staged as a whole array. */
  const [autoCompactPending, setAutoCompactPending] = useState<boolean | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  /** True once a control that USED to persist on click has been changed. Only
   *  those need the close guard: the text fields always needed a Save. */
  const dirty = Object.keys(pending).length > 0 || autoCompactPending !== null;
  const stage = (patch: Partial<HarnessConfig>): void =>
    setPending((prev) => ({ ...prev, ...patch }));

  const [keepAwake, setKeepAwake] = useState<boolean>(cfgX.strongKeepalive === true);
  const toggleKeepAwake = async () => {
    const next = !keepAwake;
    setKeepAwake(next);
    stage({ strongKeepalive: next } as Partial<HarnessConfig>);
  };
  const [simpleMode, setSimpleMode] = useState<boolean>(cfgX.audience === 'non-technical');
  const toggleSimpleMode = async () => {
    const next = !simpleMode;
    setSimpleMode(next);
    stage({ audience: next ? 'non-technical' : 'technical' } as Partial<HarnessConfig>);
  };
  const [autoModeOn, setAutoModeOn] = useState<boolean>(cfgX.autoMode !== false);
  const toggleAutoMode = async () => {
    const next = !autoModeOn;
    setAutoModeOn(next);
    stage({ autoMode: next } as Partial<HarnessConfig>);
  };
  // Default OFF, so an absent value must read as off. Note this is `=== true`,
  // the mirror image of autoMode's `!== false` above, because the two defaults
  // are opposite.
  const [orchSpawnOn, setOrchSpawnOn] = useState<boolean>(cfgX.orchestratorMaySpawn === true);
  const toggleOrchSpawn = async () => {
    const next = !orchSpawnOn;
    setOrchSpawnOn(next);
    stage({ orchestratorMaySpawn: next } as Partial<HarnessConfig>);
  };
  // The fallback has to be the one a spawn ACTUALLY uses when nothing is
  // configured, which is the provider preset's recommendation. It said
  // 'claude-fable-5' while every new agent started on Opus 4.8 · 1M, so this
  // picker showed a model the app was not using.
  const [defaultModelSel, setDefaultModelSel] = useState<string>(
    cfgX.defaultModel ?? providerPreset('claude').recommendedWorkerModel ?? ''
  );
  const saveDefaultModel = (id: string): void => {
    setDefaultModelSel(id);
    stage({ defaultModel: id } as Partial<HarnessConfig>);
  };
  const [maxTurnsVal, setMaxTurnsVal] = useState<string>(cfgX.maxTurns != null ? String(cfgX.maxTurns) : '');
  const maxTurnsPatch = (): Partial<HarnessConfig> => {
    const n = maxTurnsVal.trim() === '' ? undefined : Number(maxTurnsVal);
    return { maxTurns: Number.isFinite(n as number) && (n as number) > 0 ? Math.round(n as number) : undefined } as Partial<HarnessConfig>;
  };
  // --- circuit-breaker config (Lane A #6 canonical fields, widened view) ---
  // Drives Jim's real breaker: floor-wide TOKEN budget (costCapTokens) + output-
  // token velocity ceiling (circuitBreaker.tokenVelocityPerMin). The token cap
  // replaced the old dollar cap as the user-facing budget.
  type BreakerCfgView = HarnessConfig & {
    costCapTokens?: number;
    circuitBreaker?: { tokenVelocityPerMin?: number; enabled?: boolean; hardStop?: boolean; repeatedToolLimit?: number; errorStormLimit?: number };
  };
  const breakerCfg = config as BreakerCfgView;
  const [agentBudget, setAgentBudget] = useState(breakerCfg.costCapTokens != null ? String(breakerCfg.costCapTokens) : '');
  const [velocityCeiling, setVelocityCeiling] = useState(breakerCfg.circuitBreaker?.tokenVelocityPerMin != null ? String(breakerCfg.circuitBreaker.tokenVelocityPerMin) : '');
  // v0.3.4: the four previously UI-less breaker fields get controls.
  const [brkEnabled, setBrkEnabled] = useState<boolean>(breakerCfg.circuitBreaker?.enabled !== false);
  const [brkHardStop, setBrkHardStop] = useState<boolean>(breakerCfg.circuitBreaker?.hardStop === true);
  const [brkRepeated, setBrkRepeated] = useState(breakerCfg.circuitBreaker?.repeatedToolLimit != null ? String(breakerCfg.circuitBreaker.repeatedToolLimit) : '');
  const [brkErrStorm, setBrkErrStorm] = useState(breakerCfg.circuitBreaker?.errorStormLimit != null ? String(breakerCfg.circuitBreaker.errorStormLimit) : '');
  const budgetPatch = (): Partial<HarnessConfig> => {
    const tokens = agentBudget.trim() === '' ? undefined : Number(agentBudget);
    const vel = velocityCeiling.trim() === '' ? undefined : Number(velocityCeiling);
    const rep = brkRepeated.trim() === '' ? undefined : Number(brkRepeated);
    const storm = brkErrStorm.trim() === '' ? undefined : Number(brkErrStorm);
    return {
      costCapTokens: Number.isFinite(tokens as number) ? (tokens as number) : undefined,
      circuitBreaker: {
        ...(breakerCfg.circuitBreaker ?? {}),
        enabled: brkEnabled,
        hardStop: brkHardStop,
        tokenVelocityPerMin: Number.isFinite(vel as number) ? (vel as number) : undefined,
        repeatedToolLimit: Number.isFinite(rep as number) ? Math.round(rep as number) : undefined,
        errorStormLimit: Number.isFinite(storm as number) ? Math.round(storm as number) : undefined
      }
    } as Partial<HarnessConfig>;
  };
  /** The one writer. Commits what the form currently shows, in a single
   *  updateConfig, so a half-applied save is not a state the app can reach. */
  const saveAll = async (): Promise<void> => {
    setSaveBusy(true); setSaveNote('');
    try {
      const patch: Partial<HarnessConfig> = {
        ...maxTurnsPatch(),
        ...budgetPatch(),
        ...pending
      };
      if (autoCompactPending !== null) {
        // Read-modify-write against disk, not against a stale copy: another
        // window (or main) may have edited a different mission meanwhile.
        const cfg = await window.cth.getConfig();
        const missions = cfg.missions ?? [];
        // The mission is not in main's DEFAULTS.missions, so on most configs
        // there is nothing here to flip: mapping alone turned the switch on and
        // scheduled nothing. Create it when it is missing.
        patch.missions = missions.some((m) => m.id === COMPACT_MAINTENANCE_MISSION.id)
          ? missions.map((m) => (
              m.id === COMPACT_MAINTENANCE_MISSION.id ? { ...m, enabled: autoCompactPending } : m
            ))
          : [...missions, { ...COMPACT_MAINTENANCE_MISSION, enabled: autoCompactPending }];
      }
      await window.cth.updateConfig(patch);
      setPending({});
      setAutoCompactPending(null);
      setSaveNote(t('settings.saved'));
      setTimeout(() => setSaveNote(''), 1800);
    } catch (e) {
      setSaveNote(e instanceof Error ? e.message : String(e));
    } finally { setSaveBusy(false); }
  };

  /** Closing with staged changes used to be impossible, because everything wrote
   *  on click. Now it is, so say so rather than dropping the edit silently. */
  const requestClose = (): void => {
    if (dirty) { setUnsavedOpen(true); return; }
    onClose();
  };

  const fmtBudgetTokens = (raw: string): string => {
    const n = Number(raw);
    if (!raw.trim() || !Number.isFinite(n) || n <= 0) return '';
    if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${+(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
    return String(n);
  };

  const [autoCompactOn, setAutoCompactOn] = useState<boolean>(
    (config.missions ?? []).some((m) => m.id === 'compact-maintenance' && m.enabled)
  );
  const toggleAutoCompact = async () => {
    const next = !autoCompactOn;
    setAutoCompactOn(next);
    setAutoCompactPending(next);
  };

  // --- Free Flow (voice dictation → message queue) ---
  // Talk (Realtime Michael) is gated on the OpenAI key — read the live presence
  // boolean so the Realtime Michael section can show its enabled/disabled status.
  const hasOpenAiKey = useStore((s) => s.hasOpenAiKey);
  // Voice-tab entry for the SAME broker slot Agents & Models writes (apikey:openai).
  // Mirroring presence into the store on save is what makes the Talk button light up
  // immediately instead of on next launch.
  const setHasOpenAiKey = useStore((s) => s.setHasOpenAiKey);
  const [openAiVoiceKey, setOpenAiVoiceKey] = useState('');
  const [openAiVoiceNote, setOpenAiVoiceNote] = useState('');
  const saveOpenAiVoiceKey = async (): Promise<void> => {
    const key = openAiVoiceKey.trim();
    if (!key) return;
    try {
      const r = await window.cth.providerKeySet({ backend: 'openai', key });
      if (r.ok) {
        setOpenAiVoiceKey('');
        setHasOpenAiKey(true);
        setOpenAiVoiceNote(t('settings.voice.keySavedNote'));
      } else setOpenAiVoiceNote(r.error ?? t('settings.voice.couldNotSave'));
    } catch (e) {
      setOpenAiVoiceNote(e instanceof Error ? e.message : String(e));
    }
  };
  // v0.3.4 fix: the config default is ON ('now on by default', 0.2.7) — seeding
  // with `?? false` displayed OFF while the feature was actually running.
  // rt-9 idle-tunable: realtime voice idle auto-disconnect window (ms); 0 = never.
  const [idleDisconnectMs, setIdleDisconnectMs] = useState<number>(
    (config as HarnessConfig).realtimeIdleDisconnectMs ?? 60_000
  );

  // Re-seed every editable field from the on-disk config when the modal opens.
  // App's `config` prop is loaded once and never refreshed after a save, so
  // without this the saved budget and velocity show blank on reopen.
  useEffect(() => {
    let alive = true;
    window.cth.getConfig().then((c) => {
      if (!alive) return;
      const cc = c as BreakerCfgView;
      setNotifications(cc.notifications === true);
      setAgentBudget(cc.costCapTokens != null ? String(cc.costCapTokens) : '');
      setVelocityCeiling(cc.circuitBreaker?.tokenVelocityPerMin != null ? String(cc.circuitBreaker.tokenVelocityPerMin) : '');
      setIdleDisconnectMs((c as HarnessConfig).realtimeIdleDisconnectMs ?? 60_000);
    }).catch(() => { /* keep prop-seeded values */ });
    // Triggers: re-read main and push the result into the shared mirror. App
    // already seeded it at launch; this catches anything the Triggers tab (or
    // another window) changed since, and is the ONLY place Settings reads them —
    // every render below comes off the store.
    void (async () => {
      try {
        const list = await triggersApi().listWebhooks();
        if (alive && Array.isArray(list)) useStore.getState().setWebhookTriggers(list);
      } catch { /* keep the mirror App seeded from getConfig() */ }
      try {
        const org = await triggersApi().getOrgTrigger();
        if (alive && org) useStore.getState().setOrgTrigger(org);
      } catch { /* ditto */ }
    })();
    return () => { alive = false; };
  }, []);

  /** Wipe everything and relaunch into setup. */
  const reset = async () => {
    setBusy(true);
    setResetErr('');
    clearLocalState();
    try {
      // Wipes hive + palace, resets config, and relaunches into onboarding.
      // On success the process exits and this never resolves — so anything we
      // get back here, value or throw, means the reset did NOT happen.
      await window.cth.resetAll();
      setResetErr(t('settings.resetConfirm.didNotRun'));
    } catch (e) {
      setResetErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  // --- Change home folder ---
  /** Pick a new folder, then open the move-vs-fresh sub-modal. */
  const pickNewHome = async () => {
    setChangeErr('');
    const res = await window.cth.chooseFolder();
    if (!res.ok) return; // cancelled - no-op
    setChangeMode('move'); // recommended default
    setChangeHome(res.path);
  };

  /** Apply the home-folder change. On success the app relaunches (never resolves);
   *  on failure we surface the error and the existing home keeps running. */
  const applyChangeHome = async () => {
    if (!changeHome) return;
    setChangeBusy(true); setChangeErr('');
    // Moving copies the hive (incl. its .git) + palace, so the new home owns the
    // same renderer-side roster - keep localStorage. A 'fresh' home starts empty,
    // so clear the renderer cache to match.
    if (changeMode === 'fresh') clearLocalState();
    try {
      const res = await window.cth.changeHome(changeHome, changeMode);
      if (!res.ok) { setChangeErr(res.error ?? 'Could not change the home folder.'); setChangeBusy(false); }
      // ok === true never returns (the process relaunches).
    } catch (e) {
      setChangeErr(e instanceof Error ? e.message : String(e));
      setChangeBusy(false);
    }
  };

  const modalTitle = changeHome
    ? t('settings.changeHomeTitle')
    : confirming
      ? t('settings.resetTitle')
      : t('settings.title');

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(17, 20, 26, 0.5)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 300
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          // FIXED, not max: the panel used to take its height from whichever
          // tab was open, so switching from General to Voice made the whole
          // dialog jump and the nav on the left shuffle under the cursor. One
          // size for every tab; the content pane scrolls inside it.
          width: confirming ? 560 : 840, maxWidth: '92vw',
          height: confirming ? 'auto' : 'min(80vh, 760px)',
          display: 'flex', flexDirection: 'column',
          filter: 'drop-shadow(0 18px 40px rgba(17, 20, 24, 0.28))'
        }}
      >
        <PixelPanel
          variant="dialog"
          title={modalTitle}
          onClose={requestClose}
          closeLabel={t('settings.close')}
          noPadding
          style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}
        >
          {/* === Change home sub-modal === */}
          {changeHome ? (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--cth-ink-500)' }}>{t('settings.changeHome.newHome')}</span>
                <code style={{
                  fontFamily: 'var(--cth-font-mono, monospace)', fontSize: 13,
                  color: 'var(--cth-ink-900)', wordBreak: 'break-all'
                }}>{changeHome}</code>
              </div>

              {/* Move vs. fresh - two selectable option rows; move is preselected. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([
                  ['move', t('settings.changeHome.moveTitle'), t('settings.changeHome.moveDesc')],
                  ['fresh', t('settings.changeHome.freshTitle'), t('settings.changeHome.freshDesc')]
                ] as const).map(([value, title, desc]) => {
                  const selected = changeMode === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setChangeMode(value)}
                      disabled={changeBusy}
                      style={{
                        textAlign: 'left', cursor: changeBusy ? 'default' : 'pointer',
                        padding: '16px 12px', border: 'none',
                        borderRadius: 'var(--cth-radius-btn)',
                        // Selected reads as the brand here like it does on a
                        // tab, a branch chip and a primary button. ink-900 is
                        // the TEXT token: near-black in light, near-white in
                        // dark, so the chosen option inverted between themes.
                        background: selected ? 'var(--cth-lilac-light)' : 'var(--cth-paper-100)',
                        boxShadow: `inset 0 0 0 ${selected ? 1.5 : 1}px ${selected ? 'var(--cth-lilac)' : 'var(--cth-ink-300)'}`,
                        display: 'flex', flexDirection: 'column', gap: 4
                      }}
                    >
                      <span style={{
                        fontSize: 13, lineHeight: '20px',
                        color: 'var(--cth-ink-900)', fontWeight: selected ? 700 : 400
                      }}>
                        {selected ? '◉ ' : '○ '}{title}
                      </span>
                      <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>{desc}</span>
                    </button>
                  );
                })}
              </div>

              {changeErr && (
                <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--cth-coral-text)' }}>{changeErr}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <PixelButton variant="secondary" size="md" onClick={() => { setChangeHome(null); setChangeErr(''); }} disabled={changeBusy}>
                  {t('common.cancel')}
                </PixelButton>
                <PixelButton variant="primary" size="md" onClick={applyChangeHome} disabled={changeBusy}>
                  {changeBusy ? t('settings.apply') : (changeMode === 'move' ? t('settings.moveAndRestart') : t('settings.switchAndRestart'))}
                </PixelButton>
              </div>
            </div>

          /* === Reset confirmation screen === */
          ) : confirming ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '20px 20px 22px' }}>
                {/* A warning triangle in the colour of the thing it warns about.
                    It was a bell in a square: the wrong shape and the wrong
                    idea - a bell is a notification, this is a demolition. */}
                <span style={{
                  width: 36, height: 36, flexShrink: 0, borderRadius: '50%',
                  background: 'var(--cth-coral-light)', color: 'var(--cth-coral-text)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M10 2.9 18.1 17H1.9L10 2.9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d="M10 8v3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <circle cx="10" cy="14.3" r="1" fill="currentColor" />
                  </svg>
                </span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{
                    fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 14,
                    lineHeight: '20px', color: 'var(--cth-ink-900)'
                  }}>{t('settings.resetConfirm.lead', { defaultValue: 'This cannot be undone.' })}</span>
                  <span style={{ fontSize: 13, lineHeight: '20px', color: 'var(--cth-ink-600)' }}>
                    {t('settings.resetConfirm.body', { godName })}
                  </span>
                </div>
              </div>

              {resetErr && (
                <div style={{
                  margin: '0 20px 16px', padding: '10px 12px',
                  borderRadius: 'var(--cth-radius-card)',
                  background: 'var(--cth-coral-light)',
                  boxShadow: 'inset 0 0 0 1px var(--cth-coral)',
                  fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-900)'
                }}>{resetErr}</div>
              )}

              {/* Its own floor, like every other dialog in the app. */}
              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: 10,
                padding: '14px 20px', borderTop: '1px solid var(--cth-ink-100)'
              }}>
                <PixelButton variant="secondary" size="md" onClick={() => setConfirming(false)} disabled={busy}>
                  {t('common.cancel')}
                </PixelButton>
                <PixelButton variant="destructive" size="md" onClick={reset} disabled={busy}>
                  {busy ? t('settings.resetting') : t('settings.eraseEverything')}
                </PixelButton>
              </div>
            </div>

          /* === Main two-pane settings layout === */
          ) : (
            <>
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

                {/* Left nav */}
                <div style={{
                  width: 188, flexShrink: 0,
                  display: 'flex', flexDirection: 'column', gap: 4,
                  borderRight: '1px solid var(--cth-ink-100)',
                  padding: 12,
                  background: 'var(--cth-cream-100)'
                }}>
                  {NAV_SECTIONS.map((section) => {
                    const active = activeSection === section;
                    return (
                      <button
                        key={section}
                        type="button"
                        onClick={() => setActiveSection(section)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '9px 12px', border: 'none',
                          borderRadius: 'var(--cth-radius-btn)',
                          background: active ? 'var(--cth-lilac-light)' : 'transparent',
                          boxShadow: active ? 'inset 0 0 0 1.5px var(--cth-lilac)' : 'none',
                          color: active ? 'var(--cth-lilac-text)' : 'var(--cth-ink-700)',
                          fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
                          fontSize: 13, lineHeight: '18px',
                          cursor: 'pointer',
                          transition: 'background 120ms ease, color 120ms ease'
                        }}
                      >
                        {t(NAV_SECTION_KEYS[section])}
                      </button>
                    );
                  })}
                </div>

                {/* Right scrollable content pane. minWidth:0 lets this flex child
                    shrink to the row's width instead of growing to its content's
                    min-content (which would push a horizontal scrollbar). */}
                <div style={{
                  flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden',
                  padding: '20px 24px',
                  display: 'flex', flexDirection: 'column', gap: 20
                }}>

                  {/* GENERAL */}
                  {activeSection === 'General' && (
                    <>
                      {/* The hero card is gone: it advertised the upstream
                          project's paid plan, its Discord and its founders'
                          wall, none of which belong in this fork. General now
                          opens on the question people actually came to answer. */}
                      {/* No Updates block: the updater reads the upstream
                          project's releases, which are not this fork's. */}
                      {/* Home folder */}
                      <div style={groupCard}>
                        <div style={sectionHead}>
                          {t('settings.general.homeFolder')}
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 13, lineHeight: '20px', alignItems: 'center' }}>
                          <span style={{
                            flex: 1, color: 'var(--cth-ink-900)', wordBreak: 'break-all',
                            fontFamily: 'var(--cth-font-mono, monospace)'
                          }}>{config.harnessHome ?? '—'}</span>
                          <PixelButton variant="secondary" size="sm" onClick={pickNewHome}>{t('settings.change')}</PixelButton>
                        </div>
                      </div>


                      {/* Environment — settings that used to be trapped in onboarding */}
                      <div style={groupCard}>
                        <div style={sectionHead}>
                          {t('settings.general.environment')}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 13.5, lineHeight: '20px', color: 'var(--cth-ink-900)', fontWeight: 600 }}>{t('settings.general.keepAwake')}</span>
                              <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                                {t('settings.general.keepAwakeDesc')}
                              </span>
                            </div>
                            <Switch on={keepAwake} label={t('settings.general.keepAwake')} onChange={toggleKeepAwake} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 13.5, lineHeight: '20px', color: 'var(--cth-ink-900)', fontWeight: 600 }}>{t('settings.general.simpleMode')}</span>
                              <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                                {t('settings.general.simpleModeDesc')}
                              </span>
                            </div>
                            <Switch on={simpleMode} label={t('settings.general.simpleMode')} onChange={toggleSimpleMode} />
                          </div>
                        </div>
                      </div>


                      {/* Language — app UI language (i18n) */}
                      <div style={groupCard}>
                        <div style={sectionHead}>
                          {t('settings.general.language')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                              {t('settings.general.languageDesc')}
                            </span>
                          </div>
                          <Dropdown
                            value={i18n.language}
                            options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                            onChange={setLanguage}
                            ariaLabel={t('settings.general.language')}
                            width={200}
                          />
                        </div>
                      </div>


                      {/* Desktop notifications toggle */}
                      <div style={groupCard}>
                        <div style={sectionHead}>
                          {t('settings.general.notifications')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 13.5, lineHeight: '20px', color: 'var(--cth-ink-900)', fontWeight: 600 }}>
                              {t('settings.general.desktopNotifications')}
                            </span>
                            <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                              {t('settings.general.desktopNotificationsDesc')}
                            </span>
                          </div>
                          <Switch on={notifications} label={t('settings.general.desktopNotifications')} onChange={toggleNotifications} />
                        </div>
                      </div>


                      {/* Scheduled auto-compact (compact-maintenance mission) */}
                      <div style={groupCard}>
                        <div style={sectionHead}>
                          {t('settings.general.maintenance')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 13.5, lineHeight: '20px', color: 'var(--cth-ink-900)', fontWeight: 600 }}>
                              {t('settings.general.autoCompact')}
                            </span>
                            <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                              {t('settings.general.autoCompactDesc')}
                            </span>
                          </div>
                          <Switch on={autoCompactOn} label={t('settings.general.autoCompact')} onChange={toggleAutoCompact} />
                        </div>
                        {/* No auto-update row: releases come from the
                            upstream project, not this fork. No telemetry row
                            either — this build ships without an analytics key,
                            so the switch governed nothing. */}
                      </div>

                      {/* No office-theme picker: four of its six themes were
                          never built, and the floor is being redesigned. */}
                    </>
                  )}

                  {/* AGENTS & MODELS — what powers the office */}
                  {/* PREREQUISITES — the external tools the app leans on and
                      whether this machine has them. It was a Command Center tab,
                      which was the wrong home: it is machine-wide state, not
                      something about the agent whose terminal you are reading. */}

                  {activeSection === 'Agents & Models' && (
                    <>
                      {/* The engine and prerequisite checks used to be their own
                          Prerequisites tab. They belong beside the model settings:
                          "which engine runs my agents" and "is that engine even
                          installed" are the same question. The memory half of that
                          panel moved to the Memory tab, where the switch is. */}
                      <SetupPanel only={['prerequisite', 'engine']} onDone={onClose} />
                      <div style={groupCard}>
                        <div style={sectionHead}>
                          {t('settings.agentsModels.defaultModel')}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                            {t('settings.agentsModels.defaultModelDesc', { godName })}
                          </span>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {agentModels().map((m) => (
                              <button
                                key={m.label}
                                onClick={() => { if (m.id) void saveDefaultModel(m.id); }}
                                style={{
                                  height: 32, padding: '0 14px', border: 'none', cursor: 'pointer',
                                  display: 'inline-flex', alignItems: 'center',
                                  borderRadius: 'var(--cth-radius-btn)',
                                  fontFamily: 'var(--cth-font-ui)', fontSize: 12.5,
                                  fontWeight: defaultModelSel === m.id ? 600 : 500,
                                  color: defaultModelSel === m.id ? 'var(--cth-lilac-text)' : 'var(--cth-ink-700)',
                                  background: defaultModelSel === m.id ? 'var(--cth-lilac-light)' : 'var(--cth-cream-100)',
                                  boxShadow: defaultModelSel === m.id ? 'inset 0 0 0 1.5px var(--cth-lilac)' : 'none',
                                  transition: 'background 120ms ease, color 120ms ease'
                                }}
                              >{m.label}</button>
                            ))}
                          </div>
                        </div>
                      </div>


                      {/* No key block here: the only key this floor needs is the
                          OpenAI one for voice chat, and Voice asks for it. One
                          field, one place. */}


                      {/* Autonomy and who may hire live HERE, next to the model
                          and the keys: all four are decisions about how an agent
                          runs, and they were a tab away from each other. */}
                      <div style={groupCard}>
                        <div style={sectionHead}>
                          {t('settings.autonomy.autonomy')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 13.5, lineHeight: '20px', color: 'var(--cth-ink-900)', fontWeight: 600 }}>
                              {autoModeOn ? t('settings.autonomy.autoOn') : t('settings.autonomy.autoOff')}
                            </span>
                            <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                              {t('settings.autonomy.autoDesc')}
                            </span>
                          </div>
                          <Switch on={autoModeOn} label={t('settings.autonomy.autoOn')} onChange={toggleAutoMode} />
                        </div>

                        <div style={rowRule} />

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 13.5, lineHeight: '20px', color: 'var(--cth-ink-900)', fontWeight: 600 }}>
                              {t('settings.autonomy.whoHires')}
                            </span>
                            <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                              {t(orchSpawnOn ? 'settings.autonomy.whoHiresOn' : 'settings.autonomy.whoHiresOff', { godName })}
                            </span>
                          </div>
                          <Switch on={orchSpawnOn} label={t('settings.autonomy.orchSpawn')} onChange={toggleOrchSpawn} />
                        </div>
                      </div>


                      {/* No Advanced/max-turns box: a cap that stops an agent
                          mid-task is a worse failure than a long run, and the
                          token budget and the breaker already bound spend. */}
                    </>
                  )}

                  {/* CONNECTIONS — the MCP servers every new agent is given */}
                  {activeSection === 'Connections' && (
                    <>
                      <McpDefaultsSettings config={config} />
                    </>
                  )}

                  {/* Connections is the MCP server list and nothing else now.
                      Gone: the integrations registry and its GitHub/REST connectors,
                      the Slack pipe, webhook endpoints, and the organisation key —
                      that last one configured a messaging service that does not
                      exist, and its copy still named the upstream project. */}

                  {/* VOICE — Free Flow dictation + Realtime Michael (v0.3.4: its own tab) */}
                  {activeSection === 'Voice' && (
                    <>
                      {/* No Free Flow: dictation went through Groq Whisper and
                          needed its own key for something macOS Dictation does
                          free and offline, straight into this same box. */}

                      {/* Realtime Michael — voice device selection (rt-8) */}
                      <div style={{ ...groupCard, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={sectionHeadTight}>
                          {t('settings.voice.realtime')}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 13.5, lineHeight: '20px', color: 'var(--cth-ink-900)', fontWeight: 600 }}>
                            {t('settings.voice.voiceChat', { godName })}
                          </span>
                          <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                            {t('settings.voice.voiceChatDesc', { godName })}
                          </span>
                        </div>

                        {/* OpenAI Realtime key — settable HERE, not just described here.
                            This is where someone looking for voice actually lands (the Talk
                            button deep-links to it), so sending them to another tab to type
                            the key was a dead end dressed up as documentation. Same broker
                            slot as Agents & Models (apikey:openai) — one key, two doorways,
                            and saving in either flips the same gate. The value never leaves
                            main; only the presence boolean comes back. */}
                        <div style={{
                          display: 'flex', flexDirection: 'column', gap: 8,
                          padding: 14,
                          background: 'var(--cth-cream-100)',
                          borderRadius: 'var(--cth-radius-card)'
                        }}>
                          <span style={sectionHeadFlush}>
                            {t('settings.voice.openaiKey')}
                          </span>
                          <span style={{ fontSize: 13, lineHeight: '17px', color: 'var(--cth-ink-700)' }}>
                            {t('settings.voice.openaiKeyDesc1', { godName, model: REALTIME_MODEL })}
                          </span>
                          <span style={{ fontSize: 13, lineHeight: '17px', color: 'var(--cth-ink-700)' }}>
                            {t('settings.voice.openaiKeyDesc2')}
                          </span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              className="cth-input"
                              type="password"
                              value={openAiVoiceKey}
                              onChange={(e) => setOpenAiVoiceKey(e.target.value)}
                              onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter') void saveOpenAiVoiceKey(); }}
                              placeholder={hasOpenAiKey ? t('settings.voice.keyPlaceholderSaved') : 'sk-…'}
                              style={{ ...fieldStyle, flex: 1, fontFamily: 'var(--cth-font-mono)' }}
                            />
                            <PixelButton
                              variant="secondary"
                              size="sm"
                              onClick={() => void saveOpenAiVoiceKey()}
                              disabled={!openAiVoiceKey.trim()}
                            >
                              {t('settings.voice.save')}
                            </PixelButton>
                          </div>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            fontSize: 13, lineHeight: '16px',
                            color: hasOpenAiKey ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)'
                          }}>
                            <span aria-hidden style={{
                              width: 8, height: 8, flexShrink: 0,
                              background: hasOpenAiKey ? 'var(--cth-mint)' : 'var(--cth-ink-300)',
                              boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)'
                            }} />
                            {openAiVoiceNote || (hasOpenAiKey
                              ? t('settings.voice.keySaved', { godName })
                              : t('settings.voice.noKey', { godName }))}
                          </span>
                        </div>

                        <RealtimeDevicePicker />
                        {/* No spend-cap readout: it reported a cap nobody set
                            and a session nobody had open. The idle disconnect is
                            the control that actually bounds a voice session. */}
                        {/* rt-9 idle-tunable: how long an idle voice session stays open before
                            it auto-closes. The spend cap remains the real runaway guard. */}
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 280 }}>
                          <span style={fieldLabelStyle}>{t('settings.voice.idleDisconnect')}</span>
                          <Dropdown
                            value={String(idleDisconnectMs)}
                            options={[
                              { value: '30000', label: t('settings.voice.30s') },
                              { value: '60000', label: t('settings.voice.1m') },
                              { value: '120000', label: t('settings.voice.2m') },
                              { value: '180000', label: t('settings.voice.3m') },
                              { value: '300000', label: t('settings.voice.5m') },
                              { value: '600000', label: t('settings.voice.10m') },
                              { value: '0', label: t('settings.voice.never') }
                            ]}
                            onChange={(v) => {
                              const n = Number(v);
                              setIdleDisconnectMs(n);
                              stage({ realtimeIdleDisconnectMs: n } as Partial<HarnessConfig>);
                            }}
                            ariaLabel={t('settings.voice.idleDisconnect')}
                            width={280}
                          />
                          <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                            {t('settings.voice.idleDisconnectDesc')}
                          </span>
                        </label>
                      </div>
                    </>
                  )}

                  {/* Danger — a red row at the bottom of General (was its own tab) */}
                  {activeSection === 'General' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div style={{
                        fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, lineHeight: '14px',
                        color: 'var(--cth-coral-text)'
                      }}>{t('settings.general.dangerZone')}</div>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--cth-ink-700)' }}>
                        {t('settings.general.dangerDesc', { godName })}
                      </p>
                      <div>
                        <PixelButton variant="destructive" size="md" onClick={() => setConfirming(true)}>
                          {t('settings.general.resetStartOver')}
                        </PixelButton>
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Footer */}
              <div style={{
                borderTop: '2px solid var(--cth-ink-300)',
                padding: '16px 16px',
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
                background: 'var(--cth-cream-50)'
              }}>
                {saveNote && (
                  <span style={{ fontSize: 13, color: 'var(--cth-mint-text)' }}>{saveNote}</span>
                )}
                {dirty && !saveNote && (
                  <span style={{ fontSize: 13, color: 'var(--cth-ink-500)' }}>{t('settings.unsavedChanges')}</span>
                )}
                <PixelButton variant="secondary" size="md" onClick={requestClose}>{t('settings.close')}</PixelButton>
                <PixelButton variant="primary" size="md" onClick={() => void saveAll()} disabled={saveBusy}>
                  {saveBusy ? t('settings.saving') : t('common.save')}
                </PixelButton>
              </div>
            </>
          )}
        </PixelPanel>
      </div>
      {unsavedOpen && (
        <ConfirmDialog
          title={t('settings.unsavedTitle')}
          body={t('settings.unsavedBody')}
          confirmLabel={t('settings.unsavedAction')}
          destructive
          onCancel={() => setUnsavedOpen(false)}
          onConfirm={() => { setUnsavedOpen(false); onClose(); }}
        />
      )}
    </div>
  );
}
