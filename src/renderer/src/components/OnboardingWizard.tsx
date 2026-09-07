import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { Icon, type IconName } from './Icon';
import { SpritePortrait } from './SpritePortrait';
import { ProviderLogo } from './ProviderLogo';
import { modelsForProvider, onboardingEngineChoices, type AgentProvider, type HarnessConfig } from '@/store/config';
import { providerPreset } from '@shared/agentProvider';
import {
  classifyEngineAvailability, engineAvailabilityBadge, engineAvailabilityMessage, engineBlocksOnboarding
} from '@shared/engineAvailability';
import type { ToolStatus } from '@shared/toolCatalog';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';

export interface OnboardingWizardProps {
  onComplete: (config: HarnessConfig) => void;
}

type Audience = 'technical' | 'non-technical';
type Step = 'persona' | 'welcome' | 'home' | 'orchestrator' | 'repos' | 'permissions' | 'done';

/** The setup's two nav buttons. The display face and a little tracking so a
 *  one-word label still reads as a control, not as a caption; the primary keeps
 *  a floor width so "Continue" and "Finish setup" do not resize the footer. */
const NAV_LABEL = { fontFamily: 'var(--cth-font-display)', letterSpacing: 0.6 } as const;
const NAV_PRIMARY = { ...NAV_LABEL, minWidth: 148 } as const;

/** Every step the rail shows, in order. 'done' is the finish screen, not a step
 *  you sit on, so it is not in here.
 *
 *  This array is the ONLY place the order lives: next/prev walk it by index and
 *  the footer asks it which step is last. It used to be duplicated in three
 *  hand-written chains and two `step === 'permissions'` checks, so moving a step
 *  meant editing five places and the fifth was always a Finish button on the
 *  wrong screen.
 *
 *  Home sits last on purpose: the folder is the one answer that is easier to
 *  give once you know what is going into it. */
const STEP_ORDER: Step[] = ['persona', 'welcome', 'orchestrator', 'repos', 'permissions', 'home'];
const LAST_STEP: Step = STEP_ORDER[STEP_ORDER.length - 1];

// First-run showcase "— the highest-value features a brand-new user should grasp
// before any setup. Labels and copy live in i18n (two registers: `desc` for the
// technical audience, `descPlain` for the plain-language one "— item 1).
interface Feature {
  icon: IconName;
  labelKey: string;
  descKey: string;       // technical register
  descPlainKey: string;  // non-technical register
  tint: string;          // tile background token
  edge: string;          // tile border token
}
const FEATURES: Feature[] = [
  {
    icon: 'mcp',
    labelKey: 'onboarding.welcome.features.engines.label',
    descKey: 'onboarding.welcome.features.engines.desc',
    descPlainKey: 'onboarding.welcome.features.engines.descPlain',
    tint: 'var(--cth-lilac-light)', edge: 'var(--cth-lilac)'
  },
  {
    icon: 'gear',
    labelKey: 'onboarding.welcome.features.clone.label',
    descKey: 'onboarding.welcome.features.clone.desc',
    descPlainKey: 'onboarding.welcome.features.clone.descPlain',
    tint: 'var(--cth-sky-light)', edge: 'var(--cth-sky)'
  },
  {
    icon: 'web',
    labelKey: 'onboarding.welcome.features.memory.label',
    descKey: 'onboarding.welcome.features.memory.desc',
    descPlainKey: 'onboarding.welcome.features.memory.descPlain',
    tint: 'var(--cth-mint-light)', edge: 'var(--cth-mint)'
  },
  {
    icon: 'terminal',
    labelKey: 'onboarding.welcome.features.commandCenter.label',
    descKey: 'onboarding.welcome.features.commandCenter.desc',
    descPlainKey: 'onboarding.welcome.features.commandCenter.descPlain',
    tint: 'var(--cth-lemon-light)', edge: 'var(--cth-lemon)'
  },
  {
    icon: 'pause',
    labelKey: 'onboarding.welcome.features.guardrails.label',
    descKey: 'onboarding.welcome.features.guardrails.desc',
    descPlainKey: 'onboarding.welcome.features.guardrails.descPlain',
    tint: 'var(--cth-coral-light)', edge: 'var(--cth-coral)'
  },
  {
    icon: 'sparkle',
    labelKey: 'onboarding.welcome.features.hires.label',
    descKey: 'onboarding.welcome.features.hires.desc',
    descPlainKey: 'onboarding.welcome.features.hires.descPlain',
    tint: 'var(--cth-peach-light)', edge: 'var(--cth-peach)'
  }
];

// Who makes each engine, shown under its row on the engine step. The row's own
// label is the product in caps, so the blurb carries the one thing it does not:
// the vendor. "CLAUDE CODE / Claude Code by Anthropic" was saying it twice.
const PROVIDER_BLURB_KEYS: Partial<Record<AgentProvider, string>> = {
  claude: 'onboarding.providerBlurb.claude',
  codex: 'onboarding.providerBlurb.codex',
  grok: 'onboarding.providerBlurb.grok',
  gemini: 'onboarding.providerBlurb.gemini'
};

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t } = useTranslation();
  // Onboarding runs before god exists in the store, so read the persisted name.
  const godName = useResolvedGodName();
  const [step, setStep] = useState<Step>('persona');
  // Self-identified audience (item 1). Undefined until chosen on the first screen;
  // the rest of the wizard reads `plain` to swap copy registers.
  const [audience, setAudience] = useState<Audience | undefined>();
  const plain = audience === 'non-technical';

  const [home, setHome] = useState<string>('');
  const [repos, setRepos] = useState<string[]>([]);
  const [autoMode, setAutoMode] = useState<boolean>(true);
  // Anonymous usage stats (TELEMETRY.md). Default ON (opt-out); persisted by
  // finish() so unchecking before finishing means nothing is ever sent.
  const [shareStats, setShareStats] = useState<boolean>(true);
  const [godProvider, setGodProvider] = useState<AgentProvider>('claude');
  const [godModel, setGodModel] = useState<string | undefined>(
    providerPreset('claude').recommendedOrchestratorModel
  );
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  // Which engine CLIs are actually on this machine. The picker used to record the
  // choice blind; the first check happened when Michael spawned, and for a
  // provider with no installer that meant a first run where nothing ever booted.
  // `undefined` = probe not back yet (or failed): rows show no badge and nothing
  // is blocked, because a broken probe must not lock a new user out.
  const [engines, setEngines] = useState<ToolStatus[] | undefined>();
  const [probing, setProbing] = useState(false);
  const probeEngines = async () => {
    setProbing(true);
    try { setEngines(await window.cth.toolsStatus()); }
    catch { /* leave undefined: unknown, never blocking */ }
    finally { setProbing(false); }
  };
  useEffect(() => { void probeEngines(); }, []);
  const selectedEngine = classifyEngineAvailability(engines, godProvider);
  const engineBlocked = engineBlocksOnboarding(selectedEngine);

  // Permissions & reliability toggles. These apply IMMEDIATELY on change (their
  // own IPC / OS state) "— they are NOT part of finish()'s config write. First-run
  // defaults: notifications off (config default), login-item off (fresh install);
  // each reconciles to the real state the IPC returns.
  const [strongKeepalive, setStrongKeepalive] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [openAtLogin, setOpenAtLogin] = useState(false);

  const toggleStrongKeepalive = async (v: boolean) => {
    setStrongKeepalive(v); // optimistic
    try { setStrongKeepalive((await window.cth.updateConfig({ strongKeepalive: v })).strongKeepalive === true); }
    catch { setStrongKeepalive(!v); }
  };
  const toggleNotifications = async (v: boolean) => {
    setNotifications(v); // optimistic
    try { await window.cth.setNotifications(v); }
    catch { setNotifications(!v); } // revert on failure
  };
  const toggleOpenAtLogin = async (v: boolean) => {
    setOpenAtLogin(v); // optimistic
    try { setOpenAtLogin(await window.cth.setLoginItem(v)); } // reconcile to OS truth
    catch { setOpenAtLogin(!v); }
  };
  const openSettings = (url: string) => { void window.cth.openExternal(url); };

  // Power-settings deep-link differs per OS (macOS/Windows have one, Linux
  // doesn't have a universal settings URI across desktop environments) —
  // drive the copy and the button off the actual platform instead of
  // hardcoding one OS's instructions.
  const platform = window.cth.platform;
  const stayAwakeOs: 'mac' | 'windows' | 'linux' =
    platform === 'darwin' ? 'mac' : platform === 'win32' ? 'windows' : 'linux';
  const stayAwakeUrl =
    stayAwakeOs === 'mac' ? 'x-apple.systempreferences:com.apple.preference.battery' :
    stayAwakeOs === 'windows' ? 'ms-settings:powersleep' :
    null;

  // Default-suggest a sensible harness home on first render.
  //
  // This used to read `window.process.env.HOME`, which is ALWAYS undefined here:
  // the window runs with `contextIsolation: true` / `nodeIntegration: false` and
  // the preload bridges exactly one object (`cth`), so the renderer's main world
  // has no `process`. The suggestion therefore always collapsed to '' and the
  // field rendered empty "— leaving the copy above promising a default the user
  // could not accept, and Finish failing with "Pick a harness home folder first."
  //
  // Suggest the literal `~/atlas-data` instead. That is exactly the string
  // #140's normalizeHiveHome()/expandTilde() were built to absorb: it is expanded
  // at the config-write boundary AND at ensureHarnessHome's mkdir, so every
  // downstream reader still sees one absolute path. No new IPC surface.
  useEffect(() => {
    if (!home) setHome('~/atlas-data');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickHome = async () => {
    setError(undefined);
    const res = await window.cth.chooseFolder();
    if (res.ok) setHome(res.path);
    else if (res.error !== 'cancelled') setError(res.error);
  };

  const pickRepo = async () => {
    setError(undefined);
    const res = await window.cth.chooseFolder();
    if (res.ok && !repos.includes(res.path)) setRepos([...repos, res.path]);
    else if (!res.ok && res.error !== 'cancelled') setError(res.error);
  };

  const removeRepo = (path: string) => setRepos(repos.filter(r => r !== path));

  const finish = async () => {
    setBusy(true);
    setError(undefined);
    const harnessHome = home.trim(); // whitespace-only is not a folder
    if (!harnessHome) { setError(t('onboarding.errPickHome')); setBusy(false); setStep('home'); return; }
    // The orchestrator step already refuses to advance on this, but a late probe
    // result can change the answer after the user has moved on. Never write a
    // godProvider that is known to be unable to boot.
    if (engineBlocked) {
      setError(t('onboarding.errEngineNotInstalled', { label: providerPreset(godProvider).label }));
      setBusy(false); setStep('orchestrator'); return;
    }
    const ensure = await window.cth.ensureHarnessHome(harnessHome);
    if (!ensure.ok) {
      setError(ensure.error ?? t('onboarding.errCreateHome'));
      setBusy(false);
      return;
    }
    const next = await window.cth.updateConfig({
      onboardingComplete: true,
      audience: audience ?? 'technical',
      harnessHome, // the same trimmed value we just mkdir'd, not the raw field
      registeredRepos: repos,
      autoMode,
      godProvider,
      godModel,
      telemetryEnabled: shareStats
    });
    setBusy(false);
    onComplete(next);
  };

  const stepTitle =
    step === 'persona' ? t('onboarding.titles.persona')
    : step === 'welcome' ? t('onboarding.titles.welcome')
    : step === 'home' ? (plain ? t('onboarding.titles.homePlain') : t('onboarding.titles.home'))
    : step === 'orchestrator' ? (plain ? t('onboarding.titles.orchestratorPlain') : t('onboarding.titles.orchestrator'))
    : step === 'repos' ? (plain ? t('onboarding.titles.reposPlain') : t('onboarding.titles.repos'))
    : step === 'permissions' ? t('onboarding.titles.permissions')
    : t('onboarding.titles.done');
  const stepIndex = Math.max(0, STEP_ORDER.indexOf(step));

  return (
    <div className="cth-ground" style={{
      position: 'fixed', inset: 0,
      // Scroll the overlay rather than clip the wizard. Step 2 lists every
      // installed CLI engine (8 rows + a model select), which is taller than a
      // 1080p-class window once the OS chrome is subtracted "— the panel was
      // being cut off at BOTH edges with no way to reach the buttons.
      display: 'flex',
      overflowY: 'auto',
      zIndex: 200,
      padding: 32
    }}>
      {/* `margin: auto` centers, NOT `align-items: center`. A centered flex item
          that overflows its container is clipped at the TOP and unreachable by
          scrolling (the overflow spills past the scroll origin); auto margins
          center while it fits and collapse to a normal scroll once it doesn't. */}
      <div style={{
        width: 880, maxWidth: '94vw', margin: 'auto',
        display: 'flex', flexDirection: 'column', maxHeight: '92vh',
        background: 'var(--cth-cream-50)',
        // A lift off the floor, not a stamped-on slab: a hairline to hold the
        // edge, then two shadows — a tight one for the seam and a wide soft one
        // for the height. The old 6px hard offset read as a sticker.
        boxShadow: `inset 0 0 0 1px var(--cth-ink-300),
                    0 2px 6px rgba(0, 0, 0, 0.22),
                    0 28px 64px -12px rgba(0, 0, 0, 0.55)`
      }}>

        {/* ── Brand bar: who is asking, and how far in you are ─────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          padding: '14px 20px',
          background: 'var(--cth-cream-100)',
          boxShadow: 'inset 0 -1px 0 var(--cth-ink-100)'
        }}>
          <span style={{
            width: 32, height: 32, display: 'grid', placeItems: 'center', flexShrink: 0,
            background: 'var(--cth-lilac)', color: 'var(--cth-on-accent)',
            fontFamily: 'var(--cth-font-display)', fontSize: 13,
            boxShadow: '0 0 0 1px var(--cth-ink-900), 0 0 18px -2px var(--cth-lilac)'
          }}>A</span>
          <span style={{
            fontFamily: 'var(--cth-font-display)', fontSize: 14, letterSpacing: 2,
            color: 'var(--cth-ink-900)'
          }}>{t('onboarding.setup.name')}</span>
          <span style={{ flex: 1 }} />
          <span style={{
            fontFamily: 'var(--cth-font-mono)', fontSize: 11, letterSpacing: 0.5,
            color: 'var(--cth-ink-500)'
          }}>{t('onboarding.setup.counter', { n: stepIndex + 1, total: STEP_ORDER.length })}</span>
        </div>

        <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>

          {/* ── Step rail: the whole shape of the setup, visible at once ───── */}
          <nav style={{
            width: 190, flexShrink: 0, padding: '18px 0',
            background: 'var(--cth-cream-100)',
            boxShadow: 'inset -1px 0 0 var(--cth-ink-100)',
            display: 'flex', flexDirection: 'column',
            position: 'relative'
          }}>
            {STEP_ORDER.map((s, i) => (
              <RailStep
                key={s}
                n={i + 1}
                label={t(`onboarding.setup.rail.${s}`)}
                state={i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'todo'}
              />
            ))}
          </nav>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {/* The step's own name — the rail says where, this says what. */}
            <h2 style={{
              margin: 0, padding: '22px 28px 0',
              fontFamily: 'var(--cth-font-display)', fontSize: 19, lineHeight: '26px', letterSpacing: 0.5,
              color: 'var(--cth-ink-900)'
            }}>{stepTitle}</h2>
            <div style={{
              padding: '16px 28px 24px', display: 'flex', flexDirection: 'column', gap: 18,
              overflowY: 'auto', flex: 1
            }}>

            {step === 'persona' && (
              <>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 56, height: 56, flexShrink: 0,
                    background: 'var(--cth-cream-200)',
                    boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden'
                  }}>
                    <SpritePortrait character="michael" scale={2} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 16, lineHeight: '23px' }}>
                      {t('onboarding.persona.headline')}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--cth-ink-700)', lineHeight: '21px' }}>
                      {t('onboarding.persona.body')}
                      <span style={{ color: 'var(--cth-ink-500)' }}>{t('onboarding.persona.bodyLocal')}</span>
                    </div>
                  </div>
                </div>

                <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 13, letterSpacing: 0.5, color: 'var(--cth-ink-700)' }}>
                  {t('onboarding.persona.ask')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <PersonaCard
                    icon="code"
                    title={t('onboarding.persona.technicalTitle')}
                    desc={t('onboarding.persona.technicalDesc')}
                    selected={audience === 'technical'}
                    onClick={() => { setAudience('technical'); setError(undefined); }}
                  />
                  <PersonaCard
                    icon="sparkle"
                    title={t('onboarding.persona.nonTechnicalTitle')}
                    desc={t('onboarding.persona.nonTechnicalDesc')}
                    selected={audience === 'non-technical'}
                    onClick={() => { setAudience('non-technical'); setError(undefined); }}
                  />
                </div>
              </>
            )}

            {step === 'welcome' && (
              <>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 56, height: 56, flexShrink: 0,
                    background: 'var(--cth-cream-200)',
                    boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden'
                  }}>
                    <SpritePortrait character="michael" scale={2} />
                  </div>
                  <div>
                    <div style={{
                      fontFamily: 'var(--cth-font-display)',
                      fontSize: 16, lineHeight: '23px'
                    }}>{t('onboarding.welcome.headline')}</div>
                    <div style={{ fontSize: 13, color: 'var(--cth-ink-700)', lineHeight: '20px' }}>
                      {plain
                        ? t('onboarding.welcome.descPlain', { godName })
                        : t('onboarding.welcome.desc', { godName })}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {FEATURES.map((f) => (
                    <div key={f.labelKey} style={{
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      padding: 10,
                      background: f.tint,
                      boxShadow: `inset 0 0 0 2px ${f.edge}`
                    }}>
                      <div style={{
                        width: 28, height: 28, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--cth-paper-100)',
                        boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
                      }}>
                        <Icon name={f.icon} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'var(--cth-font-display)',
                          fontSize: 14, lineHeight: '19px', marginBottom: 4
                          // These labels are literal caps to match their siblings, so
                          // the orchestrator's name has to arrive upper-cased too.
                        }}>{t(f.labelKey, { godName: godName.toUpperCase() })}</div>
                        <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
                          {plain ? t(f.descPlainKey, { godName }) : t(f.descKey, { godName })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {step === 'home' && (
              <>
                <p style={{ margin: 0, lineHeight: '22px' }}>
                  {plain ? t('onboarding.home.descPlain') : t('onboarding.home.desc')}
                </p>
                <FieldLabel>{t('onboarding.home.fieldLabel')}</FieldLabel>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={home}
                    onChange={(e) => setHome(e.target.value)}
                    placeholder={t('onboarding.home.placeholder')}
                    style={inputStyle}
                  />
                  <PixelButton variant="secondary" size="lg" onClick={pickHome}>
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <Icon name="folder" /> {plain ? t('onboarding.home.createPick') : t('onboarding.home.pick')}
                    </span>
                  </PixelButton>
                </div>
                {/* What actually lands in there. Three words beat a metaphor:
                    the old copy called it "the town hall", which tells you
                    nothing about whether you can delete it. */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(plain
                    ? ['onboarding.home.holdsSettings', 'onboarding.home.holdsMemory', 'onboarding.home.holdsHistory']
                    : ['onboarding.home.holdsState', 'onboarding.home.holdsMemory', 'onboarding.home.holdsLogs']
                  ).map((k) => (
                    <span key={k} style={{
                      padding: '4px 10px', fontSize: 12, lineHeight: '17px',
                      color: 'var(--cth-ink-700)',
                      background: 'var(--cth-cream-200)',
                      boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)'
                    }}>{t(k)}</span>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>
                  {plain ? t('onboarding.home.notePlain') : t('onboarding.home.note')}
                </div>
              </>
            )}

            {step === 'orchestrator' && (
              <>
                <p style={{ margin: 0, lineHeight: '22px' }}>
                  {plain
                    ? t('onboarding.orchestrator.descPlain', { godName })
                    : t('onboarding.orchestrator.desc', { godName })}
                </p>

                {/* Was a five-line explainer in a yellow box repeating what the
                    badges already say. One line is enough; the badges do the rest. */}
                <div style={{ fontSize: 12, lineHeight: '17px', color: 'var(--cth-ink-500)' }}>
                  {plain ? t('onboarding.orchestrator.cliAgentPlain') : t('onboarding.orchestrator.cliAgent')}
                </div>

                <FieldLabel>{t('onboarding.orchestrator.fieldLabel')}</FieldLabel>
                {/* The list scrolls inside itself. Twelve rows above the model
                    picker meant scrolling past every engine to reach it. */}
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  maxHeight: 268, overflowY: 'auto', paddingRight: 4
                }}>
                  {onboardingEngineChoices().eligible.map((p) => {
                    const sel = godProvider === p.id;
                    return (
                      <label key={p.id} className="cth-choice" style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 12px',
                        background: sel ? 'var(--cth-sky-light)' : 'var(--cth-paper-100)',
                        boxShadow: sel
                          ? 'inset 0 0 0 2px var(--cth-sky)'
                          : 'inset 0 0 0 1px var(--cth-ink-300)',
                        cursor: 'pointer'
                      }}>
                        <input
                          type="radio"
                          name="godProvider"
                          value={p.id}
                          checked={sel}
                          onChange={() => {
                            setGodProvider(p.id);
                            // Reset the model to the new provider's recommended pick so the
                            // dropdown below always shows a valid model for the chosen engine.
                            setGodModel(p.recommendedOrchestratorModel);
                          }}
                          style={{ width: 16, height: 16, flexShrink: 0 }}
                        />
                        <span style={{
                          width: 22, height: 22, flexShrink: 0, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', color: 'var(--cth-ink-900)'
                        }}>
                          <ProviderLogo provider={p.id} size={22} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: 'block', fontFamily: 'var(--cth-font-display)',
                            fontSize: 13, lineHeight: '18px', letterSpacing: 0.5
                          }}>
                            {p.label.toUpperCase()}
                          </span>
                          {/* Two registers want two different facts here. A
                              technical user wants the command that will actually
                              run; everyone else wants to know whose AI it is.
                              The vendor alone read as a repeat of the label on
                              rows like "GROK · XAI". */}
                          <span style={{
                            display: 'block', fontSize: 12, lineHeight: '17px',
                            color: 'var(--cth-ink-500)',
                            fontFamily: plain ? 'var(--cth-font-ui)' : 'var(--cth-font-mono)'
                          }}>
                            {plain
                              ? (PROVIDER_BLURB_KEYS[p.id] ? t(PROVIDER_BLURB_KEYS[p.id]!) : '')
                              : `$ ${p.defaultCommand}`}
                          </span>
                        </span>
                        {(() => {
                          const a = classifyEngineAvailability(engines, p.id);
                          const badge = engineAvailabilityBadge(a);
                          if (!badge) return null;
                          const bad = a.state === 'not-installable';
                          return (
                            <span title={a.path ?? undefined} style={{
                              fontSize: 11, padding: '2px 6px', lineHeight: '16px',
                              background: a.state === 'installed' ? 'var(--cth-mint-light)' : bad ? 'var(--cth-paper-100)' : 'var(--cth-cream-200)',
                              color: bad ? 'var(--cth-ink-500)' : 'var(--cth-ink-900)',
                              boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                              fontFamily: 'var(--cth-font-display)', flexShrink: 0
                            }}>{badge}</span>
                          );
                        })()}
                        {p.id === 'claude' && (
                          <span style={{
                            fontSize: 11, padding: '2px 6px', lineHeight: '16px',
                            background: 'var(--cth-lemon)',
                            boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                            fontFamily: 'var(--cth-font-display)', flexShrink: 0
                          }}>{t('onboarding.orchestrator.recommended')}</span>
                        )}
                      </label>
                    );
                  })}
                  {/* Engines a WORKER can run but Michael cannot (issue #355): shown
                      disabled instead of hidden, so "Copilot is missing" reads as the
                      real constraint — no inbox drain path — not as "unsupported". */}
                  {onboardingEngineChoices().workersOnly.map((p) => (
                    <label key={p.id} aria-disabled title={t('onboarding.orchestrator.workersOnlyHint', { godName })} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px',
                      background: 'var(--cth-paper-100)',
                      boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                      cursor: 'not-allowed', opacity: 0.75
                    }}>
                      <input type="radio" name="godProvider" value={p.id} checked={false} disabled
                        style={{ width: 16, height: 16, flexShrink: 0 }} />
                      <span style={{
                        width: 22, height: 22, flexShrink: 0, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', color: 'var(--cth-ink-500)'
                      }}>
                        <ProviderLogo provider={p.id} size={18} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontFamily: 'var(--cth-font-display)', fontSize: 11, color: 'var(--cth-ink-500)' }}>
                          {p.label.toUpperCase()}
                        </span>
                        <span style={{ display: 'block', fontSize: 12, lineHeight: '17px', color: 'var(--cth-ink-500)' }}>
                          {t('onboarding.orchestrator.workersOnlyHint', { godName })}
                        </span>
                      </span>
                      <span style={{
                        fontSize: 11, padding: '2px 6px', lineHeight: '16px',
                        background: 'var(--cth-paper-100)', color: 'var(--cth-ink-500)',
                        boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                        fontFamily: 'var(--cth-font-display)', flexShrink: 0
                      }}>{t('onboarding.orchestrator.workersOnly')}</span>
                    </label>
                  ))}
                </div>
                {engineBlocked && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 8, padding: 10,
                    background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 2px var(--cth-ink-900)',
                    fontSize: 12, lineHeight: '17px', color: 'var(--cth-ink-900)'
                  }}>
                    <span>{engineAvailabilityMessage(selectedEngine, providerPreset(godProvider).label, godName)}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <PixelButton variant="secondary" size="sm" onClick={() => { void probeEngines(); }} disabled={probing}>
                        {probing ? 'checking...' : 'check again'}
                      </PixelButton>
                      {selectedEngine.docsUrl && (
                        <PixelButton variant="ghost" size="sm" onClick={() => { void window.cth.openExternal(selectedEngine.docsUrl!); }}>
                          install instructions
                        </PixelButton>
                      )}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <FieldLabel>{t('onboarding.orchestrator.modelLabel')}</FieldLabel>
                  <select
                    value={godModel ?? ''}
                    onChange={(e) => setGodModel(e.target.value || undefined)}
                    style={inputStyle}
                  >
                    {modelsForProvider(godProvider).map((m) => (
                      <option key={m.label} value={m.id ?? ''}>{m.label}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>
                    {t('onboarding.orchestrator.modelNote', { godName })}
                  </div>
                </div>
              </>
            )}

            {step === 'repos' && (
              <>
                <p style={{ margin: 0, lineHeight: '22px' }}>
                  {plain ? t('onboarding.repos.descPlain') : t('onboarding.repos.desc')}
                </p>
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  maxHeight: 200, overflowY: 'auto'
                }}>
                  {repos.length === 0 && (
                    <div style={{
                      padding: 12,
                      fontSize: 13,
                      color: 'var(--cth-ink-500)',
                      background: 'var(--cth-paper-200)',
                      textAlign: 'center'
                    }}>
                      {plain ? t('onboarding.repos.emptyPlain') : t('onboarding.repos.empty')}
                    </div>
                  )}
                  {repos.map((r) => (
                    <div key={r} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px',
                      background: 'var(--cth-paper-100)',
                      boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)'
                    }}>
                      <Icon name="folder" />
                      <span style={{
                        flex: 1,
                        fontFamily: 'var(--cth-font-mono)', fontSize: 13,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      }}>{r}</span>
                      <PixelButton variant="ghost" size="sm" onClick={() => removeRepo(r)}>
                        <Icon name="x" />
                      </PixelButton>
                    </div>
                  ))}
                </div>
                <PixelButton variant="secondary" size="md" onClick={pickRepo}>
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <Icon name="plus" /> {plain ? t('onboarding.repos.addProject') : t('onboarding.repos.addRepo')}
                  </span>
                </PixelButton>
              </>
            )}

            {step === 'permissions' && (
              <>
                {/* AUTONOMY — merged from the old "auto mode" step (item 5). One choice
                    that maps to each engine's flag (item 6): autoMode → claude
                    bypassPermissions / codex -a never -s workspace-write (sandbox kept),
                    etc.; off → each engine's ask-first default. */}
                <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 13, letterSpacing: 0.5, color: 'var(--cth-ink-700)' }}>
                  {t('onboarding.permissions.autonomyHead')}
                </div>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: 12,
                  background: autoMode ? 'var(--cth-mint-light)' : 'var(--cth-cream-200)',
                  boxShadow: `inset 0 0 0 2px ${autoMode ? 'var(--cth-mint)' : 'var(--cth-ink-500)'}`,
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={autoMode}
                    onChange={(e) => setAutoMode(e.target.checked)}
                    style={{ width: 18, height: 18, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 14, lineHeight: '19px' }}>
                      {plain ? t('onboarding.permissions.autoLabelPlain') : t('onboarding.permissions.autoLabel')}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--cth-ink-700)' }}>
                      {plain
                        ? (autoMode ? t('onboarding.permissions.autoOnPlain') : t('onboarding.permissions.autoOffPlain'))
                        : (autoMode ? t('onboarding.permissions.autoOn') : t('onboarding.permissions.autoOff'))}
                    </div>
                  </div>
                </label>
                <div style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>
                  {plain ? t('onboarding.permissions.autoNotePlain') : t('onboarding.permissions.autoNote')}
                </div>

                <div style={{ height: 1, background: 'var(--cth-ink-300)', margin: '2px 0' }} />

                {/* RELIABILITY "— keeping work firing while you're away. */}
                <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 13, letterSpacing: 0.5, color: 'var(--cth-ink-700)' }}>
                  {t('onboarding.permissions.reliabilityHead')}
                </div>
                <p style={{ margin: 0, lineHeight: '20px', fontSize: 12, color: 'var(--cth-ink-700)' }}>
                  {plain ? t('onboarding.permissions.reliabilityDescPlain') : t('onboarding.permissions.reliabilityDesc')}
                </p>

                <ToggleRow
                  icon="clock"
                  label={t('onboarding.permissions.keepAwake')}
                  desc={t('onboarding.permissions.keepAwakeDesc')}
                  on={strongKeepalive}
                  tint="var(--cth-mint-light)"
                  edge="var(--cth-mint)"
                  onChange={toggleStrongKeepalive}
                />

                <ToggleRow
                  icon="bell"
                  label={t('onboarding.permissions.notifications')}
                  desc={t('onboarding.permissions.notificationsDesc')}
                  on={notifications}
                  tint="var(--cth-peach-light)"
                  edge="var(--cth-peach)"
                  onChange={toggleNotifications}
                />

                <ToggleRow
                  icon="play"
                  label={t('onboarding.permissions.openAtLogin')}
                  desc={t('onboarding.permissions.openAtLoginDesc')}
                  on={openAtLogin}
                  tint="var(--cth-sky-light)"
                  edge="var(--cth-sky)"
                  onChange={toggleOpenAtLogin}
                />

                <ToggleRow
                  icon="info"
                  label={t('onboarding.permissions.shareStats')}
                  desc={t('onboarding.permissions.shareStatsDesc')}
                  on={shareStats}
                  tint="var(--cth-lemon-light)"
                  edge="var(--cth-lemon)"
                  onChange={() => setShareStats(!shareStats)}
                />

                {/* LEVER 4 "— instruction-only: the OS won't let the app flip its sleep setting itself, so we deep-link the pane where one exists (macOS/Windows) and fall back to text-only guidance on Linux. */}
                <div style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start', padding: 10,
                  background: 'var(--cth-lemon-light)',
                  boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
                }}>
                  <span style={{
                    width: 28, height: 28, flexShrink: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
                  }}>
                    <Icon name="gear" />
                  </span>
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 13, lineHeight: '18px', marginBottom: 4 }}>
                        {t('onboarding.permissions.stayAwake')}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
                        {t(`onboarding.permissions.stayAwakeDesc${stayAwakeOs === 'mac' ? 'Mac' : stayAwakeOs === 'windows' ? 'Windows' : 'Linux'}`)}
                      </div>
                    </div>
                    {stayAwakeUrl && (
                      <PixelButton variant="secondary" size="sm"
                        onClick={() => openSettings(stayAwakeUrl)}>
                        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <Icon name="arrow-right" /> {t(`onboarding.permissions.openBattery${stayAwakeOs === 'mac' ? 'Mac' : 'Windows'}`)}
                        </span>
                      </PixelButton>
                    )}
                  </div>
                </div>
              </>
            )}

            {error && (
              <div style={{
                padding: '6px 10px',
                background: 'var(--cth-coral-light)',
                boxShadow: 'inset 0 0 0 1px var(--cth-coral)',
                fontSize: 13,
                color: 'var(--cth-ink-900)',
                overflowWrap: 'anywhere'
              }}>{error}</div>
            )}

            </div>
          </div>
        </div>

        {/* ── Footer: how far along, and the way forward ───────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
          flexShrink: 0, padding: '14px 20px',
          background: 'var(--cth-cream-100)',
          boxShadow: 'inset 0 1px 0 var(--cth-ink-100)'
        }}>
              <div style={{
                flex: 1, height: 6, maxWidth: 300,
                background: 'var(--cth-cream-300)'
              }}>
                <div style={{
                  // The step you are ON counts as progress: a trough that reads empty on
                  // step 1 looks like a bar that failed to load, not like a start.
                  width: `${((stepIndex + 1) / STEP_ORDER.length) * 100}%`, height: '100%',
                  background: 'var(--cth-lilac)',
                  transition: 'width 160ms steps(6, end)'
                }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Two branches used to say this, one of them spelling out the
                    step it goes back to. prevStep already knows. */}
                {stepIndex > 0 && (
                  <PixelButton variant="ghost" size="lg" style={NAV_LABEL} onClick={() => setStep(prevStep(step))} disabled={busy}>
                    {t('common.back')}
                  </PixelButton>
                )}
                {step !== LAST_STEP && (
                  <PixelButton
                    variant="primary"
                    size="lg"
                    style={NAV_PRIMARY}
                    onClick={() => {
                      // Validate the home step HERE. Without this the only check
                      // lives in finish(), so an empty field walks you through all
                      // four steps and then bounces you back to step 1 to be told.
                      if (step === 'home' && !home.trim()) {
                        setError(t('onboarding.errPickHome'));
                        return;
                      }
                      // Same idea for the engine: refuse here, with the reason on
                      // screen, instead of letting a pick that cannot boot through
                      // to a Michael that never starts.
                      if (step === 'orchestrator' && engineBlocked) {
                        setError(`${providerPreset(godProvider).label} is not installed. Install it and press "check again", or pick another engine.`);
                        return;
                      }
                      setError(undefined);
                      setStep(nextStep(step));
                    }}
                    disabled={(step === 'persona' && !audience) || (step === 'orchestrator' && engineBlocked)}
                  >
                    {step === 'welcome' ? t('onboarding.permissions.setItUp') : t('common.next')}
                  </PixelButton>
                )}
                {step === LAST_STEP && (
                  <PixelButton variant="primary" size="lg" style={NAV_PRIMARY} onClick={finish} disabled={busy}>
                    {busy ? t('common.saving') : t('common.finish')}
                  </PixelButton>
                )}
              </div>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--cth-font-display)', fontSize: 11, letterSpacing: 1,
      color: 'var(--cth-ink-500)', marginBottom: -8
    }}>{children}</div>
  );
}

function PersonaCard({ icon, title, desc, selected, onClick }: {
  icon: IconName;
  title: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="cth-choice"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        textAlign: 'left', cursor: 'pointer', border: 'none',
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8,
        // Selection is cyan on purpose. Mint read as "success"; the brand
        // violet disappeared into an app painted violet everywhere else. The
        // one colour that is NOT the brand is the one that reads as "chosen".
        background: selected ? 'var(--cth-sky-light)' : 'var(--cth-paper-100)',
        boxShadow: selected
          ? 'inset 0 0 0 2px var(--cth-sky), 0 0 22px -6px var(--cth-sky)'
          : 'inset 0 0 0 1px var(--cth-ink-300)'
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
        <span style={{
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: selected ? 'var(--cth-sky)' : 'var(--cth-cream-200)',
          color: selected ? 'var(--cth-on-accent)' : 'var(--cth-ink-700)',
          boxShadow: `inset 0 0 0 1px ${selected ? 'var(--cth-sky)' : 'var(--cth-ink-300)'}`
        }}>
          <Icon name={icon} />
        </span>
        <span style={{ flex: 1 }} />
        {/* The tick, and a reserved slot for it: without the empty circle the
            two cards jump sideways the moment one is picked. */}
        <span style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
          display: 'grid', placeItems: 'center',
          fontSize: 11, lineHeight: 1,
          background: selected ? 'var(--cth-sky)' : 'transparent',
          color: 'var(--cth-on-accent)',
          boxShadow: `inset 0 0 0 ${selected ? 0 : 1}px var(--cth-ink-300)`
        }}>{selected ? '\u2713' : ''}</span>
      </span>
      <span style={{
        fontFamily: 'var(--cth-font-display)', fontSize: 14, lineHeight: '19px',
        letterSpacing: 0.5, color: 'var(--cth-ink-900)'
      }}>
        {title}
      </span>
      <span style={{ fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink-700)' }}>
        {desc}
      </span>
    </button>
  );
}

function ToggleRow({ icon, label, desc, on, tint, edge, onChange }: {
  icon: IconName;
  label: string;
  desc: string;
  on: boolean;
  tint: string; // background token when on
  edge: string; // border token when on
  onChange: (v: boolean) => void;
}) {
  return (
    <label style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: 10,
      background: on ? tint : 'var(--cth-paper-100)',
      boxShadow: `inset 0 0 0 ${on ? 2 : 1}px ${on ? edge : 'var(--cth-ink-300)'}`,
      cursor: 'pointer'
    }}>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 18, height: 18, flexShrink: 0, marginTop: 5 }}
      />
      <span style={{
        width: 28, height: 28, flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
      }}>
        <Icon name={icon} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: 'var(--cth-font-display)', fontSize: 13, lineHeight: '18px', marginBottom: 4 }}>
          {label}
        </span>
        <span style={{ display: 'block', fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
          {desc}
        </span>
      </span>
    </label>
  );
}

/** One line of the step rail. Not clickable: a step you have not reached has
 *  nothing to show yet, and one you have left is validated — jumping either way
 *  is how a wizard ends up half-filled. */
function RailStep({ n, label, state }: {
  n: number;
  label: string;
  state: 'done' | 'current' | 'todo';
}) {
  const current = state === 'current';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px',
      position: 'relative',
      background: current ? 'var(--cth-cream-50)' : 'transparent',
      boxShadow: current ? 'inset 3px 0 0 var(--cth-lilac)' : 'none'
    }}>
      {/* The spine, drawn per row as the segment ABOVE this number — so it
          threads the six chips together and stops at the last one, instead of
          dangling past it the way one absolute line did. */}
      {n > 1 && (
        <span aria-hidden style={{
          position: 'absolute', left: 28, top: 0, height: 9, width: 1,
          background: state === 'todo' ? 'var(--cth-ink-100)' : 'var(--cth-ink-300)'
        }} />
      )}
      <span style={{
        width: 24, height: 24, flexShrink: 0, display: 'grid', placeItems: 'center',
        position: 'relative',   // sits ON the spine, so it needs to paint over it
        fontFamily: 'var(--cth-font-display)', fontSize: 11,
        // Done is filled and quiet, current is filled and lit, todo is an empty
        // outline. Three states, three different weights of ink.
        background: state === 'done' ? 'var(--cth-lilac-light)'
          : current ? 'var(--cth-lilac)' : 'var(--cth-cream-100)',
        color: current ? 'var(--cth-on-accent)'
          : state === 'done' ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)',
        boxShadow: current
          ? '0 0 0 1px var(--cth-lilac), 0 0 16px -2px var(--cth-lilac)'
          : `inset 0 0 0 1px ${state === 'todo' ? 'var(--cth-ink-100)' : 'var(--cth-lilac)'}`
      }}>{state === 'done' ? '\u2713' : n}</span>
      <span style={{
        fontFamily: 'var(--cth-font-display)', fontSize: 12, lineHeight: '16px',
        letterSpacing: current ? 1 : 0.5,
        color: current ? 'var(--cth-ink-900)' : state === 'done' ? 'var(--cth-ink-700)' : 'var(--cth-ink-500)'
      }}>{label}</span>
    </div>
  );
}

function nextStep(s: Step): Step {
  const i = STEP_ORDER.indexOf(s);
  return i < 0 || i === STEP_ORDER.length - 1 ? 'done' : STEP_ORDER[i + 1];
}
function prevStep(s: Step): Step {
  const i = STEP_ORDER.indexOf(s);
  return i <= 0 ? STEP_ORDER[0] : STEP_ORDER[i - 1];
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: 40,
  padding: '0 12px',
  background: 'var(--cth-paper-100)',
  border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
  fontFamily: 'var(--cth-font-mono)',
  fontSize: 14,
  color: 'var(--cth-ink-900)',
  outline: 'none'
};
