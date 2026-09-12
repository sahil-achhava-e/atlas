import { ClipboardEvent, DragEvent, KeyboardEvent, type MouseEvent as ReactMouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { RealtimeMichaelToggle } from './RealtimeMichaelToggle';
import { CostHud } from '@/realtime/CostHud';
import { Icon } from './Icon';
import { useStore, type Agent, type QueuedMessage } from '@/store/store';
import { clearTerminalDraft, dismissTerminalPicker, terminalAutomationBlockFor } from './terminalPool';
import type { TerminalAutomationBlock } from './terminalAutomation';
import { useTerminalFontSize } from './terminalFontSize';
import { isComposingKey } from '@shared/imeGuard';
import { useRtl } from '@/i18n/useDirection';

const EMPTY_QUEUE: QueuedMessage[] = [];

/** A file/image attached to the draft. Travels to the agent as a PATH it Reads. */
interface Attachment {
  path: string;
  name: string;
}

// Prepended (only to the enqueued value, never the visible draft) when the

export interface MessageQueueComposerProps {
  agent: Agent;
}

/**
 * Lets the user keep messaging an agent whose terminal is mid-run. Typed
 * messages park in a per-agent queue and are submitted to the agent's Claude
 * TUI one-by-one as soon as it goes idle (see useHive's flush loop).
 */
export function MessageQueueComposer({ agent }: MessageQueueComposerProps) {
  const { t } = useTranslation();
  const rtl = useRtl();
  const queue = useStore((s) => s.messageQueues[agent.id]) ?? EMPTY_QUEUE;
  const enqueueMessage = useStore((s) => s.enqueueMessage);
  const removeQueuedMessage = useStore((s) => s.removeQueuedMessage);
  const releaseQueuedMessage = useStore((s) => s.releaseQueuedMessage);
  const clearQueue = useStore((s) => s.clearQueue);

  // Draft lives in the store, keyed by agent — switching agents remounts this
  // component, and component-local state would silently eat the typed text.
  const text = useStore((s) => s.drafts[agent.id] ?? '');
  const setDraft = useStore((s) => s.setDraft);
  const setText = (t: string) => setDraft(agent.id, t);

  // Free Flow voice dictation (entry point A). The mic button shows only when the
  // feature is enabled in Settings; a transcript is appended to this draft for
  // review before sending (never auto-sent). When enabled but no Groq key is set,
  // the button stays VISIBLE but DISABLED with a tooltip pointing to Settings
  // The draft box is the terminal's twin — it should read at the same size the
  // agent's output does, at every zoom level.
  const composerFontSize = 13;
  const composerLineHeight = 20;

  const idle = agent.status === 'idle';

  // Only the god/Michael agent gets the delegation toggle. Default OFF.

  // Files/images staged for the next message. Component-local: switching agents
  // remounts this component, so attachments are cleared on tab switch (drafts
  // persist in the store, attachments deliberately don't carry over).
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const addAttachments = (incoming: Attachment[]) =>
    setAttachments((prev) => {
      const seen = new Set(prev.map((a) => a.path));
      const fresh = incoming.filter((a) => a.path && !seen.has(a.path));
      return fresh.length ? [...prev, ...fresh] : prev;
    });

  const removeAttachment = (path: string) =>
    setAttachments((prev) => prev.filter((a) => a.path !== path));

  // '+' button → OS picker (images group + all files).
  const pickFiles = async () => {
    try {
      const res = await window.cth.attachFiles();
      if (res.ok) { setAttachError(null); addAttachments(res.files); }
      else if (res.error && res.error !== 'cancelled') setAttachError(res.error);
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : String(e));
    }
  };

  // Drop files onto the composer → resolve each to its absolute path.
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (!dropped.length) return;
    const atts = dropped
      .map((f) => ({ path: window.cth.pathForFile(f), name: f.name }))
      .filter((a) => a.path);
    if (atts.length) addAttachments(atts);
  };

  // Paste a screenshot (no path → persist the native clipboard image to a temp
  // file) or paste files copied from the OS file manager (carry a real path).
  const onPaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const hasImage = items.some((it) => it.kind === 'file' && it.type.startsWith('image/'));
    if (hasImage) {
      e.preventDefault();
      const res = await window.cth.saveClipboardImage();
      if (res.ok) addAttachments([res.file]);
      return;
    }
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      const atts = files
        .map((f) => ({ path: window.cth.pathForFile(f), name: f.name }))
        .filter((a) => a.path);
      if (atts.length) {
        e.preventDefault();
        addAttachments(atts);
      }
    }
  };

  const [attachError, setAttachError] = useState<string | null>(null);
  const canSend = !!text.trim() || attachments.length > 0;

  const queueIt = () => {
    if (!canSend) return;
    // Prepend an "Attached files:" block using the same path-based convention as
    // the Slack inbound path (useHive.ts) so agents Read the files directly.
    const body = attachments.length
      ? (text.trim()
          ? `${text}\n\nAttached files:\n`
          : 'Attached files:\n') + attachments.map((a) => `- ${a.path} (${a.name})`).join('\n')
      : text;
    enqueueMessage(agent.id, body);
    // Counted HERE, at the composer's submit, and NOT inside enqueueMessage:
    // that store action is also how work orders, Slack inbound, nudges and
    // compact commands reach an agent, and none of those is a person sending a
    // message. Past the isComposingKey guard in onKey, so an IME candidate
    // Enter never counts. (TELEMETRY.md → message_sent)
    void window.cth.trackMessageSent('composer');
    setText('');
    setAttachments([]);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposingKey(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      queueIt();
    }
  };

  // Delivery can be held back by the agent's own terminal (a half-typed draft or
  // an open slash-command picker owns the prompt). That used to be invisible —
  // the hint claimed it was sending while nothing moved — so poll it and say so.
  // Poll whenever something is queued, busy or not: a busy agent is exactly when
  // a user might have half-typed in the terminal above, and it is when the queue
  // is in use — so the hold must be reported then, not only once the agent idles.
  const block = useTerminalBlock(agent.ptyId, queue.length > 0);

  // Floor-wide auto-delivery pause (Command Center switch) also holds the queue.
  // Without saying so — and without the per-row "send now" override — messages
  // look permanently stuck with no explanation and no escape hatch.
  const deliveryPaused = useDeliveryPaused(agent.id, queue.length > 0);

  const statusHint = queue.length === 0
    ? null
    : block === 'draft'
    ? t('queueComposer.heldDraft', { name: agent.name })
    : block === 'picker'
    ? t('queueComposer.heldPicker', { name: agent.name })
    : block === 'exited'
    ? t('queueComposer.heldExited', { name: agent.name })
    : !idle
    ? t('queueComposer.busyQueued', { name: agent.name, count: queue.length })
    : deliveryPaused && !queue[0]?.manual
    ? t('queueComposer.heldFloor')
    : t('queueComposer.sendingOneByOne', { name: agent.name });

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
      onDragLeave={(e) => {
        // Only clear when the cursor actually leaves the composer, not on child enter.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragOver(false);
      }}
      onDrop={onDrop}
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--cth-ink-700)',
        background: 'var(--cth-cream-100)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        boxShadow: dragOver ? 'inset 0 0 0 2px var(--cth-lilac)' : undefined
      }}>
      {dragOver && (
        <span style={{
          fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, lineHeight: '12px',
          color: 'var(--cth-ink-700)', textAlign: 'center'
        }}>{t('queueComposer.dropToAttach')}</span>
      )}
      {/* Header: label, count, status, clear-all */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
          fontSize: 11, lineHeight: '12px',
          color: 'var(--cth-ink-700)'
        }}>{t('queueComposer.queue')}</span>
        {queue.length > 0 && (
          <span style={{
            fontSize: 11, padding: '1px 6px 0',
            background: 'var(--cth-cream-200)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)',
            fontFamily: 'var(--cth-font-ui)', color: 'var(--cth-ink-900)'
          }}>{queue.length}</span>
        )}
        {statusHint && (
          <span
            style={{
              fontSize: 13,
              color: idle ? 'var(--cth-ink-700)' : 'var(--cth-ink-500)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}
          >{statusHint}</span>
        )}
        {(block === 'draft' || block === 'picker') && agent.ptyId && (
          <button
            onClick={() => {
              // A picker and a draft are unblocked by different keys: Escape
              // closes the picker, Ctrl-U kills the input line. Sending Ctrl-U
              // at a picker leaves it open while telling automation the prompt
              // is free, which is how a queued message ends up typed into a
              // menu and marked delivered.
              if (block === 'picker') { dismissTerminalPicker(agent.ptyId!); return; }
              // Keep whatever was on the prompt — it lands in this composer so
              // the user can send it properly instead of losing it to Ctrl-U.
              const discarded = clearTerminalDraft(agent.ptyId!);
              if (discarded.trim()) setText(text ? `${text}\n${discarded}` : discarded);
            }}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
              fontFamily: 'var(--cth-font-ui)', fontSize: 13,
              color: 'var(--cth-ink-900)', textDecoration: 'underline'
            }}
          >{block === 'picker' ? t('queueComposer.closePicker') : t('queueComposer.recoverPrompt')}</button>
        )}
        {queue.length > 1 && (
          <button
            onClick={() => clearQueue(agent.id)}
            style={{
              marginLeft: 'auto', flexShrink: 0, whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              height: 26, padding: '0 10px',
              border: 'none', borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
              background: 'transparent', color: 'var(--cth-ink-500)',
              fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600,
              transition: 'background 120ms ease, color 120ms ease'
            }}
            className="cth-quiet-danger"
          >{t('queueComposer.clearAll')}</button>
        )}
      </div>

      {/* Pending list */}
      {queue.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          maxHeight: 132, overflowY: 'auto'
        }}>
          {queue.map((m, i) => (
            <QueuedMessageRow
              key={m.id}
              index={i}
              message={m}
              paused={deliveryPaused}
              onSendNow={() => releaseQueuedMessage(agent.id, m.id)}
              onRemove={() => removeQueuedMessage(agent.id, m.id)}
            />
          ))}
        </div>
      )}

      {/* Attached files/images — chips with a remove 'x', above the textarea. */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {attachments.map((a) => (
            <span
              key={a.path}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                maxWidth: '100%',
                padding: '2px 4px 2px 10px',
                background: 'var(--cth-cream-200)',
                boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)',
                fontFamily: 'var(--cth-font-mono)', fontSize: 13, lineHeight: '16px',
                color: 'var(--cth-ink-900)'
              }}
            >
              <span style={{ display: 'inline-flex', color: 'var(--cth-lemon)' }}><Icon name="folder" /></span>
              <span style={{
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 180
              }}>{a.name}</span>
              <button
                onClick={() => removeAttachment(a.path)}
                style={{
                  flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--cth-ink-500)', padding: 0,
                  display: 'inline-flex', alignItems: 'center'
                }}
              >
                <Icon name="x" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Composer — full-width input above a single tidy control bar (cc-ui-polish),
          with file/image attachment chips + paste-to-attach (rich-composer). */}
      <div className="cth-field" style={{
        display: 'flex', flexDirection: 'column',
        background: 'var(--cth-paper-100)'
      }}>
        <textarea
          dir={rtl ? 'auto' : undefined}
          className="cth-input cth-input-bare"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          rows={5}
          placeholder={idle ? t('queueComposer.messagePlaceholder', { name: agent.name }) : t('queueComposer.busyPlaceholder', { name: agent.name })}
          style={{
            width: '100%',
            resize: 'vertical',
            // Track the terminal's zoom (Cmd +/- or the terminal's own zoom
            // buttons) instead of a hardcoded 13px. On a large display the
            // terminal text scaled up while this box stayed tiny; box height is
            // derived from the same size so the visible line count is stable.
            minHeight: composerLineHeight * 5 + 14,
            maxHeight: composerLineHeight * 18,
            padding: '12px 14px',
            background: 'var(--cth-paper-100)',
            border: 'none',
            // Border lives in .cth-input so :focus can change it — an inline
            // boxShadow here would outrank the stylesheet and the focus state
            // would silently never apply.
            fontFamily: 'var(--cth-font-ui)',
            fontSize: composerFontSize, lineHeight: `${composerLineHeight}px`,
            color: 'var(--cth-ink-900)',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />
        {/* The control bar is INSIDE the field, under the text, so speaking,
            attaching and sending all read as things you do to this message.
            flexWrap so a narrow sidebar wraps rather than pushing Send off the
            edge. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          flexWrap: 'nowrap', minWidth: 0,
          padding: '8px 10px',
          background: 'var(--cth-cream-50)',
          borderTop: '1px solid var(--cth-ink-100)'
        }}>
          {/* Talk to the orchestrator. It lives HERE, at the message you would
              otherwise type, rather than on his floor card: speaking and typing
              are the same intent. */}
          <span style={{ flexShrink: 0, display: 'inline-flex' }}>
            {agent.isGod && <RealtimeMichaelToggle />}
          </span>
          <button
            onClick={pickFiles}
            aria-label={t('queueComposer.files')}
            className="cth-iconbar"
            data-label={t('queueComposer.files')}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, padding: 0, border: 'none', cursor: 'pointer', flexShrink: 0,
              borderRadius: 'var(--cth-radius-btn)',
              background: 'transparent', color: 'var(--cth-mint)',
              transition: 'background 120ms ease'
            }}
          ><Icon name="plus" /></button>
          {agent.isGod && <CostHud compact />}
          <span style={{ flex: 1 }} />
          {/* The one keystroke everybody gets wrong on a box that also takes
              multi-line input. Hidden while empty: it is instruction, not decor. */}
          {canSend && (
            <span style={{
              fontSize: 11, color: 'var(--cth-ink-500)',
              fontFamily: 'var(--cth-font-ui)',
              minWidth: 0, flexShrink: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>{t('queueComposer.enterHint')}</span>
          )}
          <button
            onClick={queueIt}
            disabled={!canSend}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 32, padding: '0 14px', border: 'none', flexShrink: 0,
              borderRadius: 'var(--cth-radius-btn)',
              cursor: canSend ? 'pointer' : 'not-allowed',
              background: canSend ? 'var(--cth-lilac)' : 'transparent',
              color: canSend ? '#FFFFFF' : 'var(--cth-ink-500)',
              boxShadow: canSend ? 'var(--cth-shadow-btn)' : 'none',
              fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 600,
              transition: 'background 120ms ease, box-shadow 120ms ease, color 120ms ease'
            }}
          >
            {t('commandBar.send')} <Icon name="send" />
          </button>
        </div>
        {attachError && (
          <div style={{
            padding: '8px 12px', fontSize: 12, lineHeight: '16px',
            color: 'var(--cth-coral)', background: 'var(--cth-coral-light)'
          }}>
            {t('queueComposer.attachFailed', { error: attachError })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Poll the pty's automation block while there is something waiting on it. The
 * flag lives in the terminal pool (a plain module map, not the store), so there
 * is nothing to subscribe to — a 1s tick while the queue is pending is enough. */
function useTerminalBlock(ptyId: string | undefined, active: boolean): TerminalAutomationBlock {
  const [block, setBlock] = useState<TerminalAutomationBlock>(null);
  useEffect(() => {
    if (!ptyId || !active) { setBlock(null); return; }
    const read = () => setBlock(terminalAutomationBlockFor(ptyId));
    read();
    const iv = setInterval(read, 1000);
    return () => clearInterval(iv);
  }, [ptyId, active]);
  // 'settling' is a sub-second gap between writes — not worth telling anyone.
  return block === 'settling' ? null : block;
}

/** Poll the floor-wide auto-delivery pause (main-process control state) while
 * this agent has messages waiting. 2s is plenty — the pause flips on human
 * timescales, and the drain re-reads the live snapshot before every send. */
function useDeliveryPaused(agentId: string, active: boolean): boolean {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!active) { setPaused(false); return; }
    let alive = true;
    const read = () => {
      window.cth.controlSnapshot(agentId)
        .then((s) => { if (alive) setPaused(!!s?.autoDeliveryPaused); })
        .catch(() => { /* main not ready — assume not paused */ });
    };
    read();
    const iv = setInterval(read, 2000);
    return () => { alive = false; clearInterval(iv); };
  }, [agentId, active]);
  return paused;
}

/**
 * One pending queue row. Collapsed it clamps to 2 lines; "see more" expands it
 * in place so a long message can be read without hovering for the tooltip. The
 * toggle only renders when the text actually clips, so short messages stay tidy.
 */
function QueuedMessageRow(
  { index, message, paused, onSendNow, onRemove }: {
    index: number;
    message: QueuedMessage;
    /** Floor-wide auto-delivery is paused — offer the per-message override. */
    paused: boolean;
    onSendNow: () => void;
    onRemove: () => void;
  }
) {
  const { t } = useTranslation();
  const rtl = useRtl();
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Measure against the CLAMPED box, so the toggle survives being expanded (the
  // expanded box never overflows and would otherwise report clipped = false).
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      if (expanded) return;
      // One line now, so the overflow that matters is horizontal.
      setClipped(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    // The panel is resizable — re-measure on width changes, not just text ones.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [message.text, expanded]);

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '6px 10px',
      background: 'var(--cth-paper-100)',
      boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-btn)'
    }}>
      <span style={{
        fontFamily: 'var(--cth-font-mono)', fontSize: 13,
        color: 'var(--cth-ink-500)', lineHeight: '18px', flexShrink: 0
      }}>{`${index + 1}.`}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div
          ref={bodyRef}
          dir={rtl ? 'auto' : undefined}
          style={{
            fontSize: 13, lineHeight: '18px',
            color: 'var(--cth-ink-900)',
            wordBreak: 'break-word',
            ...(expanded
              ? { maxHeight: 200, overflowY: 'auto' as const }
              : { whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' })
          }}
        >{message.text}</div>
        {(clipped || expanded || paused) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {(clipped || expanded) && (
              <button
                onClick={() => setExpanded((e) => !e)}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                  fontFamily: 'var(--cth-font-ui)', fontSize: 12, lineHeight: '16px',
                  fontWeight: 600, color: 'var(--cth-lilac)'
                }}
              >{expanded ? t('queueComposer.seeLess') : t('queueComposer.seeMore')}</button>
            )}
            {paused && !message.manual && (
              <button
                onClick={onSendNow}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                  fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '16px',
                  color: 'var(--cth-ink-900)', textDecoration: 'underline'
                }}
              >{t('queueComposer.sendNow')}</button>
            )}
            {paused && message.manual && (
              <span style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
                {t('queueComposer.sendingWhenFree')}
              </span>
            )}
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        className="cth-iconbar cth-quiet-danger"
        data-label={t('queueComposer.removeOne')}
        aria-label={t('queueComposer.removeOne')}
        style={{
          flexShrink: 0, border: 'none', background: 'transparent',
          cursor: 'pointer', color: 'var(--cth-ink-400)',
          width: 24, height: 24, padding: 0,
          borderRadius: 'var(--cth-radius-btn)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 120ms ease, color 120ms ease'
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}


