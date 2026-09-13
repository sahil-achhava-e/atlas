import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { isComposingKey } from '@shared/imeGuard';

/**
 * Send a note to one agent, without typing into its terminal.
 *
 * The note rides Claude Code's hook-return protocol: it is handed back as
 * `additionalContext` on the agent's next UserPromptSubmit or PostToolUse, so
 * it arrives as something the agent READ rather than as keystrokes injected
 * into a TUI that may be mid-render. Queued per agent, and a stalled agent
 * never drains its queue, so the oldest is dropped past twenty.
 *
 * WHAT THIS STRIP USED TO BE. Three more controls lived here — block tools
 * (deny every tool call at the PreToolUse boundary), stop after this step (a
 * clean halt at the next boundary), and 1:1 (tell the boss an agent is
 * reserved so it routes work elsewhere). They were removed from the UI at the
 * founder's call. The MACHINERY is untouched: pause, resume and halt are
 * driven by the voice path in realtimeActions.ts and still work there, and the
 * hive still records and reports `onHold`. What went is four buttons in a
 * strip that sits above every agent, permanently, whether or not you were ever
 * going to press them.
 */
interface Snapshot {
  paused: boolean;
  halted: boolean;
  autoDeliveryPaused: boolean;
  gatedTools: string[];
  pendingSteers: number;
}

export function AgentControlStrip({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [steer, setSteer] = useState('');
  const [note, setNote] = useState('');
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    window.cth.controlSnapshot(agentId).then((s) => { if (alive && s) setSnap(s); }).catch(() => { /* none */ });
    return () => { alive = false; };
  }, [agentId]);

  const flash = (m: string) => {
    setNote(m);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(''), 1800);
  };

  const sendSteer = async () => {
    const text = steer.trim();
    if (!text) return;
    const s = await window.cth.controlSteer(agentId, text);
    if (s) setSnap(s);
    setSteer('');
    flash(t('agentControl.flashSteer'));
  };

  // Still reported, because they can still be true — set by voice, not by a
  // button that used to be here.
  const status = [
    snap?.autoDeliveryPaused ? t('agentControl.deliveryPaused') : null,
    snap?.paused ? t('agentControl.toolsBlocked') : null,
    snap?.halted ? t('agentControl.halting') : null,
    snap?.pendingSteers ? t('agentControl.steersQueued', { count: snap.pendingSteers }) : null,
    note || null
  ].filter(Boolean);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '10px 12px', background: 'var(--cth-paper-100)',
      borderBottom: '1px solid var(--cth-ink-100)', flexShrink: 0
    }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="cth-input"
          value={steer}
          onChange={(e) => setSteer(e.target.value)}
          onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter') sendSteer(); }}
          placeholder={t('agentControl.steerPlaceholder')}
          aria-label={t('agentControl.steerAria')}
          style={{
            flex: 1, minWidth: 0, height: 26, padding: '0 10px', boxSizing: 'border-box',
            background: 'var(--cth-paper-100)', border: 'none',
            borderRadius: 'var(--cth-radius-input)',
            fontFamily: 'var(--cth-font-ui)',
            fontSize: 13, color: 'var(--cth-ink-900)', outline: 'none'
          }}
        />
        <PixelButton variant="secondary" size="sm" onClick={sendSteer} disabled={!steer.trim()}>
          <span aria-label={t('agentControl.steerAria')}>{t('agentControl.steer')}</span>
        </PixelButton>
      </div>
      {status.length > 0 && (
        <span style={{ fontSize: 11, color: 'var(--cth-ink-600)' }}>{status.join(' · ')}</span>
      )}
    </div>
  );
}
