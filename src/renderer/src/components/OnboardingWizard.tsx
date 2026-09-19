import { isBrowserMode } from '@/runtime';
import { osStringKey } from '@/platformCopy';
import { workspacePath, workspaceNameFromProjects, WORKSPACE_ROOT, cleanWorkspaceName } from '@shared/workspaceName';
import { ensureNotificationPermission } from '@/browserNotifications';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { Icon, type IconName } from './Icon';
import { SpritePortrait } from './SpritePortrait';
import { AtlasMark } from './AtlasMark';
import { stepsFor, nextStep, prevStep, type Audience, type Step } from '@/store/onboardingSteps';
import { Dropdown } from './Dropdown';
import { Switch } from './Switch';
import { ProviderLogo } from './ProviderLogo';
import { modelsForProvider, onboardingEngineChoices, type AgentProvider, type HarnessConfig } from '@/store/config';
import { providerPreset } from '@shared/agentProvider';
import {
  classifyEngineAvailability, engineAvailabilityBadge, engineAvailabilityMessage, engineBlocksOnboarding
} from '@shared/engineAvailability';
import type { ToolStatus } from '@shared/toolCatalog';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { go, parseRoute } from '@/routes';
import { useNativeDialog } from '@/hooks/useNativeDialog';

export interface OnboardingWizardProps {
  onComplete: (config: HarnessConfig) => void;
}


/** The setup's two nav buttons. The display face and a little tracking so a
 *  one-word label still reads as a control, not as a caption; the primary keeps
 *  a floor width so "Continue" and "Finish setup" do not resize the footer. */
const NAV_LABEL = { fontFamily: 'var(--cth-font-ui)', fontWeight: 600 } as const;
const NAV_PRIMARY = { ...NAV_LABEL, minWidth: 148 } as const;

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
/** The engines this setup actually offers on the next step, counted and named
 *  from the same list that draws it. The card used to say "Eleven engines" and
 *  "and eight more" from a preset file the user never sees; what matters is
 *  what step 3 puts in front of you. */
const ENGINE_COUNTS = (() => {
  const shown = onboardingEngineChoices().eligible;
  const names = shown.map((p) => p.label.split(' · ')[0]);
  return {
    count: shown.length,
    names: names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      : (names[0] ?? '')
  };
})();

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
  gemini: 'onboarding.providerBlurb.gemini'
};

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { t } = useTranslation();
  // Onboarding runs before god exists in the store, so read the persisted name.
  const godName = useResolvedGodName();
  const [step, setStep] = useState<Step>('welcome');

  // Self-identified audience. Undefined until the dialog below is answered; it
  // decides both the copy register (`plain`) and which steps exist at all.
  const [audience, setAudience] = useState<Audience | undefined>();
  const plain = audience === 'non-technical';
  const steps = stepsFor(audience ?? 'technical');
  const lastStep = steps[steps.length - 1];

  // Setup names its step in the address bar (#/setup/repos), and back and
  // forward walk the steps. Only a name in THIS audience's list is honoured, so
  // neither a typed hash nor a hash left over from the other audience's setup
  // can land you on a screen this one does not have.
  useEffect(() => {
    const apply = (): void => {
      const r = parseRoute();
      const next = r?.screen === 'setup' ? r.step : undefined;
      if (next && (steps as string[]).includes(next)) setStep(next as Step);
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience]);
  useEffect(() => { if (step !== 'done') go({ screen: 'setup', step }); }, [step]);

  // The workspace's NAME, not a path. New workspaces are folders under one
  // root, so the only decision left here is what to call this one — and the
  // folder it makes is the name, which is why the root is shown beside the
  // field rather than hidden inside it.
  const [workspace, setWorkspace] = useState<string>('');
  // Whether the name is the user's. Until they type one it FOLLOWS the projects
  // — add a repo on step 3 and the name on step 6 is already right — and the
  // moment they type, it is theirs and nothing overwrites it.
  const [workspaceTyped, setWorkspaceTyped] = useState(false);
  const home = workspace.trim() ? workspacePath(workspace) : '';
  const [repos, setRepos] = useState<string[]>([]);
  const [autoMode, setAutoMode] = useState<boolean>(true);
  // Anonymous usage stats (TELEMETRY.md). No longer asked about at first run:
  // the PostHog key is injected at BUILD time and is empty in a fork build, so
  // this consent row was asking permission for something that cannot fire. The
  // flag is still written, and Settings still exposes it, so a build that does
  // carry a key keeps working.
  const shareStats = false;
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
    // In a browser the OS gate is Chrome's, and it only answers a prompt that
    // came from a gesture — this click. Asking anywhere else is ignored.
    if (v && !(await ensureNotificationPermission())) { setNotifications(false); return; }
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
  // Suggest a NAME, and build `~/Atlas/<name>` from it. That tilde path is
  // exactly the string #140's normalizeHiveHome()/expandTilde() were built to
  // absorb: it is expanded at the config-write boundary AND at
  // ensureHarnessHome's mkdir, so every downstream reader still sees one
  // absolute path. No new IPC surface.
  useEffect(() => {
    if (workspaceTyped) return;
    setWorkspace(workspaceNameFromProjects(repos));
  }, [repos, workspaceTyped]);

  const [pickingRepo, pickRepo] = useNativeDialog(async () => {
    setError(undefined);
    // Multi-select: adding four projects used to mean opening the picker four
    // times. Dedupe against what is already listed, and against itself, so a
    // repeat pick is a no-op rather than a duplicate row.
    const res = await window.cth.chooseFolder({ multi: true });
    if (res.ok) {
      const picked = res.paths?.length ? res.paths : [res.path];
      const added = picked.filter((p) => p && !repos.includes(p));
      if (added.length) setRepos([...repos, ...new Set(added)]);
    } else if (res.error !== 'cancelled') {
      setError(res.error);
    }
  });

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
      // Simple mode has no terminal to answer a permission prompt in, so it runs
      // with autonomy on and the 'permissions' step is not in its list at all.
      // Write what that mode needs, not the untouched default of a screen this
      // audience never saw.
      autoMode: plain ? true : autoMode,
      godProvider,
      godModel,
      telemetryEnabled: shareStats
    });
    setBusy(false);
    onComplete(next);
  };

  const stepTitle =
    step === 'welcome' ? t('onboarding.titles.welcome')
    : step === 'home' ? (plain ? t('onboarding.titles.homePlain') : t('onboarding.titles.home'))
    : step === 'orchestrator' ? (plain ? t('onboarding.titles.orchestratorPlain') : t('onboarding.titles.orchestrator'))
    : step === 'repos' ? (plain ? t('onboarding.titles.reposPlain') : t('onboarding.titles.repos'))
    : step === 'permissions' ? t('onboarding.titles.permissions')
    : step === 'away' ? t('onboarding.titles.away')
    : t('onboarding.titles.done');
  const stepIndex = Math.max(0, steps.indexOf(step));

  // THE QUESTION BEFORE THE SETUP. It is asked in its own dialog, on its own,
  // because the answer decides which setup you get — a screen that changes the
  // other screens does not belong in the rail beside them. Picking is the
  // answer: one click, no Continue to hunt for, and Settings can change it
  // afterwards, which is what the line under the cards says.
  if (!audience) {
    return <PersonaDialog onPick={(a) => { setAudience(a); setError(undefined); }} />;
  }

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
        display: 'flex', flexDirection: 'column',
        height: 'min(86vh, 620px)',
        background: 'var(--cth-cream-50)',
        // A lift off the floor, not a stamped-on slab: a hairline to hold the
        // edge, then two shadows — a tight one for the seam and a wide soft one
        // for the height. The old 6px hard offset read as a sticker.
        boxShadow: `inset 0 0 0 1px var(--cth-ink-100),
                    0 1px 2px rgba(17, 20, 24, 0.06),
                    0 24px 60px -12px rgba(17, 20, 24, 0.28)`,
        borderRadius: 'var(--cth-radius-card)'
      }}>

        {/* ── Brand bar: who is asking, and how far in you are ─────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          padding: '16px 20px',
          background: 'var(--cth-cream-100)',
          boxShadow: 'inset 0 -1px 0 var(--cth-ink-100)'
        }}>
          <AtlasMark size={30} />
          <span style={{
            fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 15,
            letterSpacing: '-0.2px', color: 'var(--cth-ink-900)'
          }}>{t('onboarding.setup.name')}</span>
          <span style={{ flex: 1 }} />
          <span style={{
            fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600,
            fontVariantNumeric: 'tabular-nums', color: 'var(--cth-ink-500)'
          }}>{t('onboarding.setup.counter', { n: stepIndex + 1, total: steps.length })}</span>
        </div>

        <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>

          {/* ── Step rail: the whole shape of the setup, visible at once ───── */}
          {/* The rail carries no panel of its own. It used to be a lighter fill
              than the box, so on a short step it ended in a large empty slab of
              colour. With no fill there is nothing to look empty: the divider
              and the current row do all the work. */}
          <nav style={{
            width: 190, flexShrink: 0, padding: '18px 0',
            display: 'flex', flexDirection: 'column',
            position: 'relative'
          }}>
            {steps.map((s, i) => (
              <RailStep
                key={s}
                n={i + 1}
                label={t(`onboarding.setup.rail.${s}`)}
                state={i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'todo'}
              />
            ))}
          </nav>

          <div style={{
            flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column',
            boxShadow: 'inset 1px 0 0 var(--cth-ink-100)'
          }}>
            {/* The step's own name — the rail says where, this says what. */}
            <h2 style={{
              margin: 0, padding: '22px 28px 0',
              fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 19,
              lineHeight: '26px', letterSpacing: '-0.3px',
              color: 'var(--cth-ink-900)'
            }}>{stepTitle}</h2>
            <div className="cth-scrollpane" style={{
              padding: '16px 28px 24px', display: 'flex', flexDirection: 'column', gap: 18,
              overflowY: 'auto', flex: 1, minHeight: 0
            }}>

            {step === 'welcome' && (
              <>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 52, height: 52, flexShrink: 0,
                    background: 'var(--cth-cream-100)',
                    borderRadius: 'var(--cth-radius-card)',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden'
                  }}>
                    <SpritePortrait character="michael" scale={2} />
                  </div>
                  <div>
                    <div style={{
                      fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
                      fontSize: 16, lineHeight: '23px'
                    }}>{t('onboarding.welcome.headline')}</div>
                    <div style={{ fontSize: 13, color: 'var(--cth-ink-700)', lineHeight: '20px' }}>
                      {plain
                        ? t('onboarding.welcome.descPlain', { godName })
                        : t('onboarding.welcome.desc', { godName })}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {FEATURES.map((f) => (
                    <div key={f.labelKey} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      padding: 14,
                      borderRadius: 'var(--cth-radius-card)',
                      background: 'var(--cth-paper-100)',
                      boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)'
                    }}>
                      {/* Six pastel fills each in a 2px saturated border was a
                          paint chart. The colour lives in the icon now, and the
                          cards are one calm grid. */}
                      <div style={{
                        width: 30, height: 30, flexShrink: 0, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: f.tint, color: f.edge
                      }}>
                        <Icon name={f.icon} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
                          fontSize: 13.5, lineHeight: '19px', marginBottom: 3,
                          color: 'var(--cth-ink-900)'
                        }}>{t(f.labelKey, { godName, ...ENGINE_COUNTS })}</div>
                        <div style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                          {plain
                            ? t(f.descPlainKey, { godName, ...ENGINE_COUNTS })
                            : t(f.descKey, { godName, ...ENGINE_COUNTS })}
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
                <div style={{ display: 'flex', alignItems: 'stretch' }}>
                  {/* The root is a label, not editable text. Somewhere else on
                      disk is still reachable — the workspace picker's "Open
                      another folder" — but the folder this step MAKES is named
                      here and lives there. */}
                  <span style={{
                    display: 'flex', alignItems: 'center', padding: '0 4px 0 14px',
                    fontFamily: 'var(--cth-font-mono, monospace)', fontSize: 15,
                    color: 'var(--cth-ink-500)', whiteSpace: 'nowrap',
                    background: 'var(--cth-cream-50)',
                    boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                    borderRadius: 'var(--cth-radius-input) 0 0 var(--cth-radius-input)'
                  }}>{WORKSPACE_ROOT}/</span>
                  <input
                    value={workspace}
                    onChange={(e) => { setWorkspaceTyped(true); setWorkspace(e.target.value); }}
                    placeholder={t('onboarding.home.placeholder')}
                    className="cth-input"
                    style={{ ...inputStyle, borderRadius: '0 var(--cth-radius-input) var(--cth-radius-input) 0', paddingLeft: 4 }}
                  />
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
                      padding: '4px 16px', fontSize: 13, lineHeight: '17px',
                      color: 'var(--cth-ink-700)',
                      background: 'var(--cth-cream-200)',
                      boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)'
                    }}>{t(k)}</span>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: 'var(--cth-ink-500)' }}>
                  {plain ? t('onboarding.home.notePlain') : t('onboarding.home.note')}
                </div>

                {/* This is the LAST step, so Finish should not be a leap of
                    faith: show back the three answers it is about to write. */}
                <div style={{ height: 1, background: 'var(--cth-ink-100)', margin: '4px 0' }} />
                <FieldLabel>{t('onboarding.home.review')}</FieldLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <ReviewRow
                    label={t('onboarding.home.reviewEngine')}
                    value={`${providerPreset(godProvider).label}${godModel ? ' · ' + (modelsForProvider(godProvider).find((m) => m.id === godModel)?.label ?? godModel) : ''}`}
                  />
                  <ReviewRow
                    label={t('onboarding.home.reviewProjects')}
                    value={repos.length
                      ? repos.map((r) => r.replace(/\/+$/, '').split('/').pop()).join(', ')
                      : t('onboarding.home.reviewProjectsNone')}
                  />
                  <ReviewRow
                    label={t('onboarding.home.reviewMode')}
                    value={autoMode ? t('onboarding.home.reviewModeAuto') : t('onboarding.home.reviewModeAsk')}
                  />
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
                <div style={{ fontSize: 13, lineHeight: '17px', color: 'var(--cth-ink-500)' }}>
                  {plain ? t('onboarding.orchestrator.cliAgentPlain') : t('onboarding.orchestrator.cliAgent')}
                </div>

                <FieldLabel>{t('onboarding.orchestrator.fieldLabel')}</FieldLabel>
                {/* No inner scroll: setup offers three engines and the step's
                    own pane scrolls. A nested scroller sized for the old
                    twelve-row list clipped the third row, and the note below it
                    painted straight over what was left. */}
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0
                }}>
                  {onboardingEngineChoices().eligible.map((p) => {
                    const sel = godProvider === p.id;
                    return (
                      <label key={p.id} className="cth-choice" style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px',
                        borderRadius: 'var(--cth-radius-card)',
                        background: sel ? 'var(--cth-lilac-light)' : 'var(--cth-paper-100)',
                        boxShadow: sel
                          ? 'inset 0 0 0 2px var(--cth-lilac)'
                          : 'inset 0 0 0 1px var(--cth-ink-100)',
                        cursor: 'pointer',
                        transition: 'background 120ms ease, box-shadow 120ms ease'
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
                          style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--cth-lilac)' }}
                        />
                        <span style={{
                          width: 22, height: 22, flexShrink: 0, display: 'flex',
                          alignItems: 'center', justifyContent: 'center', color: 'var(--cth-ink-900)'
                        }}>
                          <ProviderLogo provider={p.id} size={22} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: 'block', fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
                            fontSize: 13.5, lineHeight: '18px',
                            color: sel ? 'var(--cth-lilac-text)' : 'var(--cth-ink-900)'
                          }}>
                            {p.label}
                          </span>
                          {/* Two registers want two different facts here. A
                              technical user wants the command that will actually
                              run; everyone else wants to know whose AI it is.
                              The vendor alone read as a repeat of the label on
                              rows like "GROK · XAI". */}
                          <span style={{
                            display: 'block', fontSize: 13, lineHeight: '17px',
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
                            <span style={{
                              fontSize: 11, padding: '3px 10px', lineHeight: '16px',
                              borderRadius: 999,
                              background: a.state === 'installed' ? 'var(--cth-mint-light)' : 'var(--cth-cream-100)',
                              color: a.state === 'installed' ? 'var(--cth-mint-text)' : 'var(--cth-ink-500)',
                              fontFamily: 'var(--cth-font-ui)', fontWeight: 600, flexShrink: 0
                            }}>{badge}</span>
                          );
                        })()}
                        {p.id === 'claude' && (
                          <span style={{
                            fontSize: 11, padding: '3px 10px', lineHeight: '16px',
                            borderRadius: 999,
                            background: 'var(--cth-lilac-light)', color: 'var(--cth-lilac-text)',
                            fontFamily: 'var(--cth-font-ui)', fontWeight: 600, flexShrink: 0
                          }}>{t('onboarding.orchestrator.recommended')}</span>
                        )}
                      </label>
                    );
                  })}
                  {/* Engines a WORKER can run but Michael cannot (issue #355): shown
                      disabled instead of hidden, so "Copilot is missing" reads as the
                      real constraint — no inbox drain path — not as "unsupported". */}
                  {onboardingEngineChoices().workersOnly.map((p) => (
                    <label key={p.id} aria-disabled style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px',
                      background: 'var(--cth-paper-100)',
                      boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
                      borderRadius: 'var(--cth-radius-card)',
                      cursor: 'not-allowed', opacity: 0.7
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
                        <span style={{ display: 'block', fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--cth-ink-700)' }}>
                          {p.label}
                        </span>
                        <span style={{ display: 'block', fontSize: 13, lineHeight: '17px', color: 'var(--cth-ink-500)' }}>
                          {t('onboarding.orchestrator.workersOnlyHint', { godName })}
                        </span>
                      </span>
                      <span style={{
                        fontSize: 11, padding: '3px 10px', lineHeight: '16px', borderRadius: 999,
                        background: 'var(--cth-cream-100)', color: 'var(--cth-ink-500)',
                        fontFamily: 'var(--cth-font-ui)', fontWeight: 600, flexShrink: 0
                      }}>{t('onboarding.orchestrator.workersOnly')}</span>
                    </label>
                  ))}
                </div>
                {engineBlocked && (
                  <div style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14,
                    borderRadius: 'var(--cth-radius-card)',
                    background: 'var(--cth-coral-light)'
                  }}>
                    <span style={{ flexShrink: 0, display: 'inline-flex', color: 'var(--cth-coral-text)', marginTop: 1 }}>
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                        <path d="M10 2.9 18.1 17H1.9L10 2.9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                        <path d="M10 8v3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        <circle cx="10" cy="14.3" r="1" fill="currentColor" />
                      </svg>
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                      <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-900)' }}>
                        {engineAvailabilityMessage(selectedEngine, providerPreset(godProvider).label, godName)}
                      </span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <PixelButton variant="secondary" size="sm" onClick={() => { void probeEngines(); }} disabled={probing}>
                          {probing ? t('setupPanel.checkingBtn') : t('onboarding.orchestrator.checkAgain')}
                        </PixelButton>
                        {selectedEngine.docsUrl && (
                          <PixelButton variant="secondary" size="sm" onClick={() => { void window.cth.openExternal(selectedEngine.docsUrl!); }}>
                            {t('onboarding.orchestrator.installHelp')}
                          </PixelButton>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* The model picker is hidden for a non-technical setup: it is a
                    list of model ids, and `godModel` already holds the engine's
                    recommended one. Nothing is chosen for them that they would
                    have chosen differently — the marked option IS the default. */}
                {!engineBlocked && !plain && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <FieldLabel>{t('onboarding.orchestrator.modelLabel')}</FieldLabel>
                  <Dropdown
                    value={godModel ?? ''}
                    options={modelsForProvider(godProvider).map((m) => {
                      // Every engine has a model it is meant to run Atlas on.
                      // Marking it in the list beats a note under it that
                      // names a model you then have to go and find.
                      const best = providerPreset(godProvider).recommendedOrchestratorModel;
                      const isBest = !!m.id && m.id === best;
                      return {
                        value: m.id ?? '',
                        label: m.label,
                        hint: isBest ? t('onboarding.orchestrator.recommended') : undefined
                      };
                    })}
                    onChange={(v) => setGodModel(v || undefined)}
                    ariaLabel={t('onboarding.orchestrator.modelLabel')}
                    width="100%"
                  />
                  <div style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                    {t('onboarding.orchestrator.modelNote', { godName })}
                  </div>
                </div>
                )}
              </>
            )}

            {step === 'repos' && (
              <>
                <p style={{ margin: 0, fontSize: 13, lineHeight: '21px', color: 'var(--cth-ink-600)' }}>
                  {plain ? t('onboarding.repos.descPlain') : t('onboarding.repos.desc')}
                </p>

                {/* The advice about nesting is its own note, not a third clause
                    on the end of a paragraph nobody finishes reading. */}
                <div style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  padding: '10px 12px', borderRadius: 'var(--cth-radius-card)',
                  background: 'var(--cth-sky-light)'
                }}>
                  <span style={{ flexShrink: 0, display: 'inline-flex', color: 'var(--cth-sky-text)' }}>
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <circle cx="10" cy="10" r="7.4" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M10 9.2v4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <circle cx="10" cy="6.4" r="1" fill="currentColor" />
                    </svg>
                  </span>
                  <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
                    {t('onboarding.repos.nested')}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <FieldLabel>{t('onboarding.repos.fieldLabel')}</FieldLabel>
                  {repos.length > 0 && (
                    <span style={{ fontSize: 13, color: 'var(--cth-ink-500)', marginBottom: -8 }}>
                      {t('onboarding.repos.count', { count: repos.length })}
                    </span>
                  )}
                </div>

                <div className="cth-scrollpane" style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                  maxHeight: 210, overflowY: 'auto', flexShrink: 0
                }}>
                  {repos.length === 0 && (
                    <div style={{
                      padding: '20px 12px', fontSize: 13, textAlign: 'center',
                      color: 'var(--cth-ink-500)',
                      // Dashed, not filled: an empty list should read as a slot
                      // waiting to be filled, not as a card with a message in it.
                      border: '1px dashed var(--cth-ink-300)'
                    }}>
                      {plain ? t('onboarding.repos.emptyPlain') : t('onboarding.repos.empty')}
                    </div>
                  )}
                  {repos.map((r) => {
                    // A full path in a narrow row ellipsises to "/Users/mohammed…"
                    // and every row looks identical. The folder NAME is what tells
                    // them apart, so it leads and the path sits under it.
                    const parts = r.replace(/\/+$/, '').split('/');
                    const name = parts[parts.length - 1] || r;
                    const parent = parts.slice(0, -1).join('/') || '/';
                    return (
                      <div key={r} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '16px 12px',
                        background: 'var(--cth-paper-100)',
                        boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)'
                      }}>
                        <span style={{
                          width: 30, height: 30, flexShrink: 0, display: 'grid', placeItems: 'center',
                          background: 'var(--cth-cream-200)', color: 'var(--cth-ink-700)',
                          boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)'
                        }}>
                          <Icon name="folder" />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: 'block', fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
                            fontSize: 13, lineHeight: '18px', letterSpacing: 0.5,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                          }}>{name}</span>
                          {/* A folder at the filesystem root, or one the browser
                              preview could only name, has no parent worth a line
                              of its own. Rendering a lone "/" reads as a bug. */}
                          {parent !== '/' && (
                            <span style={{
                              display: 'block', fontFamily: 'var(--cth-font-mono)',
                              fontSize: 13, lineHeight: '17px', color: 'var(--cth-ink-500)',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                            }}>{parent}</span>
                          )}
                        </span>
                        <PixelButton variant="ghost" size="sm" title={t('onboarding.repos.remove')}
                          onClick={() => removeRepo(r)}>
                          <Icon name="x" />
                        </PixelButton>
                      </div>
                    );
                  })}
                </div>

                <PixelButton variant="secondary" size="lg" fullWidth onClick={pickRepo} disabled={pickingRepo}>
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <Icon name="plus" /> {plain ? t('onboarding.repos.addProject') : t('onboarding.repos.addRepo')}
                  </span>
                </PixelButton>
              </>
            )}

            {step === 'permissions' && (
              <>
                {/* AUTONOMY. Was one checkbox that turned MINT GREEN when on,
                    which reads as "safe" for the option that removes the safety
                    rail. It is a choice between two postures, so it looks like
                    one, and selection uses the same cyan as every other pick in
                    this wizard. Maps to each engine's flag: auto -> claude
                    bypassPermissions / codex -a never -s workspace-write (sandbox
                    kept); off -> each engine's ask-first default. */}
                <div style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--cth-ink-900)' }}>
                  {t('onboarding.permissions.autonomyHead')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <PersonaCard
                    icon="pause"
                    tone="var(--cth-lemon)"
                    tint="var(--cth-lemon-light)"
                    title={t('onboarding.permissions.askTitle')}
                    desc={plain ? t('onboarding.permissions.askDescPlain') : t('onboarding.permissions.askDesc')}
                    selected={!autoMode}
                    onClick={() => setAutoMode(false)}
                  />
                  <PersonaCard
                    icon="sparkle"
                    tone="var(--cth-mint)"
                    tint="var(--cth-mint-light)"
                    title={t('onboarding.permissions.autoTitle')}
                    desc={plain ? t('onboarding.permissions.autoDescPlain') : t('onboarding.permissions.autoDesc')}
                    selected={autoMode}
                    onClick={() => setAutoMode(true)}
                  />
                </div>
                <div style={{ fontSize: 13, color: 'var(--cth-ink-500)' }}>
                  {plain ? t('onboarding.permissions.autoNotePlain') : t('onboarding.permissions.autoNote')}
                </div>

              </>
            )}

            {step === 'away' && (
              <>
                <p style={{ margin: 0, fontSize: 13, lineHeight: '21px', color: 'var(--cth-ink-600)' }}>
                  {/* Two of the three switches need an OS this page cannot reach,
                      so in the browser the count in the copy would be wrong. */}
                  {isBrowserMode()
                    ? (plain ? t('onboarding.permissions.reliabilityDescPlain_browser') : t('onboarding.permissions.reliabilityDesc_browser'))
                    : (plain ? t('onboarding.permissions.reliabilityDescPlain') : t('onboarding.permissions.reliabilityDesc'))}
                </p>

                <ToggleRow
                  icon="clock"
                  label={t(`onboarding.permissions.${osStringKey('keepAwake')}`)}
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
                  tint="var(--cth-mint-light)"
                  edge="var(--cth-mint)"
                  onChange={toggleNotifications}
                />

                {/* Login items and System Settings belong to the OS, and a
                    browser tab has no way to reach either. A switch that cannot
                    do what it says is worse than no switch. */}
                {!isBrowserMode() && (
                <ToggleRow
                  icon="play"
                  label={t('onboarding.permissions.openAtLogin')}
                  desc={t('onboarding.permissions.openAtLoginDesc')}
                  on={openAtLogin}
                  tint="var(--cth-mint-light)"
                  edge="var(--cth-mint)"
                  onChange={toggleOpenAtLogin}
                />
                )}

                {!isBrowserMode() && (
                <>
                {/* LEVER 4 "— instruction-only: the OS won't let the app flip its sleep setting itself, so we deep-link the pane where one exists (macOS/Windows) and fall back to text-only guidance on Linux. */}
                <div style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start', padding: 16,
                  background: 'var(--cth-lemon-light)',
                  boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)'
                }}>
                  <span style={{
                    width: 28, height: 28, flexShrink: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)'
                  }}>
                    <Icon name="gear" />
                  </span>
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13, lineHeight: '18px', marginBottom: 4 }}>
                        {t('onboarding.permissions.stayAwake')}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: '18px', color: 'var(--cth-ink-700)' }}>
                        {t(`onboarding.permissions.stayAwakeDesc${stayAwakeOs === 'mac' ? 'Mac' : stayAwakeOs === 'windows' ? 'Windows' : 'Linux'}`)}
                      </div>
                    </div>
                    {stayAwakeUrl && (
                      <PixelButton variant="secondary" size="sm"
                        onClick={() => openSettings(stayAwakeUrl)}>
                        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                          <Icon name="arrow-right" /> {t(`onboarding.permissions.openBattery${stayAwakeOs === 'mac' ? 'Mac' : 'Windows'}`)}
                        </span>
                      </PixelButton>
                    )}
                  </div>
                </div>
                </>
                )}
              </>
            )}

            {error && (
              <div style={{
                padding: '10px 16px',
                background: 'var(--cth-coral-light)',
                boxShadow: 'inset 0 0 0 1px var(--cth-coral)', borderRadius: 'var(--cth-radius-input)',
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
          flexShrink: 0, padding: '16px 20px',
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
                  width: `${((stepIndex + 1) / steps.length) * 100}%`, height: '100%',
                  background: 'var(--cth-lilac)',
                  transition: 'width 160ms steps(6, end)'
                }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Two branches used to say this, one of them spelling out the
                    step it goes back to. prevStep already knows. */}
                {stepIndex > 0 && (
                  <PixelButton variant="secondary" size="lg" style={NAV_LABEL} onClick={() => setStep(prevStep(steps, step))} disabled={busy}>
                    {t('common.back')}
                  </PixelButton>
                )}
                {step !== lastStep && (
                  <PixelButton
                    variant="primary"
                    size="lg"
                    style={NAV_PRIMARY}
                    onClick={() => {
                      // Validate the home step HERE. Without this the only check
                      // lives in finish(), so an empty field walks you through all
                      // four steps and then bounces you back to step 1 to be told.
                      if (step === 'home' && !cleanWorkspaceName(workspace)) {
                        setError(t('onboarding.home.errName'));
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
                      setStep(nextStep(steps, step));
                    }}
                    disabled={step === 'orchestrator' && engineBlocked}
                  >
                    {step === 'welcome' ? t('onboarding.permissions.setItUp') : t('common.next')}
                  </PixelButton>
                )}
                {step === lastStep && (
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

/** One line of the finish-step review: what you chose, in the words of the
 *  step you chose it on. */
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 13, lineHeight: '19px' }}>
      <span style={{ width: 92, flexShrink: 0, color: 'var(--cth-ink-500)' }}>{label}</span>
      <span style={{
        minWidth: 0, color: 'var(--cth-ink-900)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
      }}>{value}</span>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12,
      color: 'var(--cth-ink-500)', marginBottom: -8
    }}>{children}</div>
  );
}

function PersonaCard({ icon, title, desc, selected, tone, tint, onClick }: {
  icon: IconName;
  title: string;
  desc: string;
  selected: boolean;
  /** The card's own colour: it keeps it whether or not it is chosen. */
  tone: string;
  tint: string;
  onClick: () => void;
}) {
  return (
    <button
      className="cth-choice"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        textAlign: 'left', cursor: 'pointer', border: 'none',
        padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
        borderRadius: 'var(--cth-radius-card)',
        background: selected ? 'var(--cth-lilac-light)' : 'var(--cth-paper-100)',
        boxShadow: selected
          ? 'inset 0 0 0 2px var(--cth-lilac)'
          : 'inset 0 0 0 1px var(--cth-ink-100)',
        transition: 'background 120ms ease, box-shadow 120ms ease'
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        <span style={{
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '50%',
          background: tint, color: tone
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
          background: selected ? 'var(--cth-lilac)' : 'transparent',
          color: 'var(--cth-on-accent)',
          boxShadow: `inset 0 0 0 ${selected ? 0 : 1}px var(--cth-ink-300)`
        }}>{selected ? <Icon name="check" /> : null}</span>
      </span>
      <span style={{
        fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 14, lineHeight: '19px',
        color: selected ? 'var(--cth-lilac-text)' : 'var(--cth-ink-900)'
      }}>
        {title}
      </span>
      <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
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
    // A switch, on the right, where the app puts every other one. A checkbox
    // plus a tinted card plus a 2px edge was three things saying the same word.
    <label style={{
      display: 'flex', gap: 12, alignItems: 'center', padding: 14,
      borderRadius: 'var(--cth-radius-card)',
      background: 'var(--cth-paper-100)',
      boxShadow: `inset 0 0 0 1px ${on ? edge : 'var(--cth-ink-100)'}`,
      cursor: 'pointer',
      transition: 'box-shadow 120ms ease'
    }}>
      <span style={{
        width: 30, height: 30, flexShrink: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
        background: on ? tint : 'var(--cth-cream-100)',
        color: on ? edge : 'var(--cth-ink-500)',
        transition: 'background 120ms ease, color 120ms ease'
      }}>
        <Icon name={icon} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
          fontSize: 13.5, lineHeight: '18px', marginBottom: 2, color: 'var(--cth-ink-900)'
        }}>{label}</span>
        <span style={{ display: 'block', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
          {desc}
        </span>
      </span>
      <Switch on={on} label={label} tone={edge} onChange={() => onChange(!on)} />
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
      display: 'flex', alignItems: 'center', gap: 12,
      margin: '0 12px', padding: '9px 12px',
      position: 'relative', borderRadius: 'var(--cth-radius-btn)',
      background: current ? 'var(--cth-lilac-light)' : 'transparent',
      boxShadow: current ? 'inset 0 0 0 1.5px var(--cth-lilac)' : 'none'
    }}>
      {/* The spine, drawn per row as the segment ABOVE this number — so it
          threads the six chips together and stops at the last one, instead of
          dangling past it the way one absolute line did. */}
      {n > 1 && (
        <span aria-hidden style={{
          position: 'absolute', left: 34, top: -6, height: 12, width: 1,
          background: state === 'todo' ? 'var(--cth-ink-100)' : 'var(--cth-lilac)'
        }} />
      )}
      <span style={{
        width: 22, height: 22, flexShrink: 0, display: 'grid', placeItems: 'center',
        position: 'relative',   // sits ON the spine, so it needs to paint over it
        borderRadius: '50%',
        fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 11,
        // Done is filled quietly, current wears the brand, todo is an outline.
        background: state === 'done' ? 'var(--cth-lilac-light)'
          : current ? 'var(--cth-lilac)' : 'var(--cth-cream-100)',
        color: current ? 'var(--cth-on-accent)'
          : state === 'done' ? 'var(--cth-lilac)' : 'var(--cth-ink-500)'
      }}>{state === 'done' ? <Icon name="check" /> : n}</span>
      <span style={{
        fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13, lineHeight: '16px',
        color: current ? 'var(--cth-lilac-text)' : state === 'done' ? 'var(--cth-ink-700)' : 'var(--cth-ink-500)'
      }}>{label}</span>
    </div>
  );
}

/**
 * The audience question, as its own dialog.
 *
 * Narrower than the wizard and with no rail, no counter and no Back: it is one
 * question with two answers, and dressing it as step 1 of 7 made the setup look
 * longer than it is while the rail counted a screen that decides the rest.
 *
 * Clicking a card IS the answer — there is no second confirm, because there is
 * nothing to review and the choice is reversible in Settings later, which the
 * line under the cards says out loud.
 */
function PersonaDialog({ onPick }: { onPick: (audience: Audience) => void }) {
  const { t } = useTranslation();
  return (
    <div className="cth-ground" style={{
      position: 'fixed', inset: 0,
      display: 'flex', overflowY: 'auto',
      zIndex: 200, padding: 32
    }}>
      {/* Same auto-margin centering as the wizard: centered while it fits,
          scrollable the moment it does not. */}
      <div style={{
        width: 560, maxWidth: '94vw', margin: 'auto',
        display: 'flex', flexDirection: 'column',
        background: 'var(--cth-cream-50)',
        boxShadow: `inset 0 0 0 1px var(--cth-ink-100),
                    0 1px 2px rgba(17, 20, 24, 0.06),
                    0 24px 60px -12px rgba(17, 20, 24, 0.28)`,
        borderRadius: 'var(--cth-radius-card)'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          padding: '16px 20px',
          background: 'var(--cth-cream-100)',
          boxShadow: 'inset 0 -1px 0 var(--cth-ink-100)'
        }}>
          <AtlasMark size={30} />
          <span style={{
            fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 15,
            letterSpacing: '-0.2px', color: 'var(--cth-ink-900)'
          }}>{t('onboarding.setup.name')}</span>
        </div>

        <div style={{ padding: '22px 28px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h2 style={{
            margin: 0,
            fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 19,
            lineHeight: '26px', letterSpacing: '-0.3px', color: 'var(--cth-ink-900)'
          }}>{t('onboarding.titles.persona')}</h2>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 52, height: 52, flexShrink: 0,
              background: 'var(--cth-cream-100)',
              borderRadius: 'var(--cth-radius-card)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden'
            }}>
              <SpritePortrait character="michael" scale={2} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 16, lineHeight: '23px' }}>
                {t('onboarding.persona.headline')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--cth-ink-700)', lineHeight: '21px' }}>
                {t('onboarding.persona.body')}
                <span style={{ color: 'var(--cth-ink-500)' }}>{t('onboarding.persona.bodyLocal')}</span>
              </div>
            </div>
          </div>

          <div style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--cth-ink-900)' }}>
            {t('onboarding.persona.ask')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <PersonaCard
              icon="code"
              tone="var(--cth-sky)"
              tint="var(--cth-sky-light)"
              title={t('onboarding.persona.technicalTitle')}
              desc={t('onboarding.persona.technicalDesc')}
              selected={false}
              onClick={() => onPick('technical')}
            />
            <PersonaCard
              icon="sparkle"
              tone="var(--cth-peach)"
              tint="var(--cth-peach-light)"
              title={t('onboarding.persona.nonTechnicalTitle')}
              desc={t('onboarding.persona.nonTechnicalDesc')}
              selected={false}
              onClick={() => onPick('non-technical')}
            />
          </div>
          <div style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
            {t('onboarding.persona.later')}
          </div>
        </div>
      </div>
    </div>
  );
}

// Edge and focus ring come from `.cth-input` — the elements below carry the
// class. This drew itself in ink-100, the divider token, and set outline:none
// with nothing to replace it: the first field a new user ever meets had no
// visible boundary and no keyboard focus indicator.
const inputStyle: React.CSSProperties = {
  flex: 1,
  height: 40,
  padding: '0 12px',
  background: 'var(--cth-paper-100)',
  border: 'none',
  borderRadius: 'var(--cth-radius-input)',
  fontFamily: 'var(--cth-font-mono)',
  fontSize: 14,
  color: 'var(--cth-ink-900)'
};
