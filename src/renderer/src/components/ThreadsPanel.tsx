import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PixelButton } from './PixelButton';
import { ChevronIcon } from './TabIcons';
import { useRtl } from '@/i18n/useDirection';
import { DEFAULT_GOD_NAME } from '@shared/godIdentity';
import { useStore } from '@/store/store';

/** "2h", "15m", "just now" — the same short form the commit log uses two tabs
 *  over. A full locale timestamp ("9/14/2026, 9:44:01 AM") is four times the
 *  width to say something nobody reads to the second, and it pushed the sender
 *  and the act chip into the wrap. */
function ago(iso: string, t: TFunction): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return t('threads.justNow');
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

// Derive the message shape from the preload-exposed API so the renderer never
// reaches across project boundaries for a type (window.cth is globally typed).
type HiveMessage = Awaited<ReturnType<Window['cth']['hiveInbox']>>[number];

/**
 * Human-readable threaded view of an agent's hive inbox. Groups messages by
 * `conversation`, renders each as a collapsible thread, and lets the human reply
 * inline (sent as the "human" sender via window.cth.hiveSend).
 */
export interface ThreadsPanelProps {
  agentId: string;
}

interface Thread {
  conversation: string;
  subject: string;
  messages: HiveMessage[];
}

// The act, as INK on the word rather than a ring around it. Boxed, these were
// seven outlined chips in seven hues stacked down a white card — the loudest
// thing in a panel whose content is the message text. `-text` variants because
// this is now type, and type has to clear 4.5:1 where a border did not.
const ACT_COLOR: Record<string, string> = {
  request: 'var(--cth-peach-text)', inform: 'var(--cth-sky-text)', propose: 'var(--cth-lilac-text)',
  query: 'var(--cth-lemon-text)', agree: 'var(--cth-mint-text)', refuse: 'var(--cth-coral-text)',
  done: 'var(--cth-mint-text)'
};

function groupThreads(msgs: HiveMessage[], noSubject: string): Thread[] {
  const by = new Map<string, HiveMessage[]>();
  for (const m of msgs) {
    const arr = by.get(m.conversation) ?? [];
    arr.push(m);
    by.set(m.conversation, arr);
  }
  return [...by.entries()]
    .map(([conversation, list]) => {
      const sorted = [...list].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      return { conversation, subject: sorted[0]?.subject || noSubject, messages: sorted };
    })
    .sort((a, b) => {
      const la = a.messages[a.messages.length - 1].created_at;
      const lb = b.messages[b.messages.length - 1].created_at;
      return la < lb ? 1 : -1; // newest activity first
    });
}

export function ThreadsPanel({ agentId }: ThreadsPanelProps) {
  const { t } = useTranslation();
  const rtl = useRtl();
  // The hive addresses the orchestrator as 'god'. That is the wire id, not a
  // name, and it was rendering raw as the sender of every message he sends.
  const godName = useStore((st) => st.agents.find((a) => a.isGod)?.name) ?? DEFAULT_GOD_NAME;
  const senderName = (from: string) => (from === 'god' ? godName : from);
  const [messages, setMessages] = useState<HiveMessage[]>([]);
  const [openThreads, setOpenThreads] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const inbox = await window.cth.hiveInbox(agentId);
        if (alive) setMessages(inbox);
      } catch { /* keep last good state */ }
    };
    load();
    const timer = setInterval(load, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [agentId]);

  const threads = useMemo(() => groupThreads(messages, t('threads.noSubject')), [messages, t]);

  const sendReply = async (last: HiveMessage) => {
    const body = (drafts[last.conversation] ?? '').trim();
    if (!body) return;
    await window.cth.hiveSend({
      to: last.from, act: 'inform', conversation: last.conversation,
      in_reply_to: last.id, subject: 'Re: ' + last.subject, body
    }, 'human');
    setDrafts(d => ({ ...d, [last.conversation]: '' }));
  };

  if (threads.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--cth-paper-200)' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--cth-ink-700)', textAlign: 'center', maxWidth: 280 }}>
          {t('threads.empty')}
        </p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--cth-space-3)', background: 'var(--cth-paper-200)', display: 'flex', flexDirection: 'column', gap: 'var(--cth-space-3)' }}>
      {threads.map(thread => {
        const open = openThreads[thread.conversation] ?? true;
        const last = thread.messages[thread.messages.length - 1];
        return (
          // One card, one surface. This was a panel on a panel on a panel: a
          // cream header inside a white card on a paper ground, three
          // near-white layers whose only separation was a hairline, which is
          // why the whole thing read as overlapping sheets. The card is the
          // only lifted thing now; everything inside it shares its ground.
          <div key={thread.conversation} style={{
            background: 'var(--cth-cream-50)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-100), var(--cth-shadow-sm)',
            borderRadius: 'var(--cth-radius-card)',
            overflow: 'hidden'
          }}>
            <button
              onClick={() => setOpenThreads(s => ({ ...s, [thread.conversation]: !open }))}
              aria-expanded={open}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                padding: '10px 14px', border: 'none', cursor: 'pointer', background: 'transparent',
                fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13,
                lineHeight: '18px', color: 'var(--cth-ink-900)'
              }}
            >
              <span style={{
                display: 'inline-flex', flexShrink: 0, color: 'var(--cth-ink-500)',
                transform: open ? 'rotate(90deg)' : 'none',
                transition: 'transform 120ms ease'
              }}><ChevronIcon /></span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {thread.subject}
              </span>
              {thread.messages.some(m => m.needs_human) && (
                <span style={{
                  flexShrink: 0, padding: '0 8px',
                  fontSize: 11, lineHeight: '18px', fontWeight: 600,
                  color: 'var(--cth-coral-text)', background: 'var(--cth-coral-light)',
                  borderRadius: 'var(--cth-radius-input)'
                }}>{t('threads.needsYou')}</span>
              )}
              <span style={{
                flexShrink: 0, minWidth: 18, textAlign: 'center', padding: '0 6px',
                fontFamily: 'var(--cth-font-mono)', fontSize: 11, lineHeight: '18px',
                color: 'var(--cth-ink-500)', background: 'var(--cth-paper-100)',
                borderRadius: 'var(--cth-radius-input)'
              }}>{thread.messages.length}</span>
            </button>

            {open && (
              <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column' }}>
                {thread.messages.map((m, i) => {
                  const isExp = expanded[m.id];
                  const long = m.body.length > 120;
                  const shown = isExp || !long ? m.body : m.body.slice(0, 120) + '…';
                  return (
                    // A hairline BETWEEN messages, not a rule down the side of
                    // each one. The old left border ran the full height of
                    // every message including its own whitespace, so a thread
                    // read as a stack of quoted blocks rather than a sequence.
                    <div key={m.id} style={{
                      padding: '10px 0',
                      borderTop: i === 0 ? 'none' : '1px solid var(--cth-ink-100)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '18px', fontWeight: 700, color: 'var(--cth-ink-900)' }}>{senderName(m.from)}</span>
                        <span style={{
                          fontFamily: 'var(--cth-font-ui)', fontSize: 11, lineHeight: '18px', fontWeight: 600,
                          color: ACT_COLOR[m.act] ?? 'var(--cth-ink-500)'
                        }}>{m.act}</span>
                        <span style={{ marginInlineStart: 'auto', fontFamily: 'var(--cth-font-mono)', fontSize: 11, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                          {ago(m.created_at, t)}
                        </span>
                      </div>
                      <div dir={rtl ? 'auto' : undefined} style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink-700)', marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {shown}
                        {long && (
                          <button
                            onClick={() => setExpanded(s => ({ ...s, [m.id]: !isExp }))}
                            style={{ marginInlineStart: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--cth-lilac-text)', fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600, padding: 0 }}
                          >{isExp ? t('threads.less') : t('threads.more')}</button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* One field, the same shape the agent composer uses: the box
                    you type in and the button under it share a border, and
                    focusing the text lights the whole thing. Two stacked
                    rectangles with a gap between them read as two controls
                    that happen to be near each other. */}
                <div className="cth-field" style={{
                  display: 'flex', flexDirection: 'column',
                  background: 'var(--cth-paper-100)', marginTop: 4
                }}>
                  <textarea
                    className="cth-input cth-input-bare"
                    dir={rtl ? 'auto' : undefined}
                    value={drafts[thread.conversation] ?? ''}
                    onChange={e => setDrafts(d => ({ ...d, [thread.conversation]: e.target.value }))}
                    placeholder={t('threads.replyPlaceholder', { name: senderName(last.from) })}
                    rows={2}
                    style={{
                      resize: 'vertical', width: '100%', boxSizing: 'border-box',
                      padding: '9px 12px 4px',
                      fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '18px',
                      color: 'var(--cth-ink-900)', background: 'transparent', border: 'none'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 6px 6px' }}>
                    <PixelButton size="sm" onClick={() => sendReply(last)} disabled={!(drafts[thread.conversation] ?? '').trim()}>
                      {t('threads.send')}
                    </PixelButton>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
