import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelBadge } from './PixelBadge';
import { PixelButton } from './PixelButton';
import { SpritePortrait } from './SpritePortrait';
import { MessageQueueComposer } from './MessageQueueComposer';
import { CommandCenterPanel } from './CommandCenterPanel';
import { disposeTerminal } from './terminalPool';
import { SidebarTabs } from './SidebarTabs';
import { TechnicalLog } from './TechnicalLog';
import { ThreadsPanel } from './ThreadsPanel';
import { AgentControlStrip } from './AgentControlStrip';
import { EditAgentModal } from './EditAgentModal';
import { ConfirmDialog } from './ConfirmDialog';
import { GitTab } from './GitTab';
import { EditIcon, CodeIcon, StopIcon } from './TabIcons';
import { AgentNameEditor } from './AgentNameEditor';
import { useStore, type Agent } from '@/store/store';

export interface AgentDetailPanelProps {
  agent: Agent;
}

export function AgentDetailPanel({ agent }: AgentDetailPanelProps) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);
  const [killOpen, setKillOpen] = useState(false);

  /* The header used to measure itself and swap labels for icons below 440px,
     because four labelled buttons left the name about six characters at the
     default 420px sidebar. The row is icon-only at every width now — the same
     treatment the boss's header uses — so there is no breakpoint to observe and
     no second layout to keep honest. */
  const headerRef = useRef<HTMLDivElement | null>(null);
  const simpleMode = useStore(s => s.simpleMode);
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


  // Michael gets the full command-center dashboard instead of the plain panel.
  if (agent.isGod) return <CommandCenterPanel agent={agent} />;

  const onKill = async () => {
    setKillOpen(false);
    if (!agent.ptyId) return;
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
        borderBottom: '1px solid var(--cth-ink-100)',
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
            // The SAME glyphs the boss's header wears, not the pixel set: the
            // two headers claim to be one treatment, and were drawn in two
            // different hands. Lemon edits, sky opens code, in both places.
            { key: 'edit', Glyph: EditIcon, tone: 'var(--cth-lemon)',
              label: t('agentDetail.editAria', { defaultValue: 'Edit this agent' }),
              onClick: () => setEditOpen(true), disabled: false },
            // v0.3.4: the IDE lives at agent level (replaces the old files tab)
            // — the full-window Monaco editor rooted at this agent's workspace.
            // Hidden in simple mode, like every other door onto a code editor.
            ...(simpleMode ? [] : [{ key: 'ide', Glyph: CodeIcon, tone: 'var(--cth-sky)',
              label: t('agentDetail.openIde'),
              onClick: () => useStore.getState().setIdeOpen(true, agent.id), disabled: false }])
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
              <a.Glyph />
            </button>
          ))}
          {/* Kill keeps its own treatment: it is the one control here that ends
              something, so it is the one that turns red under the pointer. */}
          {isReal && (
            <button
              className="cth-danger-hover"
              onClick={() => setKillOpen(true)}
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
              <StopIcon />
            </button>
          )}
        </span>
      </div>

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
                {/* Read-only: what the agent is saying and working on. The
                    engine's terminal is in focus mode, not here. */}
                <TechnicalLog agent={agent} />
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

      {killOpen && (
        <ConfirmDialog
          title={t('agentDetail.killConfirmTitle')}
          body={t('agentDetail.killConfirm', { name: agent.name })}
          confirmLabel={t('agentDetail.killConfirmAction')}
          destructive
          onCancel={() => setKillOpen(false)}
          onConfirm={onKill}
        />
      )}
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
      }}>{title}</div>
      <p style={{
        margin: 0, fontSize: 13, textAlign: 'center', color: 'var(--cth-ink-700)',
        maxWidth: 280
      }}>{children}</p>
    </div>
  );
}
