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
interface GHIssue {
  number: number;
  title: string;
  body: string;
  url: string;
  labels: string[];
  assignees: string[];
}

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
  const [tab, setTab] = useState<CCTab>('terminal');
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
      {!fullscreen && (
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
              data-label={t(d.labelKey)}
              aria-label={t(d.labelKey)}
              aria-pressed={on}
              style={{
                position: 'relative',
                flex: '1 1 0', minWidth: 0, height: 36,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer',
                borderRadius: 'var(--cth-radius-btn)',
                background: on ? 'var(--cth-lilac)' : 'transparent',
                color: on ? 'var(--cth-on-accent)' : d.tone,
                boxShadow: on ? 'var(--cth-shadow-sm)' : 'none',
                transition: 'background 120ms ease, color 120ms ease'
              }}
            >
              <d.Glyph />
              {badge > 0 && (
                <span style={{
                  position: 'absolute', top: 2, insetInlineEnd: 2,
                  minWidth: 15, height: 15, padding: '0 4px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 'var(--cth-radius-pill)',
                  background: 'var(--cth-coral)', color: '#FFFFFF',
                  fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 10, lineHeight: 1
                }}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>
      )}

      {fullscreen ? (
        /* Focus mode: panes side by side, not stacked behind a tab bar. The
           terminal keeps the room it needs; the queue and the board sit beside
           it because they are what you glance at while it runs. The secondary
           row still switches the last column, so nothing became unreachable. */
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 1, background: 'var(--cth-ink-100)' }}>
          {([
            { key: 'terminal' as CCTab, grow: 2, basis: 520, min: 420 },
            { key: 'human' as CCTab, grow: 1, basis: 340, min: 260 },
            { key: 'tasks' as CCTab, grow: 1, basis: 340, min: 260 },
            { key: (PRIMARY.includes(tab) ? 'floor' : tab) as CCTab, grow: 1, basis: 340, min: 260 }
          ]).map((col, i) => (
            <div
              key={`${col.key}-${i}`}
              style={{
                flex: `${col.grow} 1 ${col.basis}px`,
                minWidth: col.min, minHeight: 0,
                display: 'flex', flexDirection: 'column',
                background: 'var(--cth-paper-100)'
              }}
            >
              <div style={{
                flexShrink: 0, padding: '8px 12px',
                fontSize: 11, fontWeight: 600, color: 'var(--cth-ink-500)',
                borderBottom: '1px solid var(--cth-ink-100)'
              }}>
                {t(TABS.find((x) => x.key === col.key)?.labelKey ?? '')}
              </div>
              <ErrorBoundary key={col.key} label={col.key}>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
                  {paneFor(col.key)}
                </div>
              </ErrorBoundary>
            </div>
          ))}
        </div>
      ) : (
      <ErrorBoundary key={tab} label={tab}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {paneFor(tab)}
      </div>
      </ErrorBoundary>
      )}

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
  const [repos, setRepos] = useState<string[]>([]);
  // Floor-wide token budget (drives the breaker); also the token-meter denominator.
  const [tokenCap, setTokenCap] = useState<number | undefined>(undefined);
  // Per-agent token limit (overrides the floor budget for that agent), keyed by id.
  const [agentTokenCaps, setAgentTokenCaps] = useState<Record<string, number>>({});
  const [restarting, setRestarting] = useState<string | null>(null);
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
  // ── ISSUES section state ──
  const [issueRepo, setIssueRepo] = useState<string>('');
  const [issues, setIssues] = useState<GHIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  useEffect(() => {
    window.cth.getConfig().then((c) => {
      setRepos(c.registeredRepos ?? []);
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

  const fetchIssues = async () => {
    const repo = issueRepo || repos[0];
    if (!repo) { setIssuesError('No repo selected.'); return; }
    setIssuesLoading(true);
    setIssuesError(null);
    try {
      const res = await window.cth.githubIssues(repo);
      if (res.ok) {
        setIssues((res.issues ?? []).slice(0, 10));
      } else {
        setIssues([]);
        setIssuesError(res.error ?? 'Failed to fetch issues.');
      }
    } catch (e) {
      setIssues([]);
      setIssuesError(e instanceof Error ? e.message : String(e));
    } finally {
      setIssuesLoading(false);
    }
  };

  const assignIssue = (issue: GHIssue) => {
    const body = (issue.body ?? '').slice(0, 200);
    setDispatchText(`GitHub Issue #${issue.number}: ${issue.title}\n\n${body}\n\nURL: ${issue.url}`);
    setDispatchTo(''); // Michael decomposes and assigns — no more broadcast blasts
  };

  // Set/clear one agent's token limit atomically in main. Renderer config objects
  // are snapshots, so persisting this whole map could clobber a cap added by the
  // hire flow after this panel loaded.
  const setAgentCap = (id: string, tokens: number | undefined) => {
    setAgentTokenCaps((current) => {
      const optimistic = { ...current };
      if (tokens && tokens > 0) optimistic[id] = tokens;
      else delete optimistic[id];
      return optimistic;
    });
    void window.cth.setAgentTokenCap(id, tokens).then((updated) => {
      setAgentTokenCaps(updated.agentTokenCaps ?? {});
    }).catch(() => {
      // Reconcile a failed optimistic edit with the persisted source of truth.
      void window.cth.getConfig().then((current) => {
        setAgentTokenCaps(current.agentTokenCaps ?? {});
      }).catch(() => { /* noop */ });
    });
  };

  // The token meter is scaled to the agent's own limit when set, else the floor
  // token budget — so each bar reads as "tokens used vs budget" with the remaining
  // headroom visible, never pinned to a useless 100%.
  const floorCap = tokenCap && tokenCap > 0 ? tokenCap : DEFAULT_TOKEN_CAP;
  // Fleet totals across the roster (for the AGENTS summary band).
  let sumTokens = 0, sumInput = 0, sumCacheRead = 0, sumRate = 0;
  for (const a of agents) {
    const s = samples[a.id];
    if (s) {
      sumTokens += s.input + s.output + s.cacheRead + s.cacheCreation;
      sumInput += s.input + s.cacheRead + s.cacheCreation;
      sumCacheRead += s.cacheRead;
    }
    sumRate += rate[a.id] ?? 0;
  }
  const fleetCachePct = sumInput > 0 ? Math.round((sumCacheRead / sumInput) * 100) : 0;

  return (
    <Scroll>
      <Section title={t('commandCenter.dispatchViaMichael', { godName: godName.toUpperCase() })}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, color: 'var(--cth-ink-500)', flexShrink: 0 }}>
            {t('commandCenter.suggestedOwner')}
          </span>
          <Select value={dispatchTo} onChange={setDispatchTo}>
            <option value="">{t('commandCenter.michaelDecides', { godName })}</option>
            {agents.filter((a) => !a.isGod).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </div>
        <textarea
          dir={rtl ? 'auto' : undefined}
          value={dispatchText}
          onChange={(e) => setDispatchText(e.target.value)}
          rows={2}
          placeholder={t('commandCenter.dispatchPlaceholder', { godName })}
          style={textareaStyle}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <PixelButton variant="primary" size="sm" onClick={dispatch} disabled={!dispatchText.trim()}>
            {t('commandCenter.dispatch')}
          </PixelButton>
          {dispatchMsg && <span style={{ fontSize: 13, color: 'var(--cth-ink-500)' }}>{dispatchMsg}</span>}
        </div>
      </Section>

      <Section title={t('commandCenter.agents')}>
        {agents.map((a) => {
          const agentProvider = inferAgentProvider(a.command, a.provider);
          const agentPreset = providerPreset(agentProvider);
          const sample = samples[a.id];
          const breaker = breakers[a.id];
          const armed = !!breaker && (breaker.level === 'constrained' || breaker.level === 'stopped');
          const tokens = sample ? sample.input + sample.output + sample.cacheRead + sample.cacheCreation : 0;
          // The per-agent cap is measured in WORK tokens — input + output + cache
          // writes, cache reads excluded (breaker.ts, #189) — so the meter against
          // that cap reads the same figure; otherwise a cache-heavy agent shows a
          // full red bar while the breaker is (correctly) calm. The floor budget
          // sums all kinds, so its meter keeps `tokens`; the count beside the bar
          // stays the all-kinds spend either way.
          const workTokens = sample ? sample.input + sample.output + sample.cacheCreation : 0;
          const agentCap = agentTokenCaps[a.id]; // per-agent limit, if set
          const hasAgentCap = !!agentCap && agentCap > 0;
          const denom = hasAgentCap ? agentCap : floorCap;
          const used = hasAgentCap ? workTokens : tokens;
          const pct = Math.min(100, Math.round((used / denom) * 100));
          const meterColor = armed || pct >= 90 ? 'var(--cth-coral)' : pct >= 60 ? 'var(--cth-lemon)' : 'var(--cth-mint)';
          // Sparkline only when the agent is actually burning tokens; otherwise the
          // flat baseline is just a mystery line. Label it with the live rate.
          const sparkSeries = spark[a.id] ?? [];
          const hasSpark = sparkSeries.some((v) => v > 0);
          const rateVal = Math.round(rate[a.id] ?? 0);
          const rateLabel = rateVal > 0 ? `${fmtTokens(rateVal)}/m` : 'rate';
          const currentModelKnown = modelsForProvider(agentProvider)
            .some((model) => model.id === a.model);
          return (
          <div key={a.id} style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            padding: 10, marginBottom: 6,
            background: armed ? 'var(--cth-coral-light)' : 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 24, height: 24, background: `var(--cth-${a.accent}-light)`,
                boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden', flexShrink: 0
              }}>
                <SpritePortrait character={a.character} scale={1} />
              </div>
              <button
                onClick={() => select(a.id)}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                  fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-900)'
                }}
              >{a.name}{a.isGod ? t('commandCenter.godTag') : ''}</button>
              <PixelBadge status={armed ? 'looping' : a.status} />
              {armed && <span style={{ color: 'var(--cth-coral)', fontSize: 13 }}>⚠</span>}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--cth-ink-500)' }}>
                {t('commandCenter.toolCalls', { count: toolCounts[a.id] ?? 0 })}
              </span>
              <TokenLimitEditor value={agentCap} onSet={(t) => setAgentCap(a.id, t)} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', wordBreak: 'break-all' }}>{a.cwd}</div>
            {/* Live telemetry (folded in from the old Fleet tab) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {hasSpark ? (
                <span style={{ flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-500)', flexShrink: 0 }}>{rateLabel}</span>
                  <Sparkline series={sparkSeries} />
                </span>
              ) : (
                <span style={{ flex: 1 }} />
              )}
              {lastTool[a.id] && (
                <span style={{
                  fontSize: 11, lineHeight: '14px', padding: '0 5px', flexShrink: 0,
                  background: 'var(--cth-paper-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)', color: 'var(--cth-ink-700)'
                }}>{lastTool[a.id]}</span>
              )}
              <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-300)', flexShrink: 0 }}>{t('commandCenter.budget')}</span>
              <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-900)', width: 56, textAlign: 'right' }}>{fmtTokens(tokens)}</span>
              <div
                style={{ width: 96, height: 8, background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)', flexShrink: 0 }}
              >
                <div style={{ width: `${pct}%`, height: '100%', background: meterColor }} />
              </div>
              <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-500)', width: 30, textAlign: 'right' }}>{pct}%</span>
            </div>
            {/* Context window — the SAME exact statusLine-fed numbers as the
                avatar-card gauge (tokens currently in the window vs the real
                200k/1M size). Distinct from the cumulative budget meter above,
                which keeps growing forever and pins at 100% — that one is
                spend, this one is headroom before compaction. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-300)', flexShrink: 0 }}>{t('commandCenter.ctx')}</span>
              {a.contextTokens !== undefined && a.contextLimit ? (() => {
                const cpct = Math.min(100, Math.round((a.contextTokens! / a.contextLimit!) * 100));
                const ccolor = cpct >= 88 ? 'var(--cth-coral)' : cpct >= 75 ? 'var(--cth-lemon)' : `var(--cth-${a.accent})`;
                return (
                  <>
                    <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-900)', width: 56, textAlign: 'right' }}>
                      {fmtTokens(a.contextTokens!)}
                    </span>
                    <div
                      style={{ width: 96, height: 8, background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)', flexShrink: 0 }}
                    >
                      <div style={{ width: `${cpct}%`, height: '100%', background: ccolor }} />
                    </div>
                    <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-500)', width: 30, textAlign: 'right' }}>{cpct}%</span>
                  </>
                );
              })() : (
                <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-300)' }}>
                  {t('commandCenter.noStatusTick')}
                </span>
              )}
            </div>
            {/* Non-god agents get the cross-provider model picker + restart controls
                here. The GOD agent's model lives in the engine row below
                (provider+model+apply), so we DON'T render this second selector for
                it — one model picker, not two. */}
            {!a.isGod && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Select
                value={encodeProviderModel(agentProvider, a.model)}
                disabled={restarting === a.id}
                onChange={(value) => {
                  const choice = decodeProviderModel(value);
                  if (!choice) return;
                  // Switching model within the SAME provider continues the
                  // conversation — that's the whole point of switching mid-task
                  // ("this got hard, go up a tier"), and starting fresh threw
                  // away the context that made the switch necessary.
                  // `resume` is best-effort: restartWithModel already refuses it
                  // across providers, and falls back to a fresh session when no
                  // session id or transcript is recorded.
                  void restartWithModel(a, choice.model, {
                    provider: choice.provider,
                    resume: choice.provider === agentProvider,
                    resumeOptional: true
                  });
                }}
              >
                {(!agentPreset.supportsModel || !currentModelKnown) && (
                  <option value={encodeProviderModel(agentProvider, a.model)}>
                    {agentPreset.label} · {a.model ?? 'current'}
                  </option>
                )}
                {modelProvidersForAgent(a.isGod).map((preset) => (
                  <optgroup key={preset.id} label={preset.label}>
                    {modelsForProvider(preset.id).map((model) => {
                      // `defaultModel` is a Claude model id, so it can only mark
                      // an entry in the Claude group.
                      const isHarnessDefault = preset.id === 'claude'
                        && !!defaultModel && model.id === defaultModel;
                      return (
                        <option
                          key={`${preset.id}:${model.id ?? 'cli-default'}`}
                          value={encodeProviderModel(preset.id, model.id)}
                        >
                          {model.label}{isHarnessDefault ? ' · default' : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </Select>
              <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
                {restarting === a.id
                  ? t('common.restarting')
                  : t('commandCenter.modelRestarts', { provider: agentPreset.label })}
              </span>
              {/* Restart & Continue — kill + respawn keeping the SAME model and
                  resuming the prior conversation (--resume). Use this to redraw a
                  garbled TUI (e.g. after dragging the window across displays)
                  without losing the thread. */}
              {(agentProvider === 'claude' || agentPreset.resumeFlag || agentPreset.resumeSubcommand) && <>
                <span style={{ flex: 1 }} />
                <PixelButton
                  variant="secondary"
                  size="sm"
                  disabled={restarting === a.id}
                  onClick={() => restartWithModel(a, a.model, { resume: true })}
                >
                  <span>
                    {t('commandCenter.restartContinue')}
                  </span>
                </PixelButton>
              </>}
            </div>
            )}
            {restartErrors[a.id] && (
              <div style={{ fontSize: 11, color: 'var(--cth-coral)' }}>
                {restartErrors[a.id]}
              </div>
            )}
            {a.isGod && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--cth-ink-500)', flexShrink: 0 }}>{t('commandCenter.engine')}</span>
                <Select
                  value={engineProvider}
                  disabled={restarting === a.id}
                  onChange={(v) => {
                    const p = v as AgentProvider;
                    setEngineProvider(p);
                    const preset = AGENT_PROVIDER_PRESETS.find((x) => x.id === p);
                    setEngineModel(preset?.recommendedOrchestratorModel);
                  }}
                >
                  {AGENT_PROVIDER_PRESETS.filter((p) => canReceiveInbox(p.id)).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}{p.id === 'claude' ? ' ★' : ''}
                    </option>
                  ))}
                </Select>
                <Select
                  value={engineModel ?? ''}
                  disabled={restarting === a.id}
                  onChange={(v) => setEngineModel(v || undefined)}
                >
                  {modelsForProvider(engineProvider).map((m) => (
                    <option key={m.label} value={m.id ?? ''}>{m.label}</option>
                  ))}
                </Select>
                <PixelButton
                  variant="secondary"
                  size="sm"
                  disabled={restarting === a.id}
                  onClick={async () => {
                    const currentProvider = inferAgentProvider(a.command, a.provider);
                    if (engineProvider !== currentProvider) {
                      if (!window.confirm(t('commandCenter.confirmRestartEngine', { name: a.name }))) return;
                    }
                    await window.cth.updateConfig({ godProvider: engineProvider, godModel: engineModel });
                    await restartWithModel(a, engineModel, { provider: engineProvider, resume: false });
                  }}
                >
                  {restarting === a.id ? t('common.restarting') : t('commandCenter.apply')}
                </PixelButton>
                {/* Redraw a garbled terminal without losing the thread (resume the
                    SAME engine+model). Kept here since the god has no per-agent row above. */}
                <PixelButton
                  variant="secondary"
                  size="sm"
                  disabled={restarting === a.id}
                  onClick={() => restartWithModel(a, a.model, { resume: true })}
                >
                  <span>
                    {t('commandCenter.restartContinue')}
                  </span>
                </PixelButton>
              </div>
            )}
          </div>
          );
        })}
        {/* Fleet summary band */}
        <div style={{
          display: 'flex', gap: 16, marginTop: 2, padding: '10px 12px',
          background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)',
          fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-900)', flexWrap: 'wrap'
        }}>
          <span>Σ <strong>{fmtTokens(sumTokens)}</strong> {t('costHud.tok')}</span>
          <span style={{ color: 'var(--cth-ink-700)' }}>{t('commandCenter.fleetInputs', { value: fmtTokens(sumInput), pct: fleetCachePct })}</span>
          <span style={{ color: 'var(--cth-ink-700)' }}>{t('commandCenter.fleetRate', { value: Math.round(sumRate).toLocaleString() })}</span>
        </div>
        <div style={{ marginTop: 6 }}>
          <Muted>
            {t('commandCenter.telemetryNote', { cap: fmtTokens(floorCap) })}
            {tokenCap && tokenCap > 0 ? '' : t('commandCenter.defaultBudgetNote')}
          </Muted>
        </div>
      </Section>

      <ArchivedSection />


      <Section title={t('commandCenter.directories')}>
        {repos.length === 0 && <Muted>{t('commandCenter.noRepos')}</Muted>}
        {repos.map((r) => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--cth-ink-700)', wordBreak: 'break-all' }}>{r}</span>
            <button
              onClick={() => window.cth.openTerminalAt(r)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--cth-ink-500)' }}
            ><Icon name="terminal" /></button>
          </div>
        ))}
      </Section>

      <Section title={t('commandCenter.issues')}>
        {repos.length === 0 && <Muted>{t('commandCenter.noRepos')}</Muted>}
        {repos.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <Select value={issueRepo || repos[0]} onChange={setIssueRepo}>
                {repos.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </Select>
              <PixelButton variant="primary" size="sm" onClick={fetchIssues} disabled={issuesLoading}>
                {issuesLoading ? t('commandCenter.fetching') : t('commandCenter.fetchIssues')}
              </PixelButton>
            </div>
            {issuesError && (
              <div style={{
                fontSize: 13, color: 'var(--cth-ink-700)', marginBottom: 6,
                padding: 10, background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)',
                wordBreak: 'break-word'
              }}>{issuesError}</div>
            )}
            {!issuesError && !issuesLoading && issues.length === 0 && <Muted>{t('commandCenter.noIssues')}</Muted>}
            {issues.map((issue) => (
              <div key={issue.number} style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: 10, marginBottom: 6,
                background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--cth-ink-900)', flex: 1, wordBreak: 'break-word' }}>
                    <strong>#{issue.number}</strong> {issue.title}
                  </span>
                  <PixelButton variant="secondary" size="sm" onClick={() => assignIssue(issue)}>
                    {t('commandCenter.assign')}
                  </PixelButton>
                </div>
                {issue.labels.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {issue.labels.map((label) => (
                      <span key={label} style={{
                        fontSize: 11, lineHeight: '14px', padding: '0 5px',
                        background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)',
                        color: 'var(--cth-ink-700)'
                      }}>{label}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </Section>
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

/** Per-agent token-limit control (top-right of each agent card). Shows the
 *  current limit as a lemon chip, or "set limit"; click to edit a token number.
 *  Enter / ✓ / blur commit; Escape cancels. */
function TokenLimitEditor({ value, onSet }: { value?: number; onSet: (tokens: number | undefined) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value != null ? String(value) : '');
  const skipBlur = useRef(false);
  const commit = () => {
    const raw = text.trim();
    const n = raw === '' ? undefined : Number(raw);
    onSet(typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined);
    setEditing(false);
  };
  if (!editing) {
    return (
      <button
        onClick={() => { setText(value != null ? String(value) : ''); setEditing(true); }}
        style={{
          flexShrink: 0, padding: '1px 10px', border: 'none', cursor: 'pointer',
          background: value && value > 0 ? 'var(--cth-lemon)' : 'var(--cth-cream-200)',
          boxShadow: `inset 0 0 0 1px ${value && value > 0 ? 'var(--cth-ink-900)' : 'var(--cth-ink-700)'}`,
            borderRadius: 'var(--cth-radius-input)',
          fontFamily: 'var(--cth-font-ui)', fontSize: 11, color: 'var(--cth-ink-900)'
        }}
      >{value && value > 0
        ? <>{t('commandCenter.tokenLimit', { value: fmtTokens(value) })}</>
        : t('commandCenter.setLimit')}</button>
    );
  }
  return (
    <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number" min="0" step="100000" value={text} autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (isComposingKey(e)) return;
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') { skipBlur.current = true; setEditing(false); }
        }}
        onBlur={() => { if (skipBlur.current) { skipBlur.current = false; return; } commit(); }}
        placeholder={t('common.tokens')}
        style={{
          width: 84, padding: '2px 4px', background: 'var(--cth-paper-100)', border: 'none',
          boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)', fontFamily: 'var(--cth-font-mono)',
          fontSize: 11, color: 'var(--cth-ink-900)', outline: 'none'
        }}
      />
      <button
        onMouseDown={(e) => e.preventDefault()} onClick={commit}
        style={{ flexShrink: 0, padding: '1px 5px', border: 'none', cursor: 'pointer', background: 'var(--cth-mint)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)', fontSize: 11, color: 'var(--cth-ink-900)' }}
      >✓</button>
    </span>
  );
}

// ─── Activity tab — hive event log + board ───────────────────────────────────

interface LogEntry { ts?: number; kind?: string; [k: string]: unknown }

function ActivityTab() {
  const { t } = useTranslation();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [board, setBoard] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const refresh = async () => {
      try { setLog((await window.cth.hiveLog(60)) as LogEntry[]); } catch { /* noop */ }
      try { setBoard(await window.cth.hiveBoard()); } catch { /* noop */ }
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
        {log.length === 0 && <Muted>{t('commandCenter.nothingYet')}</Muted>}
        {[...log].reverse().map((e, i) => (
          <div key={i} style={{ fontSize: 13, color: 'var(--cth-ink-700)', padding: '2px 0', display: 'flex', gap: 8 }}>
            <span style={{ color: 'var(--cth-ink-300)', flexShrink: 0 }}>{e.kind ?? '·'}</span>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmt(e)}</span>
          </div>
        ))}
      </Section>

      <Section title={t('commandCenter.board')}>
        <Pre>{board || t('commandCenter.boardEmpty')}</Pre>
      </Section>
    </Scroll>
  );
}


// ─── small shared bits ───────────────────────────────────────────────────────

function Scroll({ children }: { children: React.ReactNode }) {
  // minWidth:0 + overflowX:hidden keep wide children (native selects, long paths,
  // budget rows) from forcing a horizontal scrollbar in the narrow sidebar — they
  // wrap/shrink instead. Vertical scroll stays.
  return <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 16, background: 'var(--cth-paper-200)' }}>{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, lineHeight: '12px', color: 'var(--cth-ink-500)', marginBottom: 6 }}>{title}</div>
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
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '3px 10px', background: 'var(--cth-paper-100)',
        border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)',
        fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-900)', cursor: 'pointer',
        // Never let a long option name push the sidebar wider than it is.
        minWidth: 0, maxWidth: '100%'
      }}
    >{children}</select>
  );
}
