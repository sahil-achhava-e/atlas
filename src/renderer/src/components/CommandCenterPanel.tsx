import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelBadge } from './PixelBadge';
import { PixelButton } from './PixelButton';
import { SpritePortrait } from './SpritePortrait';
import { MessageQueueComposer } from './MessageQueueComposer';
import { TasksKanban } from './TasksKanban';
import { AskMeTab } from './AskMeTab';
import { TriggersTab } from './triggers/TriggersTab';
import { WorkersTab } from './WorkersTab';
import { SkillsTab } from './SkillsTab';
import { acquireTerminal, disposeTerminal, resetTerminal } from './terminalPool';
import { Icon } from './Icon';
import { StatusGlyph } from './StatusGlyph';
import { Dropdown } from './Dropdown';
import {
  TerminalIcon, BellIcon, TasksIcon, TeamIcon, MemoryIcon,
  MapIcon, EventsIcon, JobsIcon, TriggersIcon, SkillsIcon, EditIcon, CodeIcon
} from './TabIcons';
import { ErrorBoundary } from './ErrorBoundary';
import { useBoardCounts } from '@/hooks/useBoardCounts';
import { EditAgentModal } from './EditAgentModal';
import { restartAgent } from './restartAgent';
import { MemoryPanel } from './MemoryPanel';
import { MemoryGraphPanel } from './MemoryGraphPanel';
import { useFleetTelemetry } from '@/hooks/useTelemetry';
import { COMMAND_GROUPS } from '@shared/claudeCommands';
import { roleForHiveSpawn } from '@shared/agentRole';
import { useStore, type Agent } from '@/store/store';
import { SIMPLE_MODE_CC_TABS, visibleTabs } from '@/store/simpleMode';
import {
  buildSpawnCommand,
  decodeProviderModel,
  encodeProviderModel,
  inferAgentProvider,
  isClaudeProvider,
  modelProvidersForAgent,
  providerPreset,
  tokenizeCommand,
  AGENT_PROVIDER_PRESETS,
  type AgentProvider
} from '@/store/config';
import { canReceiveInbox } from '@shared/agentProvider';
import { isComposingKey } from '@shared/imeGuard';
import { useRtl } from '@/i18n/useDirection';
import { TechnicalLog } from './TechnicalLog';

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
  // SIMPLE MODE — five of the ten tabs are about how the crew is wired rather
  // than what it is doing. The store coerces a stranded selection when the mode
  // flips, so `tab` is always one of these by the time we render.
  const simpleMode = useStore((st) => st.simpleMode);
  const tabs = visibleTabs(TABS, SIMPLE_MODE_CC_TABS, simpleMode);
  const setTab = (next: CCTab): void => useStore.getState().setCcTab(next);
  // Atlas had no way to be edited: AgentDetailPanel hands god straight to this
  // panel and never reaches the Edit button every other agent gets, so his
  // name, one-liner and standing goal were unreachable from the app.
  const [editOpen, setEditOpen] = useState(false);
  // Two numbers, one read of the ledger. `asks` is the one about the human
  // (questions nobody has answered); `openTasks` is the one about the work
  // (every card that is not done).
  const { asks: openAsks, openTasks } = useBoardCounts();

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
  // Lifted so the memory-graph tab can jump to a specific agent's memory file.
  const [selectedMemoryAgent, setSelectedMemoryAgent] = useState<string | null>(null);
  const updateAgent = useStore((s) => s.updateAgent);
  const setFullscreen = useStore((s) => s.setFullscreen);
  const fullscreenAgentId = useStore((s) => s.fullscreenAgentId);
  // True only for the DOCKED panel while the overlay holds this agent.
  const isFullscreenedHere = fullscreenAgentId === agent.id && !fullscreen;
  // What it is doing NOW while it works; where it lives when it is not.
  const headerLine = (agent.status !== 'idle' && agent.action)
    ? agent.action
    : (agent.description?.trim() || (agent.isGod ? t('commandCenter.roleGod') : t('commandCenter.roleWorker')));
  // Below 1k there is nothing to report and the rounding says "0k", which reads
  // as a broken gauge rather than as a session that has barely started.
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
                      {/* Read-only: what the agent is saying and working on.
                          The engine's terminal lives in focus mode (the title
                          bar's toggle), for the times only its own output will
                          do. PtyTerminalView is not mounted here — terminalPool
                          keeps the xterm alive per pty regardless, so nothing
                          is lost and the scrollback is intact when it opens. */}
                      <TechnicalLog agent={agent} />
                    </div>
                    <MessageQueueComposer agent={agent} />
                  </>
                ) : (
                  <Centered>{t('commandCenter.noTerminal', { name: agent.name })}</Centered>
                )
              )}
              {key === 'floor' && <FloorTab />}
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
            <SpritePortrait character={agent.character} scale={1.5} />
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
              // The IDE is Monaco, a file tree and a diff view — the same reason
              // git goes from the tab bar in simple mode applies to the button
              // that opens an editor.
              ...(simpleMode ? [] : [{ key: 'ide', Glyph: CodeIcon, tone: 'var(--cth-sky)',
                label: t('commandCenter.ide'),
                onClick: () => { const st = useStore.getState(); st.setIdeOpen(true, st.selectedId); } }])
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
        {tabs.map((d) => {
          const on = d.key === tab;
          // Two tabs carry a number, and they mean different things: `human`
          // is what is waiting on YOU, `tasks` is what is still open at all.
          // So they are coloured differently below — coral demands an action,
          // the quieter fill is a running total you are not late for.
          const badge = d.key === 'human' ? openAsks : d.key === 'tasks' ? openTasks : 0;
          const urgent = d.key === 'human';
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
                //
                // The count stays while the tab is OPEN, and it has to stay
                // READABLE. On the selected tab this was white text on 25%
                // white over the lilac fill, which measured as no number at
                // all — so opening the tab looked like the badge had been
                // cleared by reading it. It is not a notification: it is how
                // many questions are still unanswered, and that is exactly the
                // thing you want visible while you work through them. Selected,
                // it inverts to a solid pill instead of dissolving into the fill.
                <span
                  aria-label={t(urgent ? 'commandCenter.openAsks' : 'commandCenter.openTasks', { count: badge })}
                  style={{
                    ...(fullscreen
                      ? { position: 'relative', marginInlineStart: 2 }
                      : { position: 'absolute', top: 2, insetInlineEnd: 2 }),
                    minWidth: 16, height: 16, padding: '0 5px',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 999,
                    // Unselected, the two counts are told apart by fill: coral is
                    // a thing to do something about, the quiet grey is a running
                    // total. Selected, both invert to a solid pill — the tab is
                    // already lilac, and a tinted badge on it was the bug that
                    // made the number look cleared by opening the tab.
                    background: on
                      ? 'var(--cth-paper-100)'
                      : urgent ? 'var(--cth-coral)' : 'var(--cth-ink-300)',
                    color: on
                      ? 'var(--cth-lilac-text)'
                      : urgent ? 'var(--cth-on-accent)' : 'var(--cth-ink-900)',
                    fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 10.5, lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums'
                  }}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* The tab's NAME, not its key: this printed "human stopped" for the
          Questions tab and "graph stopped" for Map. */}
      <ErrorBoundary key={tab} label={t(`commandCenter.tabs.${tab}`)}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {paneFor(tab)}
      </div>
      </ErrorBoundary>

      {editOpen && <EditAgentModal agent={agent} onClose={() => setEditOpen(false)} />}
    </PixelPanel>
  );
}

// ─── Floor tab — roster, model, restart, dirs, assistant ─────────────────────

function FloorTab() {
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);
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
  const restarting = useStore((s) => s.restartingId);
  /** Which agent's Edit dialog is open, if any. The panel header's own Edit
   *  covers the SELECTED agent; this covers any row in the roster. */
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [engineProvider, setEngineProvider] = useState<AgentProvider>('claude');
  const [engineModel, setEngineModel] = useState<string | undefined>(undefined);
  const restartErrors = useStore((s) => s.restartErrors);
  // The harness's own default model (Settings → default model). Michael and every
  // new agent spawn on this, so the picker marks it — otherwise the only entry
  // reading "default" was the CLI's, which is a different thing entirely.
  const [defaultModel, setDefaultModel] = useState<string | undefined>(undefined);
  useEffect(() => {
    window.cth.getConfig().then((c) => {
      setTokenCap(c.costCapTokens);
      setAgentTokenCaps(c.agentTokenCaps ?? {});
      setEngineProvider(c.godProvider ?? 'claude');
      setEngineModel(c.godModel);
      setDefaultModel(c.defaultModel);
    }).catch(() => { /* noop */ });
  }, []);

  // One at a time, the orchestrator last: restarts share the one restartingId,
  // and the floor should not lose its orchestrator while the rest come back.
  const [restartAll, setRestartAll] = useState<
    { current: string; done: number; total: number; failed: string[]; finished: boolean } | null
  >(null);
  const runRestartAll = async () => {
    const queue = useStore.getState().agents
      .filter((a) => a.ptyId)
      .sort((a, b) => Number(!!a.isGod) - Number(!!b.isGod))
      .map((a) => a.id);
    const failed: string[] = [];
    for (let i = 0; i < queue.length; i++) {
      // Re-read each time: every restart patches the agent it just replaced.
      const a = useStore.getState().agents.find((x) => x.id === queue[i]);
      if (!a) continue;
      setRestartAll({ current: a.name, done: i, total: queue.length, failed: [...failed], finished: false });
      await restartAgent(a, a.model, { resume: true });
      if (useStore.getState().restartErrors[a.id]) failed.push(a.name);
    }
    setRestartAll({ current: '', done: queue.length, total: queue.length, failed, finished: true });
  };
  const restartAllRunning = !!restartAll && !restartAll.finished;

  // The token meter is scaled to the agent's own limit when set, else the floor
  // token budget — so each bar reads as "tokens used vs budget" with the remaining
  // headroom visible, never pinned to a useless 100%.
  const floorCap = tokenCap && tokenCap > 0 ? tokenCap : DEFAULT_TOKEN_CAP;
  // Fleet totals across the roster (for the AGENTS summary band).

  return (
    <Scroll>
      {editAgent && (
        <EditAgentModal agent={editAgent} onClose={() => setEditAgent(null)} />
      )}

      <Section title={t('commandCenter.agents')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          {restartAll && (
            <span role="status" style={{
              fontFamily: 'var(--cth-font-ui)', fontSize: 12,
              color: !restartAll.finished ? 'var(--cth-ink-500)'
                : restartAll.failed.length ? 'var(--cth-coral-text)' : 'var(--cth-status-success)'
            }}>
              {!restartAll.finished
                ? t('commandCenter.restartAllProgress', { name: restartAll.current, n: restartAll.done + 1, total: restartAll.total })
                : restartAll.failed.length
                  ? t('commandCenter.restartAllFailed', { ok: restartAll.total - restartAll.failed.length, total: restartAll.total, names: restartAll.failed.join(', ') })
                  : t('commandCenter.restartAllDone', { total: restartAll.total })}
            </span>
          )}
          <button
            onClick={() => void runRestartAll()}
            disabled={restartAllRunning || !!restarting}
            className="cth-ghost-btn"
            style={{
              height: 30, padding: '0 12px', border: 'none', flexShrink: 0, marginInlineStart: 'auto',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              borderRadius: 'var(--cth-radius-btn)',
              background: 'var(--cth-mint-light)', color: 'var(--cth-ink-800)',
              fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12,
              cursor: restartAllRunning || restarting ? 'default' : 'pointer',
              opacity: restartAllRunning || restarting ? 0.6 : 1
            }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden="true"
              style={{ color: 'var(--cth-mint-text)' }}>
              <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.4V7h-3.6"
                stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('commandCenter.restartAll')}
          </button>
        </div>
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
                <SpritePortrait character={a.character} scale={1} />
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
                      flexShrink: 0, padding: '2px 7px', borderRadius: 'var(--cth-radius-input)',
                      background: 'var(--cth-lilac-light)', color: 'var(--cth-lilac-text)',
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
                {restartErrors[a.id] && (
                  <div role="alert" style={{ marginTop: 4, fontSize: 11, color: 'var(--cth-coral-text)' }}>
                    {t('commandCenter.restartFailedWhy', { error: restartErrors[a.id] })}
                  </div>
                )}
              </div>

              {/* Both actions, on the row. A menu behind three dots hides two
                  buttons behind an extra click and gives no clue what is in
                  there; there is room for both. */}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => void restartAgent(a, a.model, { resume: true })}
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
                    style={{ color: 'var(--cth-mint-text)' }}>
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
                    style={{ color: 'var(--cth-lemon-text)' }}>
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
    <span style={{ flex: 1, fontFamily: 'var(--cth-font-mono)', fontSize: 13, lineHeight: '12px', color: 'var(--cth-sky-text)', whiteSpace: 'nowrap', overflow: 'hidden', minWidth: 0 }}>
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
  // control-edge, not ink-100: the divider ink measured 1.23:1 around these boxes
  // in dark mode and 1.25:1 in light — a field you cannot see the edge of.
  boxShadow: 'inset 0 0 0 1px var(--cth-control-edge)', borderRadius: 'var(--cth-radius-input)',
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


