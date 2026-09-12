import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelBadge } from './PixelBadge';
import { PixelButton } from './PixelButton';
import { SpritePortrait } from './SpritePortrait';
import { PtyTerminalView } from './PtyTerminalView';
import { MessageQueueComposer } from './MessageQueueComposer';
import { TasksKanban } from './TasksKanban';
import { AskMeTab } from './AskMeTab';
import { TriggersTab } from './triggers/TriggersTab';
import { WorkersTab } from './WorkersTab';
import { SkillsTab } from './SkillsTab';
import { acquireTerminal, disposeTerminal, resetTerminal } from './terminalPool';
import { terminalInstanceKey } from './terminalRecovery';
import { Icon } from './Icon';
import { StatusGlyph } from './StatusGlyph';
import { Dropdown } from './Dropdown';
import {
  TerminalIcon, BellIcon, TasksIcon, TeamIcon, MemoryIcon,
  MapIcon, EventsIcon, JobsIcon, TriggersIcon, SkillsIcon, EditIcon, CodeIcon
} from './TabIcons';
import { ErrorBoundary } from './ErrorBoundary';
import { useOpenAsks } from '@/hooks/useOpenAsks';
import { EditAgentModal } from './EditAgentModal';
import { MemoryPanel } from './MemoryPanel';
import { MemoryGraphPanel } from './MemoryGraphPanel';
import { useFleetTelemetry } from '@/hooks/useTelemetry';
import { COMMAND_GROUPS } from '@shared/claudeCommands';
import { roleForHiveSpawn } from '@shared/agentRole';
import { useStore, type Agent } from '@/store/store';
import { usePtyParser } from '@/hooks/usePtyParser';
import {
  buildSpawnCommand,
  decodeProviderModel,
  encodeProviderModel,
  inferAgentProvider,
  isClaudeProvider,
  modelProvidersForAgent,
  modelsForProvider,
  providerPreset,
  tokenizeCommand,
  AGENT_PROVIDER_PRESETS,
  type AgentProvider
} from '@/store/config';
import { canReceiveInbox } from '@shared/agentProvider';
import { isComposingKey } from '@shared/imeGuard';
import { useRtl } from '@/i18n/useDirection';

/** Michael's control surface. Shown instead of the plain terminal/files panel
 *  when the god agent is selected: terminal + queue, the floor roster (with
 *  per-agent model + dispatch + assistant access), a memory view, and a live
 *  activity feed / board / usage meter. */

// Both the AskMe (#human) tab and the Triggers tab live here. Triggers replaced
// the old Schedules tab: schedules are now one of four trigger types, and the
// whole surface lives in ./triggers (see src/shared/triggers.ts for the contract).
type CCTab = 'terminal' | 'floor' | 'tasks' | 'human' | 'triggers'
  | 'memory' | 'graph' | 'activity' | 'skills' | 'workers';

/** Fallback denominator for the per-agent token meter when no floor token budget
 *  is configured — so the bar reads as a budget estimate (filled + remaining)
 *  rather than being pinned to 100% for whichever agent burns the most tokens. */
const DEFAULT_TOKEN_CAP = 1_000_000;

/** A GitHub issue as returned by `window.cth.githubIssues` (labels/assignees flattened). */

const fmtK = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`);

/** Tab order is FREQUENCY, not category.
 *
 *  The first four are the ones you open all day, and they lead — "Needs you"
 *  above all, because it is the only screen where the floor is waiting on YOU
 *  and every hour it sits unseen is an hour of work not happening. The rest sit
 *  in a second, quieter row: still one click, never competing.
 *
 *  Labels say what the screen is FOR rather than what it is called internally:
 *  "monitor" became Team, "workers" became Jobs, "graph" became Memory map. Each
 *  carries a one-line hint on hover, because a two-word tab cannot explain
 *  itself and a first-time reader should not have to click all eleven to learn
 *  the app. */
const PRIMARY: CCTab[] = ['terminal', 'human', 'tasks', 'floor'];

const TABS: {
  key: CCTab; labelKey: string; hintKey: string;
  Glyph: (p: { size?: number }) => JSX.Element;
  /** A colour per destination, so ten glyphs are not ten grey squares. Shown
   *  only when the tab is NOT selected: a selected pill is already the loudest
   *  thing in the row, and a second colour inside it fights the fill. */
  tone: string;
}[] = [
  { key: 'terminal', labelKey: 'commandCenter.tabs.terminal', hintKey: 'commandCenter.tabHints.terminal', Glyph: TerminalIcon, tone: 'var(--cth-status-idle)' },
  { key: 'human',    labelKey: 'commandCenter.tabs.human',    hintKey: 'commandCenter.tabHints.human',    Glyph: BellIcon, tone: 'var(--cth-coral)' },
  { key: 'tasks',    labelKey: 'commandCenter.tabs.tasks',    hintKey: 'commandCenter.tabHints.tasks',    Glyph: TasksIcon, tone: 'var(--cth-mint)' },
  { key: 'floor',    labelKey: 'commandCenter.tabs.floor',    hintKey: 'commandCenter.tabHints.floor',    Glyph: TeamIcon, tone: 'var(--cth-lemon)' },
  { key: 'memory',   labelKey: 'commandCenter.tabs.memory',   hintKey: 'commandCenter.tabHints.memory',   Glyph: MemoryIcon, tone: 'var(--cth-plum)' },
  { key: 'graph',    labelKey: 'commandCenter.tabs.graph',    hintKey: 'commandCenter.tabHints.graph',    Glyph: MapIcon, tone: 'var(--cth-sky)' },
  { key: 'activity', labelKey: 'commandCenter.tabs.activity', hintKey: 'commandCenter.tabHints.activity', Glyph: EventsIcon, tone: 'var(--cth-peach)' },
  { key: 'workers',  labelKey: 'commandCenter.tabs.workers',  hintKey: 'commandCenter.tabHints.workers',  Glyph: JobsIcon, tone: 'var(--cth-jade)' },
  { key: 'triggers', labelKey: 'commandCenter.tabs.triggers', hintKey: 'commandCenter.tabHints.triggers', Glyph: TriggersIcon, tone: 'var(--cth-indigo)' },
  { key: 'skills',   labelKey: 'commandCenter.tabs.skills',   hintKey: 'commandCenter.tabHints.skills',   Glyph: SkillsIcon, tone: 'var(--cth-rose)' }
];

/** @param fullscreen this instance IS the fullscreen overlay, so it owns the pty
 *  and renders the real terminal. The docked instance renders the "open in
 *  fullscreen" placeholder instead — two live xterms on one pty fight over its
 *  cols/rows and corrupt the display. */
export function CommandCenterPanel({ agent, fullscreen = false }: { agent: Agent; fullscreen?: boolean }) {
  const { t } = useTranslation();
  // The open tab lives in the store: the address bar names it, and a reload
  // has to land on the same one.
  const tab = useStore((st) => st.ccTab) as CCTab;
  const setTab = (next: CCTab): void => useStore.getState().setCcTab(next);
  // Atlas had no way to be edited: AgentDetailPanel hands god straight to this
  // panel and never reaches the Edit button every other agent gets, so his
  // name, one-liner and standing goal were unreachable from the app.
  const [editOpen, setEditOpen] = useState(false);
  // Every tab is visible now: the one config-gated tab was the trigger ledger,
  // and it went with the webhooks whose arrivals it listed.
  const visibleTabs = TABS;
  const primaryTabs = visibleTabs.filter((x) => PRIMARY.includes(x.key));
  const secondaryTabs = visibleTabs.filter((x) => !PRIMARY.includes(x.key));
  // The one number on this panel that is about the human, not the machines.
  const openAsks = useOpenAsks();
  /** Focus mode has no roster, so the header carries the other agents. */
  const agents = useStore((st) => st.agents);

  // External tab requests (the office task board → 'tasks', the boss-room
  // calendar → 'triggers'). seq-keyed so clicking again re-opens the tab even
  // if it was already requested.
  const ccTabRequest = useStore((s) => s.ccTabRequest);
  useEffect(() => {
    if (!ccTabRequest) return;
    const key = ccTabRequest.tab as CCTab;
    if (!TABS.some((t) => t.key === key)) return;
    setTab(key);
  }, [ccTabRequest]);
  // A task-detail "assign" pre-fills the Floor dispatch box and jumps to it.
  // Seeded via the store one-shot (the detail overlay lives app-wide now);
  // { seq } makes every assign distinct so identical text re-seeds.
  const [dispatchSeed, setDispatchSeed] = useState<{ text: string; seq: number }>({ text: '', seq: 0 });
  const dispatchSeedRequest = useStore((s) => s.dispatchSeedRequest);
  useEffect(() => {
    if (!dispatchSeedRequest) return;
    setDispatchSeed({ text: dispatchSeedRequest.text, seq: dispatchSeedRequest.seq });
  }, [dispatchSeedRequest]);
  // Lifted so the memory-graph tab can jump to a specific agent's memory file.
  const [selectedMemoryAgent, setSelectedMemoryAgent] = useState<string | null>(null);
  const updateAgent = useStore((s) => s.updateAgent);
  const setFullscreen = useStore((s) => s.setFullscreen);
  const fullscreenAgentId = useStore((s) => s.fullscreenAgentId);
  const onPtyStream = usePtyParser(agent.id);
  // True only for the DOCKED panel while the overlay holds this agent.
  const isFullscreenedHere = fullscreenAgentId === agent.id && !fullscreen;
  // What it is doing NOW while it works; where it lives when it is not.
  const headerLine = (agent.status !== 'idle' && agent.action)
    ? agent.action
    : (agent.description?.trim() || (agent.isGod ? t('commandCenter.roleGod') : t('commandCenter.roleWorker')));
  // Context as a number, not a bar: in a header the useful question is how much
  // room is left before a compaction, and a 4px rail cannot answer it.
  // What is actually running in the terminal below, in the words the picker
  // used when it was chosen — not the raw model id, and not the pty handle the
  // header used to print.
  const agentProvider = agent.provider ?? 'claude';
  const engineLabel = [
    providerPreset(agentProvider).label,
    agent.model
      ? (modelsForProvider(agentProvider).find((m) => m.id === agent.model)?.label ?? agent.model)
      : ''
  ].filter(Boolean).join(' · ');

  // Below 1k there is nothing to report and the rounding says "0k", which reads
  // as a broken gauge rather than as a session that has barely started.
  const contextLimit = agent.contextLimit ?? (/1m/i.test(agent.model ?? '') ? 1_000_000 : 200_000);
  const contextPct = (agent.contextTokens ?? 0) >= 1000
    ? Math.min(100, Math.round(((agent.contextTokens as number) / contextLimit) * 100))
    : null;
  const contextLine = (agent.contextTokens ?? 0) >= 1000
    ? `${fmtK(agent.contextTokens as number)}/${fmtK(agent.contextLimit ?? (/1m/i.test(agent.model ?? '') ? 1_000_000 : 200_000))}`
    : '';

  /** One pane, by key. Pulled out of the tab switch so focus mode can render
   *  several at once: at 1700px the panel was showing one column and hiding
   *  nine, which is a tab bar earning its keep in a 420px sidebar and wasting
   *  the screen everywhere else. */
  const paneFor = (key: CCTab) => (
    <>
      {key === 'terminal' && (
                isFullscreenedHere ? (
                  <Centered>{t('commandCenter.terminalFullscreen')}</Centered>
                ) : agent.ptyId ? (
                  <>
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
                      <PtyTerminalView
                        key={terminalInstanceKey(agent.ptyId, agent.terminalGeneration)}
                        ptyId={agent.ptyId}
                        label={engineLabel}
                        onStreamData={onPtyStream}
                        onUserPrompt={(t) => {
                          updateAgent(agent.id, { lastPrompt: t });
                          if (t.trim().toLowerCase() === '/clear') {
                            updateAgent(agent.id, { contextTokens: 0, contextLimit: undefined, progress: 0 });
                          }
                          void window.cth.historyAdd({ agentId: agent.id, cwd: agent.cwd, text: t });
                        }}
                        onToggleFullscreen={() => setFullscreen(fullscreen ? null : agent.id)}
                        fullscreen={fullscreen}
                        embedded={!fullscreen}
                      />
                    </div>
                    <MessageQueueComposer agent={agent} />
                  </>
                ) : (
                  <Centered>{t('commandCenter.noTerminal', { name: agent.name })}</Centered>
                )
              )}
              {key === 'floor' && <FloorTab seed={dispatchSeed} />}
              {key === 'tasks' && <TasksKanban />}
              {key === 'human' && <AskMeTab />}
              {key === 'triggers' && <TriggersTab />}
              {key === 'memory' && (
                <MemoryTab godId={agent.id} who={selectedMemoryAgent ?? undefined} onWho={setSelectedMemoryAgent} />
              )}
              {key === 'graph' && (
                <MemoryGraphPanel
                  godId={agent.id}
                  onJumpToMemory={(id) => { setSelectedMemoryAgent(id); setTab('memory'); }}
                />
              )}
              {key === 'activity' && <ActivityTab />}
              {key === 'skills' && <SkillsTab agentCwd={agent.cwd} />}
              {key === 'workers' && <WorkersTab />}
    </>
  );

  return (
    <PixelPanel
      variant="default"
      noPadding
      style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 0, overflow: 'hidden' }}
    >
      {/* Header. Three bands, in the order you actually ask questions: who and
          how it is doing, how full its head is, and what I can do about it. The
          old one crammed all three into one 10px row with two outlined buttons
          fighting the name for width. */}
      <div style={{
        flexShrink: 0, padding: '16px 16px 14px',
        display: 'flex', flexDirection: 'column', gap: 14,
        borderBottom: '1px solid var(--cth-ink-100)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {/* The portrait wears the agent's state as a ring, so identity and
              status are one object instead of two things to scan. */}
          <span style={{
            position: 'relative', flexShrink: 0,
            width: 46, height: 46, borderRadius: 14,
            background: 'var(--cth-paper-200)',
            boxShadow: `0 0 0 2px var(--cth-status-${agent.status})`,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden'
          }}>
            <SpritePortrait character={agent.character} scale={1.25} />
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{
                fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 19, lineHeight: '23px',
                letterSpacing: '-0.4px', color: 'var(--cth-ink-900)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>{agent.name}</span>
              <PixelBadge status={agent.status} />
            </div>
            <div style={{
              fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>{headerLine}</div>
          </div>

          {/* In focus mode there is no roster anywhere, so the other agents
              live here: one portrait each, the current one lit. */}
          {fullscreen && agents.length > 1 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {agents.filter((a) => a.id !== agent.id).map((a) => (
                <button
                  key={a.id}
                  onClick={() => { useStore.getState().select(a.id); useStore.getState().setFullscreen(a.id); }}
                  aria-label={a.name}
                  data-label={a.name}
                  style={{
                    width: 30, height: 30, padding: 0, flexShrink: 0,
                    border: 'none', cursor: 'pointer', borderRadius: '50%',
                    overflow: 'hidden', display: 'inline-flex',
                    alignItems: 'flex-end', justifyContent: 'center',
                    background: 'var(--cth-cream-100)'
                  }}
                >
                  <SpritePortrait character={a.character} scale={0.85} />
                </button>
              ))}
            </span>
          )}

          {/* Edit and IDE, in the corner the state pill used to hold. Icon-only
              with the tab row's hover label: two labelled buttons here cost more
              width than the agent's own name. */}
          <span className="cth-iconbar" style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
            {[
              { key: 'edit', Glyph: EditIcon, tone: 'var(--cth-lemon)',
                label: t('common.edit', { defaultValue: 'Edit' }),
                onClick: () => setEditOpen(true) },
              { key: 'ide', Glyph: CodeIcon, tone: 'var(--cth-sky)',
                label: t('commandCenter.ide'),
                onClick: () => { const st = useStore.getState(); st.setIdeOpen(true, st.selectedId); } }
            ].map((a) => (
              <button
                key={a.key}
                onClick={a.onClick}
                data-label={a.label}
                aria-label={a.label}
                style={{
                  width: 32, height: 32, flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  borderRadius: 'var(--cth-radius-btn)',
                  color: a.tone,
                  transition: 'background 120ms ease, color 120ms ease'
                }}
              >
                <a.Glyph />
              </button>
            ))}
          </span>

        </div>

      </div>

      {/* Row one: the four screens you open all day, in the accent when active.
          Row two: everything else, quieter and smaller, still one click. */}
      {/* Icons only, one row. Ten labels needed two rows and still read as a
          wall of words; ten glyphs in their own colours are scannable, and the
          name arrives on hover for anyone who does not know the icon yet.
          Hidden in focus mode, where every pane is already on screen. */}
      <div className="cth-tabbar cth-iconbar" style={{
        display: 'flex', gap: 2,
        padding: '10px 10px', flexShrink: 0,
        borderBottom: '1px solid var(--cth-ink-100)'
      }}>
        {TABS.map((d) => {
          const on = d.key === tab;
          const badge = d.key === 'human' ? openAsks : 0;
          return (
            <button
              key={d.key}
              onClick={() => setTab(d.key)}
              data-label={fullscreen ? undefined : t(d.labelKey)}
              aria-label={t(d.labelKey)}
              aria-pressed={on}
              style={{
                // Every tab the same share of the bar, so the row reads as one
                // control spanning the screen rather than a ragged cluster.
                position: 'relative',
                flex: '1 1 0',
                minWidth: 0, height: 36,
                padding: fullscreen ? '0 10px' : 0,
                gap: fullscreen ? 7 : 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer',
                borderRadius: 'var(--cth-radius-btn)',
                background: on ? 'var(--cth-lilac)' : 'transparent',
                // The GLYPH keeps the tab's colour; the WORD does not. A 12.5px
                // label in status green measured 2.1:1 on white — the hue is a
                // marker, and a marker used as body text stops being readable.
                color: on ? 'var(--cth-on-accent)' : 'var(--cth-ink-700)',
                boxShadow: on ? 'var(--cth-shadow-sm)' : 'none',
                fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12.5,
                transition: 'background 120ms ease, color 120ms ease'
              }}
            >
              <span style={{ display: 'inline-flex', color: on ? 'inherit' : d.tone }}>
                <d.Glyph />
              </span>
              {fullscreen && (
                <span style={{
                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>{t(d.labelKey)}</span>
              )}
              {badge > 0 && (
                // Docked the bar is icons, so the count rides the corner. With
                // the label on screen it belongs beside the words, where it
                // reads as part of the name rather than a sticker on a glyph.
                <span style={{
                  ...(fullscreen
                    ? { position: 'relative', marginInlineStart: 2 }
                    : { position: 'absolute', top: 2, insetInlineEnd: 2 }),
                  minWidth: 16, height: 16, padding: '0 5px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 999,
                  background: on ? 'rgba(255,255,255,0.25)' : 'var(--cth-coral)',
                  color: '#FFFFFF',
                  fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 10.5, lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums'
                }}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      <ErrorBoundary key={tab} label={tab}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {paneFor(tab)}
      </div>
      </ErrorBoundary>

      {editOpen && <EditAgentModal agent={agent} onClose={() => setEditOpen(false)} />}
    </PixelPanel>
  );
}

// ─── Floor tab — roster, model, dispatch, dirs, assistant ────────────────────

function FloorTab({ seed }: { seed: { text: string; seq: number } }) {
  const { t } = useTranslation();
  const rtl = useRtl();
  const agents = useStore((s) => s.agents);
  const godName = agents.find((a) => a.isGod)?.name ?? 'the orchestrator';
  const select = useStore((s) => s.select);
  const updateAgent = useStore((s) => s.updateAgent);
  const toolCounts = useStore((s) => s.toolCounts);
  // Live OpenTelemetry per agent — merged into each agent card below (the old
  // standalone Fleet tab folded in here so the roster shows identity + controls
  // AND live cost/usage in one place).
  const { samples, spark, rate, lastTool, breakers } = useFleetTelemetry();
  // Floor-wide token budget (drives the breaker); also the token-meter denominator.
  const [tokenCap, setTokenCap] = useState<number | undefined>(undefined);
  // Per-agent token limit (overrides the floor budget for that agent), keyed by id.
  const [agentTokenCaps, setAgentTokenCaps] = useState<Record<string, number>>({});
  const [restarting, setRestarting] = useState<string | null>(null);
  /** Which agent's Edit dialog is open, if any. The panel header's own Edit
   *  covers the SELECTED agent; this covers any row in the roster. */
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [engineProvider, setEngineProvider] = useState<AgentProvider>('claude');
  const [engineModel, setEngineModel] = useState<string | undefined>(undefined);
  const [restartErrors, setRestartErrors] = useState<Record<string, string>>({});
  // The harness's own default model (Settings → default model). Michael and every
  // new agent spawn on this, so the picker marks it — otherwise the only entry
  // reading "default" was the CLI's, which is a different thing entirely.
  const [defaultModel, setDefaultModel] = useState<string | undefined>(undefined);
  const [dispatchTo, setDispatchTo] = useState<string>(''); // '' = Michael decides
  const [dispatchText, setDispatchText] = useState('');
  const [dispatchMsg, setDispatchMsg] = useState<string | null>(null);
  useEffect(() => {
    window.cth.getConfig().then((c) => {
      setTokenCap(c.costCapTokens);
      setAgentTokenCaps(c.agentTokenCaps ?? {});
      setEngineProvider(c.godProvider ?? 'claude');
      setEngineModel(c.godModel);
      setDefaultModel(c.defaultModel);
    }).catch(() => { /* noop */ });
  }, []);

  // Seed the dispatch box from a task-card "assign" (keyed on seq so repeat
  // assigns re-prefill). seq === 0 is the untouched initial state — skip it.
  useEffect(() => {
    if (seed.seq > 0) setDispatchText(seed.text);
  }, [seed.seq, seed.text]);

  // Restart an agent's PTY in place. `resume:true` reattaches its prior Claude
  // conversation (`--resume <sessionId>`, resolved in the main process from the
  // hive registry by agent id) — this is "Restart & Continue": a clean re-draw
  // of the TUI in a fresh process WITHOUT losing the thread, which is the escape
  // hatch for a corrupted/garbled terminal (e.g. xterm reflow after dragging the
  // window between displays of different sizes). With `resume` unset it's the
  // old behavior: a model change that starts a fresh session.
  /** Restart requested from somewhere that cannot reach restartWithModel —
   *  Edit agent, after a model change. It asks by id; the model comes from the
   *  store, which the save has already updated. */
  useEffect(() => {
    const onRestart = (e: Event): void => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      const target = useStore.getState().agents.find((a) => a.id === id);
      // Silence is the wrong answer to a button press: an agent with no live
      // process cannot be restarted, and the row has to say so.
      if (!target) return;
      if (!target.ptyId) {
        setRestartErrors((errors) => ({ ...errors, [target.id]: t('commandCenter.restartNoProcess') }));
        return;
      }
      // resumeOptional: the user asked for a model change, so an agent with no
      // recorded session still has to get one rather than refusing.
      void restartWithModel(target, target.model, { resume: true, resumeOptional: true });
    };
    window.addEventListener('cth:restart-agent', onRestart);
    return () => window.removeEventListener('cth:restart-agent', onRestart);
  }, []);

  const restartWithModel = async (
    a: Agent,
    model: string | undefined,
    opts: {
      resume?: boolean;
      provider?: AgentProvider;
      /** Resume if we can, start fresh if we can't, instead of refusing.
       *  "Restart & Continue" wants the hard failure — continuing is the entire
       *  point, so silently starting a blank session would be worse than an
       *  error. A model change wants the soft one: the user asked to change
       *  model, and an agent with no recorded session still has to get one. */
      resumeOptional?: boolean;
    } = {}
  ) => {
    if (!a.ptyId) return;
    setRestarting(a.id);
    setRestartErrors((errors) => ({ ...errors, [a.id]: '' }));
    try {
      const cfg = await window.cth.getConfig();
      // Respawn on the same CLI this agent already runs on (inferred from its
      // command if not explicitly tagged) so an Antigravity/Codex worker stays
      // on its own binary. tokenizeCommand keeps quoted model labels one arg.
      // opts.provider overrides the inferred provider — used when changing GOD's engine.
      const previousProvider = inferAgentProvider(a.command, a.provider);
      const provider = opts.provider ?? previousProvider;
      let resume = opts.resume === true && provider === previousProvider;
      if (opts.resume && !resume && !opts.resumeOptional) {
        throw new Error('Cannot resume a session through a different provider.');
      }
      let resumeSessionId: string | undefined;
      if (resume) {
        // A precondition miss is fatal for an explicit "continue", and merely
        // means "start fresh" for an opportunistic one (see resumeOptional).
        const giveUpOnResume = (reason: string) => {
          if (!opts.resumeOptional) throw new Error(reason);
          resume = false;
          resumeSessionId = undefined;
        };
        const registry = await window.cth.hiveRegistry();
        resumeSessionId = registry.agents[a.id]?.sessionId;
        if (!resumeSessionId) {
          giveUpOnResume('No recorded session ID; current process was left running.');
        } else if (provider === 'claude' && !(await window.cth.resolveSessionCwd(resumeSessionId))) {
          giveUpOnResume('Session transcript not found; current process was left running.');
        }
      }
      // Capture the live grid before replacing anything. Restart & Continue
      // recreates only this agent's xterm; model changes retain the old
      // in-place reset behavior.
      const oldEntry = acquireTerminal(a.ptyId);
      let cols = oldEntry.term.cols || 100;
      let rows = oldEntry.term.rows || 30;
      try {
        oldEntry.fit.fit();
        cols = oldEntry.term.cols;
        rows = oldEntry.term.rows;
      } catch { /* host not sized yet */ }

      const killed = await window.cth.killPty(a.ptyId);
      // A pty that is ALREADY gone is the state this kill was trying to reach, so
      // it is not a failure. This is the single most common way to arrive at
      // "Restart & Continue": the session died on its own — a crash, or Ctrl-C
      // twice — main dropped it from the session map, and kill then answers
      // `no pty: <id>`. Treating that as fatal aborted before the respawn and
      // turned the one situation the button exists for into a dead end.
      if (!killed.ok && !/^no pty:/.test(killed.error ?? '')) {
        throw new Error(killed.error ?? 'Could not stop the current process.');
      }
      if (resume) {
        // A blank xterm can retain corrupt renderer/DOM/subscription state even
        // after its PTY is healthy. Throw that one terminal away, acquire its
        // replacement BEFORE spawning (so startup output has a listener), then
        // bump the key so React remounts only this agent's terminal card.
        disposeTerminal(a.ptyId);
        acquireTerminal(a.ptyId);
        updateAgent(a.id, {
          terminalGeneration: (a.terminalGeneration ?? 0) + 1,
          status: 'idle',
          action: 'recreating terminal…'
        });
      } else {
        resetTerminal(a.ptyId);
      }
      const command = buildSpawnCommand(cfg, model, provider);
      const [exe, ...args] = tokenizeCommand(command.trim());
      const hive = {
        id: a.id,
        name: a.name,
        cwd: a.cwd,
        provider,
        isGod: a.isGod,
        isAssistant: a.isAssistant,
        role: roleForHiveSpawn(a)
      };
      const res = await window.cth.spawnPty({
        id: a.ptyId,
        cwd: a.cwd,
        command: exe,
        args,
        provider,
        cols,
        rows,
        hive,
        resume,
        resumeSessionId,
        requireResume: resume
      });
      if (!res.ok) throw new Error(res.error ?? 'Restart failed.');
      if (resume && res.resumed !== true) {
        throw new Error('Resume was refused; no replacement session was accepted.');
      }
      if (res.ok) {
        // Record the model even on a resume. A same-provider model change now
        // RESUMES the session (that is the point — you keep the conversation and
        // just swap the model), so "resume ⇒ the model is unchanged" stopped
        // being true. Skipping the patch left the live process on the new model
        // while the selector and the persisted agent kept the old one, and the
        // next restore relaunched the old command. `command` is rebuilt from the
        // selected model above, so on a genuine no-change restart this is a no-op.
        const patch = resume
          ? {
              command: command.trim(),
              provider,
              model,
              status: 'idle' as const,
              action: 'continuing…'
            }
          : {
              command: command.trim(),
              provider,
              model,
              status: 'idle' as const,
              action: provider === previousProvider ? 'restarting…' : `switching to ${providerPreset(provider).label}…`
            };
        updateAgent(a.id, patch);
      }
    } catch (error) {
      setRestartErrors((errors) => ({
        ...errors,
        [a.id]: error instanceof Error ? error.message : String(error)
      }));
    } finally {
      setRestarting(null);
    }
  };

  // ALL human dispatch flows through the god — never directly into a worker's
  // inbox. Direct dispatch bypassed the orchestrator's whole job: no 4-part
  // contract, no card in tasks.json, no board awareness — and the old
  // 'broadcast' DEFAULT sent the same task to every worker at once. A worker
  // picked in the dropdown is forwarded as a SUGGESTION the god may follow.
  const dispatch = async () => {
    const body = dispatchText.trim();
    if (!body) return;
    const suggested = dispatchTo ? agents.find((a) => a.id === dispatchTo) : undefined;
    const full = suggested
      ? `${body}\n\n${t('commandCenter.dispatchSuggestion', { name: suggested.name, id: suggested.id })}`
      : body;
    const res = await window.cth.hiveSend(
      { to: 'god', act: 'request', subject: t('commandCenter.taskFromHuman'), body: full },
      'human'
    );
    setDispatchText('');
    setDispatchMsg(res.ok
      ? suggested
        ? t('commandCenter.sentToWithSuggestion', { godName, name: suggested.name })
        : t('commandCenter.sentToMichael', { godName })
      : t('commandCenter.dispatchFailed', { error: res.error ?? '?' }));
    setTimeout(() => setDispatchMsg(null), 4000);
  };




  // The token meter is scaled to the agent's own limit when set, else the floor
  // token budget — so each bar reads as "tokens used vs budget" with the remaining
  // headroom visible, never pinned to a useless 100%.
  const floorCap = tokenCap && tokenCap > 0 ? tokenCap : DEFAULT_TOKEN_CAP;
  // Fleet totals across the roster (for the AGENTS summary band).

  return (
    <Scroll>
      <Section title={t('commandCenter.dispatchViaMichael', { godName })}>
        <div style={{
          padding: 14, borderRadius: 'var(--cth-radius-card)',
          background: 'var(--cth-paper-100)',
          boxShadow: '0 0 0 1px var(--cth-ink-100), var(--cth-shadow-sm)',
          display: 'flex', flexDirection: 'column', gap: 10
        }}>
          <textarea
            className="cth-input"
            dir={rtl ? 'auto' : undefined}
            value={dispatchText}
            onChange={(e) => setDispatchText(e.target.value)}
            rows={3}
            placeholder={t('commandCenter.dispatchPlaceholder', { godName })}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical',
              padding: '11px 13px', border: 'none',
              borderRadius: 'var(--cth-radius-input)',
              background: 'var(--cth-paper-100)',
              fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '20px',
              color: 'var(--cth-ink-900)', outline: 'none'
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-500)', flexShrink: 0
            }}>{t('commandCenter.suggestedOwner')}</span>
            <Dropdown
              value={dispatchTo}
              ariaLabel={t('commandCenter.suggestedOwner')}
              onChange={setDispatchTo}
              width={160}
              align="top"
              options={[
                { value: '', label: t('commandCenter.michaelDecides', { godName }) },
                ...agents.filter((a) => !a.isGod).map((a) => ({
                  value: a.id, label: a.name, tone: `var(--cth-${a.accent})`
                }))
              ]}
            />
            <span style={{ flex: 1 }} />
            <button
              onClick={dispatch}
              disabled={!dispatchText.trim()}
              style={{
                height: 34, padding: '0 16px', flexShrink: 0,
                border: 'none', borderRadius: 'var(--cth-radius-btn)',
                cursor: dispatchText.trim() ? 'pointer' : 'not-allowed',
                background: dispatchText.trim() ? 'var(--cth-lilac)' : 'transparent',
                boxShadow: dispatchText.trim() ? 'var(--cth-shadow-btn)' : 'inset 0 0 0 1px var(--cth-ink-100)',
                color: dispatchText.trim() ? '#FFFFFF' : 'var(--cth-ink-500)',
                fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 600,
                transition: 'background 120ms ease, box-shadow 120ms ease, color 120ms ease'
              }}
            >{t('commandCenter.dispatch')}</button>
          </div>
          {dispatchMsg && (
            <div style={{
              fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-status-success)'
            }}>{dispatchMsg}</div>
          )}
        </div>
      </Section>

      {editAgent && (
        <EditAgentModal agent={editAgent} onClose={() => setEditAgent(null)} />
      )}

      <Section title={t('commandCenter.agents')}>
        {/* One row per agent, carrying only what is NOT available elsewhere:
            live usage, the token limit, and restart. Identity is the floor (a
            character click selects) and the panel header; engine and model are
            the Edit dialog, which is the one place that owns them. This was a
            settings form repeated per agent, with its own Apply that disagreed
            with Edit about when a model change takes effect. */}
        {agents.map((a) => {
          const sample = samples[a.id];
          const breaker = breakers[a.id];
          const armed = !!breaker && (breaker.level === 'constrained' || breaker.level === 'stopped');
          const tokens = sample ? sample.input + sample.output + sample.cacheRead + sample.cacheCreation : 0;
          const workTokens = sample ? sample.input + sample.output + sample.cacheCreation : 0;
          const agentCap = agentTokenCaps[a.id];
          const hasAgentCap = !!agentCap && agentCap > 0;
          const denom = hasAgentCap ? agentCap : floorCap;
          const used = hasAgentCap ? workTokens : tokens;
          const pct = Math.min(100, Math.round((used / denom) * 100));
          const meterColor = armed || pct >= 90 ? 'var(--cth-coral)'
            : pct >= 60 ? 'var(--cth-lemon)' : 'var(--cth-status-success)';
          const rateVal = Math.round(rate[a.id] ?? 0);
          return (
            <div
              key={a.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', marginBottom: 8,
                background: 'var(--cth-paper-100)',
                borderRadius: 'var(--cth-radius-card)',
                boxShadow: armed
                  ? `0 0 0 1px color-mix(in srgb, var(--cth-coral) 40%, transparent)`
                  : '0 0 0 1px var(--cth-ink-100)'
              }}
            >
              <button
                onClick={() => select(a.id)}
                aria-label={a.name}
                style={{
                  width: 36, height: 36, flexShrink: 0, padding: 0, border: 'none',
                  borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                  background: 'var(--cth-cream-100)',
                  boxShadow: `0 0 0 2px var(--cth-status-${a.status})`,
                  display: 'inline-flex', alignItems: 'flex-end', justifyContent: 'center'
                }}
              >
                <SpritePortrait character={a.character} scale={0.85} />
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <button
                    onClick={() => select(a.id)}
                    style={{
                      border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                      fontFamily: 'var(--cth-font-ui)', fontSize: 13.5, fontWeight: 600,
                      color: 'var(--cth-ink-900)', textAlign: 'start',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}
                  >{a.name}</button>
                  {/* What it is doing, beside its name: the meter says how much
                      it has spent, not whether it is working. */}
                  <span style={{
                    flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontFamily: 'var(--cth-font-ui)', fontSize: 11, fontWeight: 600,
                    color: 'var(--cth-ink-500)'
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: `var(--cth-status-${a.status})`
                    }} />
                    {a.status}
                  </span>
                  {a.isGod && (
                    <span style={{
                      flexShrink: 0, padding: '2px 7px', borderRadius: 'var(--cth-radius-pill)',
                      background: 'var(--cth-lilac-light)', color: 'var(--cth-lilac)',
                      fontFamily: 'var(--cth-font-ui)', fontSize: 10, fontWeight: 700
                    }}>{t('commandCenter.godTag')}</span>
                  )}
                </div>
                {/* Usage: a bar, the spend, and the burn rate only while it burns. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{
                    flex: 1, minWidth: 40, height: 4, borderRadius: 'var(--cth-radius-pill)',
                    background: 'var(--cth-cream-200)', overflow: 'hidden'
                  }}>
                    <span style={{
                      display: 'block', width: `${pct}%`, height: '100%',
                      background: meterColor, borderRadius: 'var(--cth-radius-pill)',
                      transition: 'width 260ms ease'
                    }} />
                  </span>
                  <span style={{
                    flexShrink: 0, fontFamily: 'var(--cth-font-mono)', fontSize: 11,
                    color: 'var(--cth-ink-500)', fontVariantNumeric: 'tabular-nums'
                  }}>
                    {fmtTokens(used)}
                    {hasAgentCap ? ` / ${fmtTokens(agentCap!)}` : ''}
                    {rateVal > 0 ? ` · ${fmtTokens(rateVal)}/m` : ''}
                  </span>
                </div>
              </div>

              {/* Both actions, on the row. A menu behind three dots hides two
                  buttons behind an extra click and gives no clue what is in
                  there; there is room for both. */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => void restartWithModel(a, a.model, { resume: true })}
                  disabled={restarting === a.id}
                  aria-label={t('commandCenter.restartContinue')}
                  data-label={t('commandCenter.restartContinue')}
                  className="cth-ghost-btn"
                  style={{
                    height: 30, padding: '0 10px', border: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    borderRadius: 'var(--cth-radius-btn)',
                    background: 'var(--cth-mint-light)', color: 'var(--cth-ink-800)',
                    fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12,
                    cursor: restarting === a.id ? 'default' : 'pointer',
                    opacity: restarting === a.id ? 0.6 : 1
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden="true"
                    style={{ color: 'var(--cth-mint)' }}>
                    <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.4V7h-3.6"
                      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {restarting === a.id ? t('commandCenter.restarting') : t('commandCenter.restartShort')}
                </button>
                <button
                  onClick={() => setEditAgent(a)}
                  aria-label={t('commandCenter.editAgent')}
                  data-label={t('commandCenter.editAgent')}
                  className="cth-ghost-btn"
                  style={{
                    height: 30, padding: '0 10px', border: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    borderRadius: 'var(--cth-radius-btn)',
                    background: 'var(--cth-lemon-light)', color: 'var(--cth-ink-800)',
                    fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden="true"
                    style={{ color: 'var(--cth-lemon)' }}>
                    <path d="M13.4 3.6a1.9 1.9 0 0 1 2.7 2.7L7.5 14.9l-3.5.9.9-3.5 8.5-8.7Z"
                      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  </svg>
                  {t('commandCenter.editShort')}
                </button>
              </span>
            </div>
          );
        })}
      </Section>

      <ArchivedSection />


    </Scroll>
  );
}

// ─── Archived agents — retained + flagged, kept off the floor ────────────────

function ArchivedSection() {
  const { t } = useTranslation();
  const archivedAgents = useStore((s) => s.archivedAgents);
  const removeArchivedAgent = useStore((s) => s.removeArchivedAgent);
  const [open, setOpen] = useState(false);
  if (archivedAgents.length === 0) return null;
  return (
    <Section title={t('commandCenter.archived', { count: archivedAgents.length })}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 12px 1px', border: 'none', cursor: 'pointer',
          background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)',
          fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-900)',
          marginBottom: open ? 6 : 0
        }}
      >{open ? '▾' : '▸'} {open ? t('commandCenter.hideClosed') : t('commandCenter.showClosed')}</button>
      {open && archivedAgents.map((a) => (
        <div key={a.id} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: 10, marginBottom: 6, opacity: 0.7,
          background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)'
        }}>
          <div style={{
            width: 24, height: 24, background: `var(--cth-${a.accent}-light)`,
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden', flexShrink: 0
          }}>
            <SpritePortrait character={a.character} scale={1} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-700)' }}>{a.name}</div>
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', wordBreak: 'break-all' }}>{a.cwd}</div>
          </div>
          <button
            onClick={() => removeArchivedAgent(a.id)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--cth-ink-500)', flexShrink: 0 }}
          ><Icon name="x" /></button>
        </div>
      ))}
    </Section>
  );
}

// ─── Memory tab ──────────────────────────────────────────────────────────────

function MemoryTab({ godId, who: controlledWho, onWho }: { godId: string; who?: string; onWho?: (id: string) => void }) {
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);
  // Selection is controllable from the graph tab; falls back to local state.
  const [internalWho, setInternalWho] = useState<string>(godId);
  const who = controlledWho ?? internalWho;
  const setWho = onWho ?? setInternalWho;
  const [mem, setMem] = useState('');
  const [query, setQuery] = useState('');
  const [searchOut, setSearchOut] = useState('');
  const [busy, setBusy] = useState(false);
  // Full-text search across hive files (board, tasks, memory) — additive.
  const [textQuery, setTextQuery] = useState('');
  const [textResults, setTextResults] = useState<Array<{ source: string; excerpt: string }>>([]);
  const [textSearched, setTextSearched] = useState(false);
  const [textBusy, setTextBusy] = useState(false);

  useEffect(() => {
    window.cth.hiveMemory(who).then(setMem).catch(() => setMem(''));
  }, [who]);

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const res = await window.cth.searchMemory(query.trim());
      setSearchOut(res.ok ? (res.output || t('commandCenter.searchNoMatch')) : `${t('commandCenter.dispatchFailed', { error: res.error })}`);
    } finally { setBusy(false); }
  };

  const textSearch = async () => {
    if (!textQuery.trim()) return;
    setTextBusy(true);
    try {
      const res = await window.cth.textSearch(textQuery.trim());
      setTextResults(res.ok ? res.results.slice(0, 10) : []);
    } catch { setTextResults([]); }
    finally { setTextBusy(false); setTextSearched(true); }
  };

  return (
    <Scroll>
      <Section title={t('commandCenter.textSearch')}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
            onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter') textSearch(); }}
            placeholder={t('commandCenter.textSearchPlaceholder')}
            style={{ ...textareaStyle, height: 30 }}
          />
          <PixelButton variant="primary" size="sm" onClick={textSearch} disabled={textBusy || !textQuery.trim()}>
            {textBusy ? '…' : t('common.search')}
          </PixelButton>
        </div>
        {textResults.length > 0 && (
          <div style={{ marginTop: 6 }}>
            {textResults.map((r, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <div style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-500)' }}>{r.source}</div>
                <Pre>{r.excerpt}</Pre>
              </div>
            ))}
          </div>
        )}
        {textSearched && textResults.length === 0 && <Muted>{t('commandCenter.nothingMatched')}</Muted>}
      </Section>

      <Section title={t('commandCenter.semanticSearch')}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter') search(); }}
            placeholder={t('commandCenter.semanticPlaceholder')}
            style={{ ...textareaStyle, height: 30 }}
          />
          <PixelButton variant="primary" size="sm" onClick={search} disabled={busy || !query.trim()}>
            {busy ? '…' : t('common.search')}
          </PixelButton>
        </div>
        {searchOut && <Pre>{searchOut}</Pre>}
      </Section>

      {/* Semantic memory's own state and switch. It used to float over the
          office floor; this is the tab it belongs to. */}
      <Section title={t('memoryPanel.title')}>
        <MemoryPanel docked />
      </Section>

      <Section title={t('commandCenter.memoryFile')}>
        <Select value={who} onChange={setWho}>
          {agents.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
        </Select>
        <Pre>{mem || t('commandCenter.noMemory')}</Pre>
      </Section>
    </Scroll>
  );
}

// ─── Fleet telemetry bits (folded into the Floor AGENTS cards) ───────────────

/** Block-character sparkline of recent token deltas — neo-brutalist mono. */
function Sparkline({ series }: { series: number[] }) {
  const blocks = '▁▂▃▄▅▆▇█';
  const max = Math.max(1, ...series);
  const text = series.length
    ? series.map((v) => blocks[Math.min(blocks.length - 1, Math.round((v / max) * (blocks.length - 1)))]).join('')
    : '▁▁▁▁▁▁';
  return (
    <span style={{ flex: 1, fontFamily: 'var(--cth-font-mono)', fontSize: 13, lineHeight: '12px', color: 'var(--cth-sky)', whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 0 }}>
      {text}
    </span>
  );
}

/** Compact token count: 1K / 10K / 100K / 1M / 100M / 1B (trailing .0 trimmed). */
function fmtTokens(n: number): string {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}


// ─── Activity tab — hive event log + board ───────────────────────────────────

interface LogEntry { ts?: number; kind?: string; [k: string]: unknown }

function ActivityTab() {
  const { t } = useTranslation();
  const [log, setLog] = useState<LogEntry[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const refresh = async () => {
      try { setLog((await window.cth.hiveLog(60)) as LogEntry[]); } catch { /* noop */ }
    };
    refresh();
    timer.current = setInterval(refresh, 3000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  const fmt = (e: LogEntry): string => {
    switch (e.kind) {
      case 'spawn': return t('commandCenter.logSpawn', { name: e.name ?? e.agentId });
      case 'message': return t('commandCenter.logMessage', { from: e.from, to: e.to, subject: e.subject || e.act });
      case 'drain': return t('commandCenter.logDrain', { agent: e.agentId, count: e.count });
      case 'escalate': return t('commandCenter.logEscalate', { subject: e.subject ?? '' });
      case 'approval': return e.approve ? t('commandCenter.logApprovalGranted') : t('commandCenter.logApprovalDenied');
      default: return JSON.stringify(e);
    }
  };

  return (
    <Scroll>
      <Section title={t('commandCenter.activity')}>
        {log.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '14px 14px', borderRadius: 'var(--cth-radius-input)',
            background: 'var(--cth-cream-50)',
            fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-500)'
          }}>
            <span style={{ display: 'inline-flex', color: 'var(--cth-status-idle)' }}>
              <StatusGlyph status="idle" size={16} />
            </span>
            {t('commandCenter.nothingYet')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[...log].reverse().map((e, i, all) => {
              const kind = String(e.kind ?? '');
              const tone = kind === 'escalate' || kind === 'approval' ? 'var(--cth-coral)'
                : kind === 'message' ? 'var(--cth-lilac)'
                : kind === 'spawn' ? 'var(--cth-status-success)'
                : kind === 'drain' ? 'var(--cth-sky)'
                : 'var(--cth-ink-300)';
              const when = typeof e.ts === 'number' ? new Date(e.ts) : null;
              return (
                <div key={i} style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                  {/* dot and rail: the rail stops at the last event so the
                      timeline does not trail off into nothing */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 10 }}>
                    <span style={{
                      width: 8, height: 8, marginTop: 6, borderRadius: 'var(--cth-radius-pill)',
                      background: tone, flexShrink: 0
                    }} />
                    {i < all.length - 1 && (
                      <span style={{ flex: 1, width: 1, background: 'var(--cth-ink-100)', marginTop: 3 }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: 12 }}>
                    <div style={{
                      fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '19px',
                      color: 'var(--cth-ink-900)', wordBreak: 'break-word'
                    }}>{fmt(e)}</div>
                    <div style={{
                      fontFamily: 'var(--cth-font-ui)', fontSize: 11, color: 'var(--cth-ink-500)', marginTop: 2
                    }}>
                      {kind}{when && !isNaN(when.getTime()) ? ` · ${when.toLocaleTimeString()}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

    </Scroll>
  );
}


// ─── small shared bits ───────────────────────────────────────────────────────

function Scroll({ children }: { children: React.ReactNode }) {
  // minWidth:0 + overflowX:hidden keep wide children (native selects, long paths,
  // budget rows) from forcing a horizontal scrollbar in the narrow sidebar — they
  // wrap/shrink instead. Vertical scroll stays.
  return (
    <div className="cth-scrollpane" style={{
      flex: 1, minWidth: 0, minHeight: 0,
      overflowY: 'auto', overflowX: 'hidden',
      padding: 16, background: 'var(--cth-paper-100)'
    }}>{children}</div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12, lineHeight: '16px',
        color: 'var(--cth-ink-500)', marginBottom: 10
      }}>{title}</div>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, textAlign: 'center', color: 'var(--cth-ink-700)', fontSize: 13, background: 'var(--cth-paper-200)' }}>
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'var(--cth-ink-500)' }}>{children}</div>;
}

function Pre({ children }: { children: React.ReactNode }) {
  const rtl = useRtl();
  return (
    <pre style={{
      margin: '6px 0 0', padding: 12, maxHeight: 200, overflow: 'auto',
      background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)',
      fontFamily: 'var(--cth-font-mono)', fontSize: 13, lineHeight: '16px',
      color: 'var(--cth-ink-900)', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
    }} dir={rtl ? 'auto' : undefined}>{children}</pre>
  );
}

const textareaStyle: React.CSSProperties = {
  flex: 1, width: '100%', resize: 'none', padding: '10px 12px',
  background: 'var(--cth-paper-100)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)',
  fontFamily: 'var(--cth-font-mono)', fontSize: 13, lineHeight: '17px',
  color: 'var(--cth-ink-900)', outline: 'none', boxSizing: 'border-box'
};

function Select({ value, onChange, disabled, children }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; children: React.ReactNode;
}) {
  const options: { value: string; label: string }[] = [];
  const walk = (node: React.ReactNode): void => {
    React.Children.forEach(node, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === 'option') {
        const p = child.props as { value?: string; children?: React.ReactNode };
        options.push({
          value: String(p.value ?? ''),
          label: React.Children.toArray(p.children).map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : '')).join('')
        });
        return;
      }
      walk((child.props as { children?: React.ReactNode }).children);
    });
  };
  walk(children);

  if (disabled) {
    const current = options.find((o) => o.value === value);
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 12px',
        borderRadius: 'var(--cth-radius-btn)', background: 'var(--cth-cream-50)',
        fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-400)',
        minWidth: 0, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
      }}>{current?.label ?? value}</span>
    );
  }
  return <Dropdown value={value} options={options} onChange={onChange} width="auto" align="top" />;
}


