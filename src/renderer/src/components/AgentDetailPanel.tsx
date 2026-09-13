import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelBadge } from './PixelBadge';
import { PixelButton } from './PixelButton';
import { SpritePortrait } from './SpritePortrait';
import { PtyTerminalView } from './PtyTerminalView';
import { terminalInstanceKey } from './terminalRecovery';
import { MessageQueueComposer } from './MessageQueueComposer';
import { CommandCenterPanel } from './CommandCenterPanel';
import { disposeTerminal } from './terminalPool';
import { SidebarTabs } from './SidebarTabs';
import { ThreadsPanel } from './ThreadsPanel';
import { AgentControlStrip } from './AgentControlStrip';
import { EditAgentModal } from './EditAgentModal';
import { GitTab } from './GitTab';
import { Icon } from './Icon';
import { AgentNameEditor } from './AgentNameEditor';
import { useStore, type Agent } from '@/store/store';
import { usePtyParser } from '@/hooks/usePtyParser';

export interface AgentDetailPanelProps {
  agent: Agent;
}

export function AgentDetailPanel({ agent }: AgentDetailPanelProps) {
  const { t } = useTranslation();
  const [openTerminalState, setOpenTerminalState] = useState<'idle' | 'opening' | 'ok' | 'error'>('idle');
  const [openTerminalError, setOpenTerminalError] = useState<string | undefined>();
  const [editOpen, setEditOpen] = useState(false);

  /* The header used to measure itself and swap labels for icons below 440px,
     because four labelled buttons left the name about six characters at the
     default 420px sidebar. The row is icon-only at every width now — the same
     treatment the boss's header uses — so there is no breakpoint to observe and
     no second layout to keep honest. */
  const headerRef = useRef<HTMLDivElement | null>(null);
  const archiveAgent = useStore(s => s.archiveAgent);
  const updateAgent = useStore(s => s.updateAgent);
  const renameAgent = useStore(s => s.renameAgent);
  const setFullscreen = useStore(s => s.setFullscreen);
  const fullscreenAgentId = useStore(s => s.fullscreenAgentId);
  const sidebarTab = useStore(s => s.sidebarTab);
  const setSidebarTab = useStore(s => s.setSidebarTab);
  const isReal = !!agent.ptyId;
  // While this agent is shown in the fullscreen overlay, the fullscreen view
  // owns the pty (it sizes it to fill the screen). Keeping the embedded terminal
  // mounted too means two xterms fight over the pty's cols/rows — which corrupts
  // the display and breaks scrolling. So we unmount the embedded one here; it
  // re-mounts and re-fits when fullscreen closes.
  const isFullscreenedHere = fullscreenAgentId === agent.id;

  const onPtyStream = usePtyParser(agent.id);

  // Michael gets the full command-center dashboard instead of the plain panel.
  if (agent.isGod) return <CommandCenterPanel agent={agent} />;

  const openTerminal = async () => {
    setOpenTerminalState('opening');
    setOpenTerminalError(undefined);
    try {
      const result = await window.cth.openTerminalAt(agent.cwd);
      if (result.ok) {
        setOpenTerminalState('ok');
        setTimeout(() => setOpenTerminalState('idle'), 1500);
      } else {
        setOpenTerminalState('error');
        setOpenTerminalError(result.error ?? 'unknown error');
        setTimeout(() => setOpenTerminalState('idle'), 4000);
      }
    } catch (e) {
      setOpenTerminalState('error');
      setOpenTerminalError(e instanceof Error ? e.message : String(e));
      setTimeout(() => setOpenTerminalState('idle'), 4000);
    }
  };

  const onKill = async () => {
    if (!agent.ptyId) return;
    if (!confirm(t('agentDetail.killConfirm', { name: agent.name }))) return;
    await window.cth.killPty(agent.ptyId);
    disposeTerminal(agent.ptyId);
    archiveAgent(agent.id);
  };

  return (
    <PixelPanel
      variant="default"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 0,
        overflow: 'hidden'
      }}
      noPadding
    >
      {/* Thin header strip */}
      <div ref={headerRef} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px',
        background: 'var(--cth-cream-100)',
        borderBottom: '1px solid var(--cth-ink-700)',
        flexShrink: 0
      }}>
        <div style={{
          width: 32, height: 32,
          background: `var(--cth-${agent.accent}-light)`,
          boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden',
          flexShrink: 0
        }}>
          <SpritePortrait character={agent.character} scale={1} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', minWidth: 0, lineHeight: '14px' }}>
            <AgentNameEditor
              name={agent.name}
              onCommit={(name) => renameAgent(agent.id, name)}
              uppercase
              fontSize={10}
            />
          </div>
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center', marginTop: 1,
            minWidth: 0, overflow: 'hidden'
          }}>
            <PixelBadge status={agent.status} />
            <span style={{
              fontSize: 13, color: 'var(--cth-ink-500)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>{agent.project}</span>
          </div>
        </div>
        {/* Built the way the boss's own header is: 32px icon buttons, each in
            its own tone, with the name on the shared hover bubble. Three
            labelled outline buttons plus a filled red square cost more width
            than the agent's name had, and read as a toolbar shouting at you.
            The tones match the boss's exactly — lemon edits, sky opens code —
            so the same action looks the same wherever you meet it. */}
        <span className="cth-iconbar" style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
          {[
            { key: 'edit', icon: 'edit' as const, tone: 'var(--cth-lemon)',
              label: t('agentDetail.editAria', { defaultValue: 'Edit this agent' }),
              onClick: () => setEditOpen(true), disabled: false },
            // v0.3.4: the IDE lives at agent level (replaces the old files tab)
            // — the full-window Monaco editor rooted at this agent's workspace.
            { key: 'ide', icon: 'code' as const, tone: 'var(--cth-sky)',
              label: t('agentDetail.openIde'),
              onClick: () => useStore.getState().setIdeOpen(true, agent.id), disabled: false },
            // The transient states ride the LABEL now rather than the button
            // face: they are feedback on a click you just made, and the bubble
            // is already where this row explains itself.
            { key: 'open', icon: 'terminal' as const,
              tone: openTerminalState === 'error' ? 'var(--cth-coral-text)'
                : openTerminalState === 'ok' ? 'var(--cth-mint-text)'
                : 'var(--cth-jade)',
              label: openTerminalState === 'opening' ? t('agentDetail.opening')
                : openTerminalState === 'ok' ? t('agentDetail.ok')
                : openTerminalState === 'error' ? t('agentDetail.err')
                : t('agentDetail.openTerminalAria'),
              onClick: openTerminal, disabled: openTerminalState === 'opening' }
          ].map((a) => (
            <button
              key={a.key}
              onClick={a.disabled ? undefined : a.onClick}
              disabled={a.disabled}
              data-label={a.label}
              aria-label={a.label}
              style={{
                width: 32, height: 32, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', background: 'transparent',
                cursor: a.disabled ? 'not-allowed' : 'pointer',
                opacity: a.disabled ? 0.5 : 1,
                borderRadius: 'var(--cth-radius-btn)',
                color: a.tone,
                transition: 'background 120ms ease, color 120ms ease'
              }}
            >
              <Icon name={a.icon} />
            </button>
          ))}
          {/* Kill keeps its own treatment: it is the one control here that ends
              something, so it is the one that turns red under the pointer. */}
          {isReal && (
            <button
              className="cth-danger-hover"
              onClick={onKill}
              data-label={t('agentDetail.killAria', { defaultValue: 'Stop and archive this agent' })}
              aria-label={t('agentDetail.killAria', { defaultValue: 'Stop and archive this agent' })}
              style={{
                width: 32, height: 32, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', background: 'transparent', cursor: 'pointer',
                borderRadius: 'var(--cth-radius-btn)',
                color: 'var(--cth-coral-text)',
                transition: 'background 120ms ease, color 120ms ease'
              }}
            >
              <Icon name="x" />
            </button>
          )}
        </span>
      </div>

      {openTerminalError && (
        <div style={{
          fontSize: 13, color: 'var(--cth-coral-text)',
          padding: '2px 12px',
          background: 'var(--cth-coral-light)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>{openTerminalError}</div>
      )}

      {/* #7C — operator control (pause / halt / steer) for live agents */}
      {isReal && <AgentControlStrip agentId={agent.id} />}

      {/* Tabs */}
      <SidebarTabs current={sidebarTab} onChange={setSidebarTab} />

      {/* Active tab body — fills remaining space */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {sidebarTab === 'terminal' && (
          isReal && agent.ptyId ? (
            isFullscreenedHere ? (
              <EmptyTab title={t('agentDetail.inFullscreen')}>
                {t('agentDetail.fullscreenDesc')}
              </EmptyTab>
            ) : (
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                <PtyTerminalView
                  key={terminalInstanceKey(agent.ptyId, agent.terminalGeneration)}
                  ptyId={agent.ptyId}
                  onStreamData={onPtyStream}
                  onUserPrompt={(t) => {
                    updateAgent(agent.id, { lastPrompt: t });
                    if (t.trim().toLowerCase() === '/clear') {
                      updateAgent(agent.id, { contextTokens: 0, contextLimit: undefined, progress: 0 });
                    }
                    void window.cth.historyAdd({ agentId: agent.id, cwd: agent.cwd, text: t });
                  }}
                  onToggleFullscreen={() => setFullscreen(agent.id)}
                  fullscreen={false}
                  embedded
                />
              </div>
              <MessageQueueComposer agent={agent} />
            </div>
            )
          ) : (
            <EmptyTab title={t('agentDetail.noPty')}>
              {t('agentDetail.noPtyDesc')}
            </EmptyTab>
          )
        )}

        {sidebarTab === 'git' && (
          <GitTab cwd={agent.cwd} />
        )}

        {sidebarTab === 'messages' && (
          <ThreadsPanel agentId={agent.id} />
        )}

      </div>

      {editOpen && (
        <EditAgentModal agent={agent} onClose={() => setEditOpen(false)} />
      )}
    </PixelPanel>
  );
}

function EmptyTab({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 16, gap: 8,
      background: 'var(--cth-paper-200)'
    }}>
      <div style={{
        fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, lineHeight: '14px',
        color: 'var(--cth-ink-500)'
      }}>{title.toUpperCase()}</div>
      <p style={{
        margin: 0, fontSize: 13, textAlign: 'center', color: 'var(--cth-ink-700)',
        maxWidth: 280
      }}>{children}</p>
    </div>
  );
}
