import { useEffect, useRef, useState } from 'react';
import { useStore, selectedAgent } from '@/store/store';
import { startMockLoop, stopMockLoop } from '@/store/mockEvents';
import type { HarnessConfig } from '@/store/config';
import { DEFAULT_ORG_TRIGGER } from '@shared/triggers';
import { OfficeFloor } from '@/scene/office/OfficeFloor';
import { useHive } from '@/hooks/useHive';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { useGodNameSync } from '@/i18n/useGodNameSync';
import { useDirectionSync } from '@/i18n/useDirection';
import { useArabicTerminalSync } from '@/terminal/useArabicTerminalSync';
import { AgentDetailPanel } from '@/components/AgentDetailPanel';
import { AddAgentModal } from '@/components/AddAgentModal';
import { useTranslation } from 'react-i18next';
import { MichaelBooting } from '@/components/MichaelBooting';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { HivePicker } from '@/components/HivePicker';
import { QuitWarningModal, type ClosingTimeState } from '@/components/QuitWarningModal';
import { CompletionToast } from '@/realtime/CompletionToast';
import { UpdateToast } from '@/components/UpdateToast';
import { useAppTheme, toggleAppTheme } from '@/design/theme';
import { SettingsModal, type Section as SettingsSection } from '@/components/SettingsModal';
import { PixelPanel } from '@/components/PixelPanel';
import { PixelButton } from '@/components/PixelButton';
import { Icon } from '@/components/Icon';
import { SidebarSplitter } from '@/components/SidebarSplitter';
import { acquireTerminal, notifyThemeChangeAll } from '@/components/terminalPool';
import { FullscreenTerminal } from '@/components/FullscreenTerminal';
import { AtlasMark } from '@/components/AtlasMark';
import { StatusGlyph } from '@/components/StatusGlyph';
import { MoonIcon, SunIcon, GearIcon, ExpandIcon, CollapseIcon } from '@/components/ChromeIcons';
import { TaskDetailOverlay } from '@/components/TaskDetailOverlay';
import { IdePanel } from '@/ide/IdePanel';
import { agentSlug, go, parseRoute, tabFromSlug, tabSlug, type Route, type TabKey } from '@/routes';

// Injected at build time from package.json (see electron.vite.config.ts).
declare const __APP_VERSION__: string;

export function App() {
  const { t } = useTranslation();
  // Point every {{godName}} string at the orchestrator's real, renameable name.
  useGodNameSync();
  // Mirror the document only for a user who has picked an RTL app language.
  useDirectionSync();
  // Let terminals that are ALREADY open follow a language switch too.
  useArabicTerminalSync();
  const agent = useStore(selectedAgent);
  const agents = useStore(s => s.agents);
  const agentCount = agents.length;
  const bootingGodName = useResolvedGodName();
  const addAgentOpen = useStore(s => s.addAgentOpen);
  const setAddAgentOpen = useStore(s => s.setAddAgentOpen);
  const clearPendingHires = useStore(s => s.clearPendingHires);
  const godStatus = useStore(s => s.godStatus);
  const fullscreenAgentId = useStore(s => s.fullscreenAgentId);
  const appThemeNow = useAppTheme();
  const sidebarWidth = useStore(s => s.sidebarWidth);
  const setSidebarWidth = useStore(s => s.setSidebarWidth);
  const ideOpen = useStore(s => s.ideOpen);
  const setIdeOpen = useStore(s => s.setIdeOpen);
  const ideAgentId = useStore(s => s.ideAgentId);
  const selectedId = useStore(s => s.selectedId);
  const sidebarTab = useStore(s => s.sidebarTab);
  const ccTab = useStore(s => s.ccTab);

  const [config, setConfig] = useState<HarnessConfig | null>(null);
  /** Live floor counts for the title bar. Derived rather than stored: the
   *  statuses already live on each agent, and a second copy would drift. */
  const fleet = useStore((st) => {
    let working = 0, blocked = 0, idle = 0;
    for (const a of st.agents) {
      if (a.archived) continue;
      if (a.status === 'blocked' || a.status === 'waiting') blocked++;
      else if (a.status === 'idle' || a.status === 'ghost') idle++;
      else working++;
    }
    return { working, blocked, idle };
  });
  // Whether the user has passed the launch-time hive picker this session. Starts
  // true (skip the picker) right after a hive SWITCH — changeHome relaunches and
  // leaves a one-shot localStorage flag so we don't bounce back onto the picker for
  // the hive we just chose. Also set true on onboarding completion (below).
  const [hiveOpened, setHiveOpenedState] = useState<boolean>(() => {
    try {
      if (window.localStorage.getItem('cth.skipHivePickerOnce')) {
        window.localStorage.removeItem('cth.skipHivePickerOnce');
        return true;
      }
    } catch { /* localStorage unavailable — show the picker */ }
    // Arriving on a link to a screen INSIDE a hive is a request to open it.
    const screen = parseRoute()?.screen;
    return screen === 'floor' || screen === 'agent' || screen === 'focus' || screen === 'ide';
  });
  // A mirror the route code can read synchronously. React state is one render
  // behind inside an effect that just set it, and the address bar is written
  // from an effect — a stale read there put the picker's URL on the office.
  const hiveOpenedRef = useRef(hiveOpened);
  const setHiveOpened = (v: boolean): void => { hiveOpenedRef.current = v; setHiveOpenedState(v); };
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Which tab Settings opens on. Set by a `cth:open-settings` deep link, reset
   *  to undefined (→ General) whenever the modal is opened the normal way. */
  const [settingsSection, setSettingsSection] = useState<SettingsSection | undefined>(undefined);
  const [quitWarn, setQuitWarn] = useState<{ ptyCount: number } | null>(null);
  const [closing, setClosing] = useState<ClosingTimeState | null>(null);
  const [vpWidth, setVpWidth] = useState<number>(window.innerWidth);

  // Deep link into Settings from anywhere in the tree. Settings' open state is
  // local to App, so a nested control (e.g. "set it now" beside a disabled Talk
  // button) has no path to it without threading a prop through every layer
  // between; a window event keeps that plumbing out of the components in
  // between, matching the existing `cth:` CustomEvent convention.
  useEffect(() => {
    const onOpenSettings = (e: Event): void => {
      const section = (e as CustomEvent<{ section?: SettingsSection }>).detail?.section;
      setSettingsSection(section);
      setSettingsOpen(true);
    };
    window.addEventListener('cth:open-settings', onOpenSettings);
    return () => window.removeEventListener('cth:open-settings', onOpenSettings);
  }, []);

  // Initial config load
  useEffect(() => {
    let cancelled = false;
    window.cth.getConfig().then(c => {
      if (cancelled) return;
      setConfig(c);
      // Mirror the active office theme so OfficeFloor renders it (gated on the
      // tvShowOffices flag; off = always the office). Settings keeps this synced.
      useStore.getState().setOfficeTheme(c.tvShowOffices ? (c.officeTheme ?? 'office') : 'office');
      // Mirror the triggers so Settings → Connections and the Command Center's
      // Triggers tab read one list, not two copies that drift — whichever surface
      // saves calls these same setters and the other repaints. No extra IPC: main
      // deep-fills both fields on every config read (withTriggerDefaults), so
      // getConfig() already serves what listWebhooks()/getOrgTrigger() would.
      // `c` is typed as the PRELOAD's HarnessConfig, which hasn't picked the two
      // fields up yet (another lane's file); the renderer mirror type declares them.
      const withTriggers = c as HarnessConfig;
      useStore.getState().setWebhookTriggers(withTriggers.webhookTriggers ?? []);
      useStore.getState().setOrgTrigger(withTriggers.orgTrigger ?? DEFAULT_ORG_TRIGGER);
    });
    // Mirror BYOK OpenAI key presence (boolean only; the key never leaves main) so the
    // Realtime Michael voice toggle can gate on it. Lives in the secret broker, not
    // config — so fetch it rather than derive from c.
    window.cth.realtimeHasOpenAiKey().then(has => {
      if (!cancelled) useStore.getState().setHasOpenAiKey(has);
    });
    return () => { cancelled = true; };
  }, []);

  // Free Flow entry point B — hold-Option (⌥) to talk. In-renderer push-to-talk
  // for whichever agent the user is viewing; gated on the flag, terminal-safe

  // Config subscription — the copy loaded above would otherwise go stale the
  // moment anything saves a setting.
  useEffect(() => window.cth.onConfigChanged(setConfig), []);

  // Quit warning subscription
  useEffect(() => window.cth.onCloseRequested((info) => setQuitWarn(info)), []);

  // Shareable hires: a validated manifest arriving via the munderdifflin://
  // deep link (or file import) pre-fills the Add-Agent modal. Never spawns by itself.
  const enqueuePendingHires = useStore(s => s.enqueuePendingHires);
  const closeAddAgentReview = () => {
    clearPendingHires();
    setAddAgentOpen(false);
  };
  useEffect(() => {
    const unsub = window.cth.onHireImport?.((m) => {
      enqueuePendingHires([m]);
      setAddAgentOpen(true);
    });
    // Pull anything that arrived before this subscription existed (cold-start
    // deep links; packaged renderers load too fast for push-on-load).
    void window.cth.drainPendingHires?.().then((queued) => {
      if (queued && queued.length > 0) {
        enqueuePendingHires(queued);
        setAddAgentOpen(true);
      }
    });
    return unsub;
  }, [enqueuePendingHires, setAddAgentOpen]);
  useEffect(() => window.cth.onHireError?.((info) => {
    console.error('[hire] import failed:', info.error);
  }), []);

  // Closing-time progress: drives the quit dialog's "wrapping up" view. The
  // dialog stays up through the whole protocol; on 'complete' the main process
  // tears down and quits by itself moments later.
  useEffect(() => window.cth.onClosingTime?.((ev) => {
    if (ev.phase === 'cancelled') { setClosing(null); return; }
    setClosing({ phase: ev.phase, acked: ev.acked, total: ev.total });
    if (ev.phase === 'started' || ev.phase === 'progress') setQuitWarn((w) => w ?? { ptyCount: 0 });
  }), []);

  const startClosingTime = async () => {
    const res = await window.cth.startClosingTime();
    if (!res.ok) setClosing({ phase: 'error', acked: 0, total: 0, error: res.error });
  };
  const cancelClosingTime = () => {
    void window.cth.cancelClosingTime();
    setClosing(null);
  };

  // The hive: god-agent bootstrap, hook-driven avatars, idle-agent waking. Held
  // off until the user opens a hive in the launch picker (passing null no-ops the
  // hook) so Michael doesn't boot against the current home while the user may be
  // about to switch to a different one.
  useHive(hiveOpened ? config : null);

  // Pre-warm a persistent terminal for every live agent so its output is
  // buffered from spawn. Switching agents then re-attaches an already-rendered
  // terminal instantly (with full history) instead of building a blank one.
  useEffect(() => {
    for (const a of agents) if (a.ptyId) acquireTerminal(a.ptyId);
  }, [agents]);

  // Synthetic demo loop — CAGED (#5B). It must never animate alongside a live
  // hive (it would fire fake envelope handoffs and step seeded agents). Run it
  // only as an explicit showcase (VITE_CTH_DEMO=1 in dev) or on a genuinely
  // empty floor, and stop it the instant the first real PTY agent appears
  // (Michael always spawns, so in normal operation it effectively never runs).
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    const DEMO = import.meta.env.DEV && import.meta.env.VITE_CTH_DEMO === '1';
    const evaluate = () => {
      const hasLive = useStore.getState().agents.some((a) => a.ptyId);
      if (DEMO || !hasLive) startMockLoop();
      else stopMockLoop();
    };
    evaluate();
    const unsub = useStore.subscribe(evaluate);
    return () => { unsub(); stopMockLoop(); };
  }, [config?.onboardingComplete]);

  // Reconcile restored agents against the PTYs still alive in the main process.
  // After a renderer reload (e.g. the laptop slept and Vite reloaded the page),
  // this keeps agents whose process survived and drops any that truly died.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    let cancelled = false;
    window.cth.listPtys().then((list) => {
      if (cancelled) return;
      useStore.getState().reconcileWithLivePtys(list.map((p) => p.id));
    }).catch(() => { /* ignore — keep restored agents as-is */ });
    return () => { cancelled = true; };
  }, [config?.onboardingComplete]);

  // Re-apply the persisted focus-mode preference as the roster fills in.
  //
  // Not a one-shot at store construction: at launch every restored agent still
  // carries the PREVIOUS session's PTY id, so the reconcile above prunes the lot
  // and correctly drops focus mode to null before god has respawned. The
  // preference therefore has to be re-checked once agents with live terminals
  // actually exist. `restoreFocusMode` is a no-op unless the preference is on and
  // focus mode is currently off, so re-running it on every roster change is safe
  // and pressing Esc stays sticky.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    useStore.getState().restoreFocusMode();
  }, [config?.onboardingComplete, agents]);

  // ── Screen routes ─────────────────────────────────────────────────────────
  // The address bar names the screen you are on, and back/forward walk them.
  // Modals stay out of it: a dialog is something you opened on top of a screen.
  //
  // One writer, `syncBar`, and it reads the STORE rather than this render's
  // props — a link applied in an effect changes the store immediately, and a
  // write from stale closure values would overwrite the link just followed.
  const deepLink = useRef<Route | null>(null);

  const syncBar = (correcting = false): void => {
    const st = useStore.getState();
    const tab = tabFromSlug(tabSlug(st.ccTab as TabKey)) ?? 'terminal';
    /** The bar names an agent by what it is called. */
    const slugOf = (id: string | null | undefined): string => {
      const a = st.agents.find((x) => x.id === id);
      return a ? agentSlug(a.name, a.id) : (id ?? '');
    };
    go(
      !hiveOpenedRef.current ? { screen: 'workspaces' }
        : st.fullscreenAgentId ? { screen: 'focus', agentId: slugOf(st.fullscreenAgentId), tab }
        : st.ideOpen ? { screen: 'ide', agentId: st.ideAgentId ? slugOf(st.ideAgentId) : undefined }
        : st.selectedId ? { screen: 'agent', agentId: slugOf(st.selectedId), tab }
        : { screen: 'floor' },
      // Correcting a hash nothing answers is not a place you navigated to, so
      // it must not become one you can go back to.
      { replace: correcting }
    );
  };

  useEffect(() => {
    if (!config?.onboardingComplete) return;
    const apply = (): void => {
      const r = parseRoute();
      // Nothing answers this hash (empty, mistyped, or a setup step long past):
      // put the screen we are actually on back in the bar.
      if (!r || r.screen === 'setup') { syncBar(true); return; }
      if (r.screen === 'workspaces') { setHiveOpened(false); return; }
      setHiveOpened(true);
      const st = useStore.getState();
      const slug = 'agentId' in r ? r.agentId : undefined;
      const routedAgent = slug
        ? (st.agents.find((a) => agentSlug(a.name, a.id) === slug)?.id
            ?? st.agents.find((a) => a.id === slug)?.id
            ?? slug)
        : undefined;
      if (routedAgent && !st.agents.some((a) => a.id === routedAgent)) {
        // Roster still loading: hold the link and retry when it lands. If the
        // roster HAS loaded and that agent is simply gone, drop the link and let
        // the correction below name the screen we are really on.
        deepLink.current = st.agents.length ? null : r;
        if (deepLink.current) return;
      } else {
        deepLink.current = null;
        // Every setter is guarded on a real difference: setFullscreen persists a
        // focus-mode preference, so calling it redundantly would rewrite it.
        const focus = r.screen === 'focus' ? r.agentId : null;
        if (st.fullscreenAgentId !== focus) st.setFullscreen(focus);
        const ide = r.screen === 'ide';
        if (st.ideOpen !== ide) st.setIdeOpen(ide, ide ? (r.agentId ?? null) : null);
        if (routedAgent && st.selectedId !== routedAgent) st.select(routedAgent);
        // The tab is part of the address too, so a link opens the pane it names.
        if ((r.screen === 'agent' || r.screen === 'focus') && r.tab && st.ccTab !== r.tab) {
          st.setCcTab(r.tab);
        }
      }
      syncBar(true);
    };
    apply();
    // Back/forward fire popstate; our own go() fires cth:route, because
    // pushState does not notify anyone by design.
    window.addEventListener('popstate', apply);
    window.addEventListener('cth:route', apply);
    return () => {
      window.removeEventListener('popstate', apply);
      window.removeEventListener('cth:route', apply);
    };
  }, [config?.onboardingComplete]);

  // A held link, retried as the roster arrives.
  useEffect(() => {
    if (deepLink.current && agents.length) window.dispatchEvent(new Event('cth:route'));
  }, [agents]);

  // Moving around the app writes the bar.
  useEffect(() => {
    if (!config?.onboardingComplete || deepLink.current) return;
    syncBar();
  }, [config?.onboardingComplete, hiveOpened, fullscreenAgentId, ideOpen, ideAgentId, selectedId, ccTab]);

  // Track viewport width for splitter clamping
  useEffect(() => {
    const onResize = () => setVpWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!config) {
    return <div style={{ width: '100vw', height: '100vh', background: 'var(--cth-cream-100)' }} />;
  }

  if (!config.onboardingComplete) {
    // Just-onboarded users go straight into the hive they set up — skip the picker.
    return <OnboardingWizard onComplete={(next) => { setConfig(next); setHiveOpened(true); }} />;
  }

  // Launch-time hive picker: on reopen, let the user open their current hive,
  // switch to a recent one, or open/create another. Skipped right after onboarding
  // and right after a switch-relaunch (see hiveOpened init).
  if (!hiveOpened) {
    return <HivePicker config={config} onOpenCurrent={() => setHiveOpened(true)} />;
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100vw', height: '100vh',
      overflow: 'hidden'
    }}>
      {/* rt-12: global fixed-overlay toast for voice-Michael completions ("Oscar
          finished X"). Self-positions bottom-right; renders null until one arrives. */}
      <CompletionToast />
      {/* v0.3.4: background-update toast ("restart to update"); renders null until
          main's updater pushes a status. */}
      <UpdateToast />
      {/* Title bar */}
      <div
        className="cth-titlebar-drag"
        style={{
          height: 'var(--cth-titlebar-h)', minHeight: 'var(--cth-titlebar-h)',
          // Above the fullscreen terminal (250) and the IDE (290): the header is
          // the one thing that never goes away, so it cannot be something an
          // overlay paints over.
          position: 'relative', zIndex: 400,
          background: 'linear-gradient(100deg, color-mix(in srgb, var(--cth-lilac) 13%, var(--cth-paper-100)) 0%, color-mix(in srgb, #3B82F6 8%, var(--cth-paper-100)) 38%, var(--cth-paper-100) 72%)',
          borderBottom: 'none',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 96,
          paddingRight: 16,
          gap: 10,
          userSelect: 'none'
        }}
      >
        {/* The signature: the bar's bottom edge is a 2px gradient that starts in
            the brand colour under the mark and fades into an ordinary hairline
            across the window. One deliberate graphic gesture; everything else in
            the bar stays quiet and white. */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 3,
            background: 'linear-gradient(90deg, #6B4BFF 0%, #5B3DF5 34%, #4A6BF5 68%, #3B82F6 100%)'
          }}
        />
        {/* The wordmark, and nothing else. This bar held a pixel portrait, a
            version chip and a running commentary on auto mode — three things
            competing for the calmest strip in the app, none of them something
            you act on. Updates live in Settings, and auto mode is a switch in
            the agent's own header, where it can actually be flipped. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, userSelect: 'none' }}>
          {/* The mark carries its own tile, gradient and shadow. Wrapping it in a
              coloured square was two competing shapes doing one job. */}
          <span style={{
            display: 'inline-flex', flexShrink: 0,
            borderRadius: 'var(--cth-radius-btn)',
            boxShadow: '0 2px 8px color-mix(in srgb, var(--cth-lilac) 34%, transparent)'
          }}>
            <AtlasMark size={32} />
          </span>
          {/* Sentence case, 17px, tight tracking. ATLAS in caps at 14px was a
              label; a wordmark should look like a name. */}
          <span style={{
            fontFamily: 'var(--cth-font-ui)', fontWeight: 700,
            fontSize: 17, lineHeight: '20px', letterSpacing: '-0.5px',
            color: 'var(--cth-ink-900)'
          }}>Atlas</span>

          {/* Which floor you are standing on. It was only ever visible inside the
              agent panel, which is the one place you already know the answer. */}
          {config.harnessHome && (
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                marginInlineStart: 4, padding: '4px 10px',
                borderRadius: 'var(--cth-radius-pill)',
                background: 'var(--cth-cream-100)',
                fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 500,
                color: 'var(--cth-ink-700)', maxWidth: 240,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 7.2a2 2 0 012-2h3.9l1.8 2.1H19a2 2 0 012 2v8.5a2 2 0 01-2 2H5a2 2 0 01-2-2V7.2z"
                  stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
              {config.harnessHome.split('/').filter(Boolean).pop()}
            </span>
          )}
        </span>

        {/* v0.3.4: theme + fullscreen live HERE (top right), not buried in the
            terminal header — and the theme darkens the whole app, terminals
            included (design/theme.ts + tokens.css dark block). */}
        {/* One line, dead centre, answering the only question the chrome can
            usefully answer: does anything want me. It is centred against the
            WINDOW rather than the space between the two clusters, so it does
            not drift when the workspace name is long. */}
        <span
          aria-live="polite"
          style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 500,
            color: fleet.blocked > 0 ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)',
            pointerEvents: 'none', whiteSpace: 'nowrap'
          }}
        >
          {fleet.blocked > 0 ? (
            <>
              <span style={{ display: 'inline-flex', color: 'var(--cth-status-blocked)' }}>
                <StatusGlyph status="blocked" size={15} />
              </span>
              {fleet.blocked === 1 ? '1 agent needs you' : `${fleet.blocked} agents need you`}
            </>
          ) : fleet.working > 0 ? (
            <>
              <span style={{ display: 'inline-flex', color: 'var(--cth-status-working)' }}>
                <StatusGlyph status="working" size={15} />
              </span>
              {fleet.working === 1 ? '1 agent working' : `${fleet.working} agents working`}
              <span style={{ color: 'var(--cth-ink-400)' }}>·</span>
              nothing needs you
            </>
          ) : fleet.idle > 0 ? (
            <>
              <span style={{ display: 'inline-flex', color: 'var(--cth-status-idle)' }}>
                <StatusGlyph status="idle" size={15} />
              </span>
              {fleet.idle === 1 ? '1 agent free and waiting for work' : `${fleet.idle} agents free and waiting for work`}
            </>
          ) : (
            <>
              <span style={{ display: 'inline-flex', color: 'var(--cth-ink-400)' }}>
                <StatusGlyph status="ghost" size={15} />
              </span>
              Nobody on the floor yet. Add an agent to start.
            </>
          )}
        </span>

        <span style={{ marginLeft: 'auto' }} />

        <button
          className="cth-titlebar-nodrag"
          onClick={() => setAddAgentOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            height: 34, padding: '0 16px', flexShrink: 0,
            border: 'none', borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
            background: 'var(--cth-lilac)', color: '#FFFFFF',
            boxShadow: 'var(--cth-shadow-btn)',
            fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 600,
            transition: 'background 120ms ease'
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3.4v9.2M3.4 8h9.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          Add agent
        </button>

        <span style={{
          width: 1, height: 22, flexShrink: 0, marginInline: 6,
          background: 'var(--cth-ink-100)'
        }} />

        <button
          className="cth-titlebar-nodrag"
          onClick={() => {
            const next = toggleAppTheme();
            // Tell every RUNNING program the theme flipped. xterm repaints its own
            // cells, but a TUI that painted its panels with explicit colours keeps
            // them until it redraws, which left OpenCode's boxes in the old palette
            // until the agent restarted. Only programs that enabled DEC mode 2031
            // are told, and it is every pooled terminal rather than the visible one,
            // so a background agent is not stale when you switch to it.
            notifyThemeChangeAll(next === 'dark' ? 'dark' : 'light');
            // Mirror into the harness config: every agent (re)spawned from now
            // on gets the matching `theme` in its per-session Claude settings,
            // so the TUI's truecolor palette fits the terminal. Scoped to
            // harness agents — the user's global Claude theme is never touched.
            void window.cth.updateConfig({ terminalTheme: next });
          }}
          aria-label="Toggle dark mode"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, padding: 0,
            background: 'transparent',
            boxShadow: 'none',
            border: 'none', borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
            transition: 'background 120ms ease, color 120ms ease',
            color: appThemeNow === 'dark' ? 'var(--cth-lemon)' : 'var(--cth-indigo)'
          }}
        >
          {appThemeNow === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        {/* v0.3.4: the IDE button moved to agent level — every agent's header
            (sidebar detail, god Command Center, fullscreen) carries it. */}
        <button
          className="cth-titlebar-nodrag cth-settings-btn"
          onClick={() => { setSettingsSection(undefined); setSettingsOpen(true); }}
          aria-label="Settings"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, padding: 0,
            background: 'transparent',
            boxShadow: 'none',
            border: 'none', borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
            transition: 'background 120ms ease, color 120ms ease',
            color: 'var(--cth-jade)'
          }}
        >
          <GearIcon />
        </button>
        {/* Fullscreen. The title bar is chrome, not canvas, so these two use
            clean stroke icons rather than the 16x16 pixel set the rest of the UI
            is drawn in — at 16-18px a pixel-grid glyph reads as a rendering
            artifact next to the OS window controls, not as a style choice. */}
        <button
          className="cth-titlebar-nodrag"
          onClick={() => {
            if (fullscreenAgentId) { useStore.getState().setFullscreen(null); return; }
            const all = useStore.getState().agents;
            const target = all.find((x) => x.id === useStore.getState().selectedId && x.ptyId)
              ?? all.find((x) => x.isGod && x.ptyId)
              ?? all.find((x) => x.ptyId);
            if (target) useStore.getState().setFullscreen(target.id);
          }}
          aria-label="Toggle focus mode"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, padding: 0,
            background: 'transparent',
            boxShadow: 'none',
            border: 'none', borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
            transition: 'background 120ms ease, color 120ms ease',
            color: 'var(--cth-sky)'
          }}
        >
          {fullscreenAgentId ? <CollapseIcon /> : <ExpandIcon />}
        </button>

      </div>

      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex',
        // Panel first, floor second. Reading order is left to right, and the
        // panel is where the work is; the floor is the view.
        flexDirection: 'row-reverse',
        padding: 16,
        gap: 0
      }}>
        <div className="cth-stage-card" style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>
          <OfficeFloor />
          {agentCount === 0 && godStatus === 'booting' && <MichaelBooting />}
          {agentCount === 0 && godStatus !== 'booting' && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none'
            }}>
              <div style={{ pointerEvents: 'auto', width: 360 }}>
                <PixelPanel variant="dialog" title="Empty floor" noPadding>
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: '20px' }}>
                      No agents on the floor yet. Spawn one to see real claude output stream in here.
                    </p>
                    <PixelButton variant="primary" size="md" onClick={() => setAddAgentOpen(true)}>
                      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                        <Icon name="plus" /> Add agent
                      </span>
                    </PixelButton>
                  </div>
                </PixelPanel>
              </div>
            </div>
          )}
        </div>

        <SidebarSplitter
          width={sidebarWidth}
          onChange={setSidebarWidth}
          viewportWidth={vpWidth}
        />

        <div className="cth-brand-panel" style={{
          width: sidebarWidth, flexShrink: 0,
          minHeight: 0, display: 'flex', flexDirection: 'column'
        }}>
          {agent ? (
            <AgentDetailPanel agent={agent} />
          ) : godStatus === 'booting' ? (
            <PixelPanel variant="default" noPadding style={{
              padding: 16, height: '100%',
              display: 'flex', flexDirection: 'column',
              justifyContent: 'center', alignItems: 'center', gap: 12
            }}>
              {/* The same three brand dots as the boot card, so the two things
                  you see while waiting look like one app. */}
              <div style={{ display: 'flex', gap: 7 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--cth-lilac)',
                    animation: 'cth-boot-pulse 1.1s ease-in-out infinite',
                    animationDelay: `${i * 0.16}s`
                  }} />
                ))}
              </div>
              <div style={{
                fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 13, lineHeight: '16px',
                color: 'var(--cth-ink-900)'
              }}>{t('floor.wakingTitle')}</div>
              <p style={{
                margin: 0, fontSize: 12.5, lineHeight: '18px',
                textAlign: 'center', color: 'var(--cth-ink-500)'
              }}>{t('floor.wakingLine', { godName: bootingGodName })}</p>
            </PixelPanel>
          ) : (
            <PixelPanel variant="default" noPadding style={{
              padding: 16, height: '100%',
              display: 'flex', flexDirection: 'column',
              justifyContent: 'center', alignItems: 'center', gap: 12
            }}>
              <div style={{
                fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 13, lineHeight: '16px',
                color: 'var(--cth-ink-900)'
              }}>{t('floor.noAgentTitle')}</div>
              <p style={{
                margin: 0, fontSize: 12.5, lineHeight: '18px',
                textAlign: 'center', color: 'var(--cth-ink-500)'
              }}>{t('floor.noAgentLine')}</p>
              <PixelButton variant="primary" size="md" onClick={() => setAddAgentOpen(true)}>
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <Icon name="plus" /> {t('agentStrip.addAgent')}
                </span>
              </PixelButton>
            </PixelPanel>
          )}
        </div>
      </div>

      {addAgentOpen && (
        <AddAgentModal
          onClose={closeAddAgentReview}
          config={config}
          onConfigChange={setConfig}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          config={config}
          initialSection={settingsSection}
          onClose={() => { setSettingsOpen(false); setSettingsSection(undefined); }}
        />
      )}

      {quitWarn && (
        <QuitWarningModal
          ptyCount={quitWarn.ptyCount}
          closing={closing}
          onCancel={() => {
            if (closing) cancelClosingTime();
            window.cth.cancelClose();
            setQuitWarn(null);
          }}
          onConfirm={async () => { await window.cth.confirmClose(); }}
          onClosingTime={startClosingTime}
        />
      )}

      {fullscreenAgentId && <FullscreenTerminal config={config} />}
      {ideOpen && <IdePanel />}
      <TaskDetailOverlay />
    </div>
  );
}

/* ── Title-bar glyphs ────────────────────────────────────────────────────────
   Stroke icons on a 16 unit box, inheriting `currentColor` so they follow the
   theme exactly as the pixel set does. Deliberately NOT added to
   components/Icon.tsx: that library is the app's pixel-art identity and is used
   at tab and card scale, where the pixel grid is the point. These three sit
   beside the OS traffic lights, which is the one place that identity reads as a
   blurry asset rather than a decision. */
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth={1.4}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >{children}</svg>
  );
}

/** Four outward corner brackets — enter fullscreen. */

/** The same brackets turned inward — leave fullscreen. */

/** A wrench. The previous glyph was a hub with eight radiating spokes, which at
 *  18px is indistinguishable from a sun — sitting immediately beside a theme
 *  toggle whose light-mode icon IS a sun. A tool shape carries "settings"
 *  without competing with its neighbour. Drawn on a 24 box for curve headroom
 *  and rendered at 16. */
