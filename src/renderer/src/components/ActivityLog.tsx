import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from './Icon';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { useStore, type Agent } from '@/store/store';
import type { ActivityRow, ActivityTone } from '@shared/activityFeed';

/**
 * What the agent is saying and doing — the pane you read instead of the terminal.
 *
 * Two kinds of line, and they are not equals. What the agent SAYS is the thing a
 * person opened this to read, so it gets the full card: markdown, the agent's
 * name, its accent down the side. What it DOES is the work between those — one
 * quiet line each, grouped, colour-coded by KIND rather than by tool, because
 * reading a file and rewriting one carry different risk and must not look the
 * same at a glance.
 *
 * Markdown, because agents write it: headings, lists, `code`, a table. Through
 * the app's own MarkdownPreview, which renders to React elements with no HTML
 * sink — agent output is untrusted and there is exactly one safe renderer here.
 *
 * Read-only by construction: there is nothing to type into.
 */

/** How often the transcript is re-read.
 *
 *  600ms because this is the only thing standing in for a live stream: the
 *  engine writes each block as it finishes it, so the interval IS the latency
 *  between an agent saying something and a person seeing it. A second and a
 *  half read as a pane that had stopped. The read is a 512KB tail parse of a
 *  local file — cheap enough to do often, and it stops when the pane unmounts. */
const POLL_MS = 600;

/** Six colours a person can learn. Anything unrecognised is ink, which reads as
 *  "something happened" rather than as a category that does not exist. */
const TONES: Record<ActivityTone, { icon: IconName; color: string; tint: string }> = {
  read:     { icon: 'code',        color: 'var(--cth-sky)',   tint: 'var(--cth-sky-light)' },
  write:    { icon: 'edit',        color: 'var(--cth-lemon)', tint: 'var(--cth-lemon-light)' },
  run:      { icon: 'terminal',    color: 'var(--cth-mint)',  tint: 'var(--cth-mint-light)' },
  search:   { icon: 'web',         color: 'var(--cth-sky)',   tint: 'var(--cth-sky-light)' },
  delegate: { icon: 'send',        color: 'var(--cth-coral)', tint: 'var(--cth-coral-light)' },
  plan:     { icon: 'ledger',      color: 'var(--cth-ink-700)', tint: 'var(--cth-paper-100)' },
  other:    { icon: 'sparkle',     color: 'var(--cth-ink-500)', tint: 'var(--cth-paper-100)' }
};

/** Runs of work between two things the agent said. Grouping them is what turns
 *  forty lines of tool calls into one readable block. */
type Chunk =
  | { kind: 'say'; row: ActivityRow; key: string }
  | { kind: 'ask'; row: ActivityRow; key: string }
  | { kind: 'did'; rows: ActivityRow[]; key: string };

function chunk(rows: readonly ActivityRow[]): Chunk[] {
  const out: Chunk[] = [];
  rows.forEach((row, i) => {
    if (row.kind === 'say') { out.push({ kind: 'say', row, key: `s${i}` }); return; }
    // The human's own message stands alone, like the agent's — it is half the
    // conversation, not a step in a run of work.
    if (row.kind === 'ask') { out.push({ kind: 'ask', row, key: `a${i}` }); return; }
    const last = out[out.length - 1];
    if (last && last.kind === 'did') last.rows.push(row);
    else out.push({ kind: 'did', rows: [row], key: `d${i}` });
  });
  return out;
}

export function ActivityLog({ agent }: { agent: Agent }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  // Stick to the bottom while the reader is at the bottom, and stop the moment
  // they scroll up — a feed that yanks you back to the end is unreadable.
  const pinned = useRef(true);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const next = await window.cth.agentActivity(agent.id, 200);
        if (live && Array.isArray(next)) setRows(next as ActivityRow[]);
      } catch { /* no transcript yet — the agent has not started talking */ }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [agent.id]);

  // Follow the bottom as the feed grows — after paint, not during it. Setting
  // scrollTop in the same tick as the change uses the PREVIOUS scrollHeight, so
  // a tall row (a long reply) lands a screen short of the end, which reads as
  // the pane refusing to follow. `agent.status` is a dependency because the
  // live line appears and disappears under the last row.
  useEffect(() => {
    if (!pinned.current) return;
    const el = scroller.current;
    if (!el) return;
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [rows, agent.status, agent.action]);

  // Switching agents starts at the bottom of THEIR feed, not wherever the last
  // one was left.
  useEffect(() => { pinned.current = true; }, [agent.id]);

  const chunks = useMemo(() => chunk(rows), [rows]);
  const accent = `var(--cth-${agent.accent}, var(--cth-sky))`;

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--cth-paper-100)' }}>
      <div
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px 24px' }}
      >
        {chunks.length === 0 && (
          <div style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-500)' }}>
            {t('activity.nothingYet', { name: agent.name })}
          </div>
        )}
        {chunks.map((c) => (c.kind === 'say'
          ? <Said key={c.key} row={c.row} name={agent.name} accent={accent} />
          : c.kind === 'ask'
            ? <Asked key={c.key} row={c.row} label={t('activity.ownerLabel')} />
            : <Did key={c.key} rows={c.rows} label={t('activity.workingLabel')} />))}
        {/* THE GAP BETWEEN SENDING AND HEARING BACK.
            Everything above is history — it only appears once the agent has
            written it down. Press Send and, until the first line lands, the
            pane is exactly as it was: no queue any more, no reply yet, nothing
            saying anyone is there. This is the live bit, and it is the only
            thing on this page that is not the transcript. */}
        <Live agent={agent} accent={accent} newestAt={rows[rows.length - 1]?.at} />
      </div>
    </div>
  );
}

/** What the agent is doing RIGHT NOW, from its live status rather than the
 *  transcript — the one line on this page that is not history.
 *
 *  Silent when idle, deliberately: a permanent "waiting" would make the pane
 *  look busy when nothing is. `action` is the specific thing (its own words,
 *  e.g. "using Bash"), shown beside the status when it says more than the
 *  status already does. */
function Live({ agent, accent, newestAt }: { agent: Agent; accent: string; newestAt?: number }) {
  const { t } = useTranslation();
  const sentAt = useStore((s) => s.lastSentAt[agent.id]);
  if (!agent.ptyId) return null;

  // THE QUIETEST MOMENT, and the one that needed saying most: the message is
  // delivered so the queue is empty, and the engine has not woken up so the
  // status is still idle. Both of the things every surface keys off say
  // "nothing happening", and the honest answer is "it has your message".
  //
  // Answered means the transcript has grown since we sent — that is what makes
  // this end by itself rather than on a timer.
  const answered = newestAt !== undefined && sentAt !== undefined && newestAt >= sentAt;
  const waiting = agent.status === 'idle' && sentAt !== undefined && !answered;
  if (agent.status === 'idle' && !waiting) return null;

  if (waiting) {
    return (
      <div aria-live="polite" style={{
        display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 4px',
        fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, lineHeight: '18px',
        color: 'var(--cth-ink-500)'
      }}>
        <span className="cth-dots" aria-hidden><i /><i /><i /></span>
        <span>{t('activity.sentWaiting', { name: agent.name })}</span>
      </div>
    );
  }

  const key = ['thinking', 'compacting', 'looping'].includes(agent.status) ? agent.status : 'working';
  const label = t(`activity.${key}`, { name: agent.name });
  const action = agent.action && agent.action !== 'idle' && !label.toLowerCase().includes(agent.action.toLowerCase())
    ? agent.action
    : undefined;

  return (
    <div
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 4px',
        fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, lineHeight: '18px',
        color: agent.status === 'looping' ? 'var(--cth-coral-text)' : accent
      }}
    >
      <span className="cth-dots" aria-hidden><i /><i /><i /></span>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {action && (
        <span style={{
          minWidth: 0, color: 'var(--cth-ink-500)', fontWeight: 400,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
        }}>{action}</span>
      )}
    </div>
  );
}

/** The agent talking. Markdown, its name, its accent down the left edge — this
 *  is the thing a person is here to read, so it is the thing that looks like it. */
function Said({ row, name, accent }: { row: ActivityRow; name: string; accent: string }) {
  return (
    <div style={{
      margin: '14px 0',
      background: 'var(--cth-cream-50)',
      boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
      borderInlineStart: `3px solid ${accent}`,
      borderRadius: 'var(--cth-radius-input)',
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8,
        padding: '8px 14px 0',
        fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, fontWeight: 700,
        letterSpacing: '0.04em', textTransform: 'uppercase', color: accent
      }}>
        <span>{name}</span>
        {row.at && (
          <span style={{ fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: 'var(--cth-ink-500)' }}>
            {new Date(row.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      <div style={{ padding: '2px 14px 10px', fontFamily: 'var(--cth-font-ui)', fontSize: 13.5, lineHeight: '21px' }}>
        <MarkdownPreview source={row.text} variant="card" />
      </div>
    </div>
  );
}

/**
 * What the human said.
 *
 * The view used to show only the agent's side: answers with the questions cut
 * out, which reads as a monologue and makes a short reply look like a non
 * sequitur. Deliberately the plainer card of the two — inset from the margin,
 * no accent bar, the agent is the one being watched here — but unmistakably a
 * turn in the same conversation.
 */
function Asked({ row, label }: { row: ActivityRow; label: string }) {
  return (
    <div style={{
      margin: '14px 0 14px 28px',
      background: 'var(--cth-paper-100)',
      boxShadow: 'inset 0 0 0 1px var(--cth-ink-200)',
      borderRadius: 'var(--cth-radius-input)',
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 8,
        padding: '8px 14px 0',
        fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, fontWeight: 700,
        letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--cth-ink-500)'
      }}>
        <span>{label}</span>
        {row.at && (
          <span style={{ fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: 'var(--cth-ink-400)' }}>
            {new Date(row.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      <div style={{
        padding: '2px 14px 10px',
        fontFamily: 'var(--cth-font-ui)', fontSize: 13.5, lineHeight: '21px',
        color: 'var(--cth-ink-700)'
      }}>
        <MarkdownPreview source={row.text} variant="card" />
      </div>
    </div>
  );
}

/** A run of work. One line each, and a coloured chip naming what kind it was —
 *  the colour is the fast read, the words are there when the colour is not
 *  enough, and neither of them is a wall of terminal output. */
function Did({ rows, label }: { rows: ActivityRow[]; label: string }) {
  return (
    <div style={{ margin: '8px 0 8px 3px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{
        fontFamily: 'var(--cth-font-ui)', fontSize: 10.5, fontWeight: 700,
        letterSpacing: '0.06em', textTransform: 'uppercase',
        color: 'var(--cth-ink-400, var(--cth-ink-500))', margin: '2px 0 4px'
      }}>{label}</div>
      {rows.map((row, i) => {
        const tone = TONES[row.tone ?? 'other'] ?? TONES.other;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ ...chipStyle, background: tone.tint, color: tone.color }}>
              <Icon name={tone.icon} style={{ width: 11, height: 11 }} />
              {row.text}
            </span>
            {row.detail && (
              <span style={{
                minWidth: 0, flex: 1,
                fontFamily: 'var(--cth-font-mono)', fontSize: 12, lineHeight: '18px',
                color: 'var(--cth-ink-500)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }} title={row.detail}>{row.detail}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const chipStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
  padding: '2px 8px', borderRadius: 'var(--cth-radius-input)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, fontWeight: 600, lineHeight: '17px'
};
