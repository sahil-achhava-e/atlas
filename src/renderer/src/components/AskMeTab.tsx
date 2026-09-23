import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { useStore } from '@/store/store';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { type HiveTask, type HumanQA, openQuestions, waitsOnHuman } from './TasksKanban';
import { openAsks } from '@shared/humanQA';
import { compareByNewestAsk } from './askMeOrder';
import { StatusGlyph } from './StatusGlyph';
import { SpritePortrait } from './SpritePortrait';
import { accentCss, accentFillCss } from '@/design/tokens';
import { isComposingKey } from '@shared/imeGuard';
import { useRtl } from '@/i18n/useDirection';

/**
 * ASK ME — first-class human feedback through the task system.
 *
 * Tasks the god can only move with the human's input sit here. An entry isn't
 * necessarily a question — it can be a TO-DO only the human can perform
 * (create an account, approve a purchase, provide credentials, test on a real
 * device). Each card shows the open ask, a place to respond (an answer, or a
 * "done, here's the result" confirmation), and the CASCADE of downstream
 * tasks stuck waiting on this one — so "why isn't X done?" reads as "ah,
 * because I still owe something here."
 *
 * Sending an answer does two things:
 *   1. writes it into the card's humanQA entry in hive/tasks.json (the
 *      decision is documented ON the task, forever), and
 *   2. mails the god so it picks the answer up, unblocks the card, and the
 *      work continues — no separate HumanQuestion.md side-channel anymore.
 */

const POLL_MS = 5000;

function parse(raw: unknown): HiveTask[] {
  const list = (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown }).tasks))
    ? (raw as { tasks: HiveTask[] }).tasks
    : [];
  return list.filter((t) => !!t && typeof t === 'object');
}

/** One row on the board: a single open ask, and the card it sits on. The board
 *  is a list of QUESTIONS, not of cards — a card with three open asks is three
 *  rows, because it is three things the human owes an answer to. */
interface AskRow {
  task: HiveTask;
  ask: HumanQA;
  key: string;
  position: number;
  total: number;
}

/** Where this row's half-typed answer lives in the store.
 *
 *  Per ASK, not per task: a card with three open questions needs three drafts,
 *  and keying them all on the task id meant typing an answer to one appeared in
 *  the box of the other two and the first Send took the lot. */
function draftKey(row: AskRow): string {
  return row.key;
}

/** All tasks transitively waiting on `id` (dependents chain), cycle-safe. */
function dependentsTree(id: string, all: HiveTask[], seen = new Set<string>()): HiveTask[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const direct = all.filter((t) => Array.isArray(t.dependsOn) && t.dependsOn.includes(id) && t.status !== 'done');
  return direct.flatMap((d) => [d, ...dependentsTree(d.id, all, seen)]);
}

export function AskMeTab() {
  const { t: translate } = useTranslation();
  const rtl = useRtl();
  const agents = useStore((s) => s.agents);
  const restorable = useStore((s) => s.restorableAgents);
  const [tasks, setTasks] = useState<HiveTask[]>([]);
  // Drafts live in the STORE (keyed by task id) — switching tabs unmounts this
  // view, and a half-typed answer must survive the round trip.
  const drafts = useStore((s) => s.answerDrafts);
  const setAnswerDraft = useStore((s) => s.setAnswerDraft);
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const [sending, setSending] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try { setTasks(parse(await window.cth.hiveTasks())); } catch { /* keep last good */ }
  }, []);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [refresh]);

  /** The agent behind an ask, for its face and its colour. A question is from
   *  SOMEBODY, and a board of identical white cards was hiding that. */
  const agentFor = (id?: string) =>
    id ? agents.find((a) => a.id === id) ?? restorable.find((a) => a.id === id) : undefined;

  /** How long this has been sitting on you. A blocked agent is idle time, and
   *  nothing on the card said how much. */
  const waited = (iso?: string): string | null => {
    if (!iso) return null;
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (!Number.isFinite(mins) || mins < 1) return translate('askMe.justNow');
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  };

  const nameFor = (id?: string): string | undefined =>
    id ? (agents.find((a) => a.id === id)?.name ?? restorable.find((a) => a.id === id)?.name ?? id) : undefined;

  // Newest ask at the top, oldest at the bottom. Before this the board had no
  // comparator at all, so a question's position was an accident of where its
  // card sat in tasks.json. `filter` already returns a fresh array, so sorting
  // in place never touches the store's own ordering. The ask each card is
  // ranked by comes from openQuestion() — the same predicate waitsOnHuman uses
  // — and only this OUTER list is sorted; a card's humanQA history stays
  // chronological (see askMeOrder.ts).
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  // ONE ROW PER OPEN ASK, not one per card.
  //
  // A card can hold three unanswered questions, and before this the board
  // rendered the card once and showed only the last of them. Answering it made
  // the next one surface in the same place for a few seconds and then vanish,
  // because the orchestrator had moved the card off `blocked` by then. Two real
  // questions went unanswered that way (TASK-EVENTS-13/14, 2026-09-23) and were
  // unreachable afterwards: not on this board, no way to dismiss them.
  //
  // Now each ask is its own row with its own draft, its own Send, and its own
  // dismiss. The card stays blocked until every one of them is resolved — the
  // ledger write path enforces that (statusWithOpenAsks), not this view.
  const now = Date.now();
  const allWaiting: AskRow[] = tasks
    .filter(waitsOnHuman)
    .flatMap((task) => {
      const open = openQuestions(task);
      return open.map((ask, i) => ({
        task,
        ask,
        // Stable across polls: the question text identifies the entry, and the
        // index disambiguates the (pathological) case of the same text twice.
        key: `${task.id}#${i}#${ask.q.slice(0, 40)}`,
        /** Which of this card's open asks this is, for "1 of 3". */
        position: i + 1,
        total: open.length
      }));
    })
    .sort((a, b) => compareByNewestAsk(a.ask, b.ask, now));
  // Search covers the title AND the question, because you remember the wording
  // of what was asked far more often than the name of the card it came from.
  const waiting = q
    ? allWaiting.filter((row) =>
        row.task.title.toLowerCase().includes(q) || row.ask.q.toLowerCase().includes(q))
    : allWaiting;

  /**
   * Apply `patch` to the OPEN humanQA entry of one card, on the RAW ledger.
   * Returns whether it landed.
   *
   * Re-reads tasks.json first rather than writing this view's 5s-old snapshot,
   * because `hive:writeTasks` treats the incoming array as the card MEMBERSHIP:
   * writing our snapshot back would delete any card the god added since the last
   * poll. Re-locating the open question by its text also means an answer can
   * never land on a different question the god swapped in underneath us — in
   * that case nothing is written and the draft is kept.
   */

  const sendAnswer = async (row: AskRow) => {
    const { task, ask: open } = row;
    const text = (drafts[draftKey(row)] ?? '').trim();
    if (!text || sending) return;
    setSending(row.key);
    try {
      // 1) Document the answer ON the card.
      //
      // Matched by IDENTITY first and by text only as a fallback, and the text
      // fallback answers AT MOST ONE entry (`done`). The old code answered every
      // open entry whose `q` matched, which on a card holding the same question
      // twice closed both from one answer.
      let done = false;
      const next = tasks.map((t) => {
        if (t.id !== task.id) return t;
        const qa = (t.humanQA ?? []).map((e) => {
          if (done) return e;
          if (e !== open && !(e.q === open.q && !e.a && !e.dismissedAt)) return e;
          done = true;
          return { ...e, a: text, answeredAt: new Date().toISOString() };
        });
        return { ...t, humanQA: qa };
      });
      if (!done) throw new Error('the question is no longer on the card');
      const updated = next.find((candidate) => candidate.id === task.id);
      const result = updated
        ? await window.cth.hivePatchTask(task.id, { humanQA: updated.humanQA })
        : { ok: false };
      if (!result.ok) throw new Error('task changed before answer could be saved');
      setTasks(next);
      // 2) Tell the god. How many asks are STILL open on the card decides what
      //    it should do next, so the mail says — "unblock and continue" on the
      //    last one, "do not unblock yet" while others are outstanding. Without
      //    that the god reads every answer as permission to move the card and
      //    leaves the remaining questions behind, which is how they went unseen.
      const remaining = openAsks(next.find((c) => c.id === task.id)).length;
      await window.cth.hiveSend({
        to: 'god',
        act: 'inform',
        subject: `HUMAN ANSWER on task "${task.title}"`,
        body: [
          `The human answered an open question on task ${task.id} ("${task.title}"):`,
          `Q: ${open.q}`,
          `A: ${text}`,
          "The answer is also recorded in the card's humanQA.",
          remaining > 0
            ? `${remaining} more question(s) on this card are still unanswered — act on this answer, but do NOT unblock the card until every one of them is answered or dismissed.`
            : 'That was the last open question. Act on it, unblock the card, and continue the work.'
        ].join('\n')
      }, 'human');
      setAnswerDraft(draftKey(row), '');
    } catch { /* leave the draft so the user can retry */ }
    setSending(null);
  };

  // Dismiss ONE open ask off the board WITHOUT answering it. The entry is
  // marked `dismissedAt` (no fabricated answer) so it stops counting as open —
  // the question itself stays on the card, so the Q&A history is never dropped
  // (protocol). Dismissing the last open ask is also what frees the card to
  // leave `blocked`, which is the escape hatch for a question that stopped
  // mattering; the god can re-ask by appending a fresh humanQA entry.
  const dismiss = async (row: AskRow) => {
    const { task, ask: open } = row;
    if (sending) return;
    // One entry only, same rule as sendAnswer: identity first, text as fallback,
    // and never more than one.
    let done = false;
    const next = tasks.map((t) => {
      if (t.id !== task.id) return t;
      const qa = (t.humanQA ?? []).map((e) => {
        if (done) return e;
        if (e !== open && !(e.q === open.q && !e.a && !e.dismissedAt)) return e;
        done = true;
        return { ...e, dismissedAt: new Date().toISOString() };
      });
      return { ...t, humanQA: qa };
    });
    if (!done) return;
    setTasks(next); // optimistic — the card disappears immediately
    try {
      const updated = next.find((candidate) => candidate.id === task.id);
      const result = updated
        ? await window.cth.hivePatchTask(task.id, { humanQA: updated.humanQA })
        : { ok: false };
      if (!result.ok) throw new Error('task changed before ask could be dismissed');
    } catch {
      setTasks(tasks); // restore on failure so the user can retry
    }
  };

  return (
    // Body text is set in the mono face (VT323) — the same readable font the
    // memory viewer uses. Pixelify Sans (font-ui) is too chunky for prose like
    // questions and answers. Display/badge bits keep their explicit faces.
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--cth-paper-100)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'var(--cth-font-ui)' }}>
      {/* Search appears once there is enough here to lose something in. */}
      {allWaiting.length > 3 && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <span style={{
            position: 'absolute', insetInlineStart: 12, top: '50%', transform: 'translateY(-50%)',
            display: 'inline-flex', color: 'var(--cth-ink-400)', pointerEvents: 'none'
          }}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="9" cy="9" r="5.6" stroke="currentColor" strokeWidth="1.7" />
              <path d="M13.2 13.2l3.4 3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <input
            className="cth-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={translate('askMe.searchPlaceholder')}
            style={{
              width: '100%', boxSizing: 'border-box',
              height: 36, padding: '0 34px 0 34px',
              background: 'var(--cth-paper-100)', border: 'none',
              borderRadius: 'var(--cth-radius-btn)',
              fontFamily: 'var(--cth-font-ui)', fontSize: 13,
              color: 'var(--cth-ink-900)', outline: 'none'
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={translate('askMe.clearSearch')}
              style={{
                position: 'absolute', insetInlineEnd: 8, top: '50%', transform: 'translateY(-50%)',
                width: 22, height: 22, border: 'none', background: 'transparent',
                borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--cth-ink-400)'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      )}

      {allWaiting.length > 0 && (
        // The tab badge counts, but a count is not a state. This says what is
        // actually true: somebody is standing still until you answer.
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '10px 14px', flexShrink: 0,
          background: 'var(--cth-peach-light)',
          borderRadius: 'var(--cth-radius-card)',
          fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '18px',
          color: 'var(--cth-ink-900)'
        }}>
          <span style={{ display: 'inline-flex', color: 'var(--cth-peach-text)', flexShrink: 0 }}>
            <StatusGlyph status="blocked" size={18} />
          </span>
          <strong style={{ fontWeight: 600 }}>
            {translate('askMe.summary', { count: allWaiting.length })}
          </strong>
          <span style={{ display: 'inline-flex', flexShrink: 0 }}>
            {[...new Set(allWaiting.map((x) => x.task.assignee))]
              .map((id) => agentFor(id))
              .filter((a): a is NonNullable<typeof a> => !!a)
              .slice(0, 6)
              .map((a) => (
                <span key={a.id} title={a.name} style={{
                  width: 24, height: 24, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                  marginInlineEnd: 2,
                  background: accentFillCss(a.accent),
                  boxShadow: `0 0 0 1.5px ${accentCss(a.accent)}`,
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
                }}>
                  <SpritePortrait character={a.character} scale={0.5} />
                </span>
              ))}
          </span>
        </div>
      )}

      {waiting.length === 0 && allWaiting.length > 0 && (
        <div style={{
          textAlign: 'center', padding: '28px 16px',
          fontSize: 13, color: 'var(--cth-ink-500)'
        }}>{translate('askMe.noMatches', { query })}</div>
      )}

      {allWaiting.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          textAlign: 'center', padding: '40px 16px', gap: 10
        }}>
          {/* A quiet mark rather than an emoji: the empty state is the normal
              state, so it should look composed, not cheerful. */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 46, height: 46, borderRadius: 'var(--cth-radius-pill)',
            background: 'color-mix(in srgb, var(--cth-status-success) 12%, transparent)',
            color: 'var(--cth-status-success)'
          }}>
            <StatusGlyph status="success" size={22} />
          </span>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--cth-ink-900)' }}>
            {translate('askMe.emptyTitle')}
          </div>
          <div style={{ fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink-500)', maxWidth: 300 }}>
            {translate('askMe.emptySub')}
          </div>
        </div>
      )}
      {waiting.map((row) => {
        const { task: t, ask: open } = row;
        const key = draftKey(row);
        const stuck = dependentsTree(t.id, tasks);
        // ATLAS ASKS, ALWAYS. The orchestrator is the human's one counterpart:
        // workers raise things with it, it decides what is worth your time and
        // brings it here. Before this the board took the ask's `by` field at
        // face value, so a worker that wrote its own humanQA entry appeared to
        // be asking you directly, going round the orchestrator.
        //
        // `by` is not thrown away — when it names someone else, the header says
        // who it is on behalf of. That is the honest version: Atlas is asking,
        // and this is whose work it is about.
        const asker = agents.find((a) => a.isGod);
        const onBehalfOf = open.by && open.by !== asker?.id ? agentFor(open.by) : undefined;
        const blocked = agentFor(t.assignee);
        const age = waited(open.askedAt);
        return (
          // The asker's own colour down the left edge. Thirty identical white
          // cards is a list you have to READ to navigate; a colour you already
          // associate with an agent is one you can scan.
          <div key={row.key} style={{
            background: 'var(--cth-paper-100)',
            borderRadius: 'var(--cth-radius-card)',
            boxShadow: `inset 4px 0 0 0 ${accentCss(asker?.accent ?? 'lilac')}, 0 0 0 1px var(--cth-ink-100), var(--cth-shadow-card)`,
            display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden'
          }}>
            {/* Header: WHO is stuck, on what, and for how long. It used to be a
                title and a badge on a white card, thirty of which look the same
                — nothing said a question came from a particular agent who has
                been standing still since it was asked. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 10px'
            }}>
              {asker && (
                <span style={{
                  position: 'relative', flexShrink: 0,
                  width: 40, height: 40, borderRadius: 12, overflow: 'hidden',
                  background: accentFillCss(asker.accent),
                  boxShadow: `0 0 0 2px ${accentCss(asker.accent)}`,
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'center'
                }}>
                  <SpritePortrait character={asker.character} scale={1} />
                </span>
              )}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {/* The PERSON leads. The task title used to sit here in bold,
                    directly above the question, and the two read as a heading
                    and its subtitle — when they are different things: a task you
                    own, and something an agent is asking about it. Two
                    questions stacked ("Delete the legacy voucher endpoint?" over
                    "Which of these should I do?") is the shape of the problem. */}
                <span style={{
                  fontFamily: 'var(--cth-font-ui)', fontSize: 14, fontWeight: 600,
                  letterSpacing: '-0.1px', color: 'var(--cth-ink-900)',
                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {translate('askMe.asks', {
                    name: asker?.name ?? translate('askMe.anAgent')
                  })}
                </span>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  fontSize: 11.5, lineHeight: '16px', color: 'var(--cth-ink-500)'
                }}>
                  {/* Whose work it is about, when the ask was raised by someone
                      other than the orchestrator. */}
                  {onBehalfOf && <span>{translate('askMe.asksFor', { name: onBehalfOf.name })}</span>}
                  {/* Which of this card's open questions this is. Without it two
                      rows from one task look like a duplicate rather than two
                      things to answer. */}
                  {row.total > 1 && (
                    <span style={{
                      padding: '0 7px', borderRadius: 'var(--cth-radius-input)',
                      background: 'var(--cth-cream-100)', color: 'var(--cth-ink-700)', fontWeight: 600
                    }}>{translate('askMe.askIndex', { n: row.position, total: row.total })}</span>
                  )}
                  {age && <span>{translate('askMe.waiting', { age })}</span>}
                  {/* Who is stuck, which is the card's owner and usually NOT the
                      agent who asked. Naming both is what stops the board
                      reading as "your engineer went over the orchestrator". */}
                  {blocked && blocked.id !== asker?.id && (
                    <span>{translate('askMe.blocks', { name: blocked.name })}</span>
                  )}
                  {stuck.length > 0 && (
                    <span style={{
                      padding: '0 7px', borderRadius: 'var(--cth-radius-input)',
                      background: 'var(--cth-coral-light)', color: 'var(--cth-coral-text)',
                      fontWeight: 600
                    }}>{translate('askMe.blockingCount', { count: stuck.length })}</span>
                  )}
                </span>
              </div>
              {/* Dismiss — clears this ask off the board without answering it.
                  The card's Q&A history is preserved (the question stays on the
                  card, just marked dismissed). */}
              <button
                onClick={() => void dismiss(row)}
                disabled={sending === row.key}
                aria-label={translate('askMe.dismissAria')}
                className="cth-iconbar cth-quiet-danger"
                data-label={translate('askMe.dismissTitle')}
                style={{
                  flexShrink: 0, width: 26, height: 26, padding: 0, marginLeft: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', cursor: sending === row.key ? 'default' : 'pointer',
                  borderRadius: 'var(--cth-radius-btn)',
                  background: 'transparent', color: 'var(--cth-ink-400)',
                  transition: 'background 120ms ease, color 120ms ease'
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* The question, rendered as markdown. The god writes these with
                  emphasis, lists, `code` and links; as plain text the asterisks
                  and backticks were on screen literally. The card variant keeps
                  this card's mono face and turns a single newline into a break, so
                  a question with no markdown in it looks exactly as it did. */}
              <div dir={rtl ? 'auto' : undefined} style={{
                padding: '11px 13px',
                borderRadius: 'var(--cth-radius-card)',
                background: accentFillCss(asker?.accent ?? 'lilac'),
                fontFamily: 'var(--cth-font-ui)', fontSize: 13.5, lineHeight: '21px',
                color: 'var(--cth-ink-900)'
              }}>
                <MarkdownPreview source={open.q} variant="card" />
              </div>

              {/* The task this is about, as a task: its id, its title, and a way
                  in. It was the card's heading, which made it compete with the
                  question instead of grounding it. */}
              <button
                onClick={() => openTaskDetail(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '7px 10px', textAlign: 'left',
                  border: 'none', cursor: 'pointer',
                  borderRadius: 'var(--cth-radius-btn)',
                  background: 'var(--cth-cream-100)',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, lineHeight: '18px',
                  color: 'var(--cth-ink-700)'
                }}
              >
                <span style={{
                  flexShrink: 0, fontFamily: 'var(--cth-font-mono)', fontSize: 11,
                  padding: '0 6px', borderRadius: 'var(--cth-radius-input)',
                  background: 'var(--cth-paper-100)', color: 'var(--cth-ink-500)'
                }}>{t.id}</span>
                <span style={{
                  flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: 'var(--cth-ink-900)'
                }}>{t.title}</span>
                <span style={{ flexShrink: 0, color: 'var(--cth-ink-500)', fontSize: 11.5 }}>
                  {translate('askMe.openTask')}
                </span>
              </button>

              {/* Choices, when the agent offered them. Radio for one, checkbox
                  for several, and the text box stays underneath: the useful
                  answer is often "neither, do this instead". Picking writes
                  straight into the same draft the box edits, so there is one
                  answer and one send. */}
              {open.choices && open.choices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {open.choices.map((choice) => {
                    const draft = drafts[key] ?? '';
                    const picked = open.multi
                      ? draft.split('\n').map((x) => x.trim()).includes(choice)
                      : draft.trim() === choice;
                    return (
                      <label
                        key={choice}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 9,
                          padding: '9px 11px', cursor: 'pointer',
                          borderRadius: 'var(--cth-radius-input)',
                          background: picked
                            ? 'color-mix(in srgb, var(--cth-lilac) 8%, transparent)'
                            : 'transparent',
                          boxShadow: picked
                            ? 'inset 0 0 0 1px var(--cth-lilac)'
                            : 'inset 0 0 0 1px var(--cth-ink-100)',
                          transition: 'background 120ms ease, box-shadow 120ms ease'
                        }}
                      >
                        <input
                          type={open.multi ? 'checkbox' : 'radio'}
                          name={`ask-${row.key}`}
                          checked={picked}
                          onChange={(e) => {
                            if (!open.multi) { setAnswerDraft(key, choice); return; }
                            const lines = (drafts[key] ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
                            const next = e.target.checked
                              ? [...lines.filter((x) => x !== choice), choice]
                              : lines.filter((x) => x !== choice);
                            setAnswerDraft(key, next.join('\n'));
                          }}
                          style={{ marginTop: 2, accentColor: 'var(--cth-lilac)', cursor: 'pointer' }}
                        />
                        <span style={{
                          fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '19px',
                          color: picked ? 'var(--cth-ink-900)' : 'var(--cth-ink-700)',
                          fontWeight: picked ? 600 : 400
                        }}>{choice}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* answer box */}
              <textarea
                dir={rtl ? 'auto' : undefined}
                value={drafts[key] ?? ''}
                onChange={(e) => setAnswerDraft(key, e.target.value)}
                onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendAnswer(row); }}
                rows={3}
                placeholder={translate('askMe.answerPlaceholder')}
                className="cth-input"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px', resize: 'vertical',
                  background: 'var(--cth-paper-100)', border: 'none',
                  borderRadius: 'var(--cth-radius-input)',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '20px',
                  color: 'var(--cth-ink-900)', outline: 'none'
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {(() => {
                  const ready = !!(drafts[key] ?? '').trim() && sending !== row.key;
                  return (
                    <button
                      onClick={() => void sendAnswer(row)}
                      disabled={!ready}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        height: 32, padding: '0 14px', flexShrink: 0,
                        border: 'none', borderRadius: 'var(--cth-radius-btn)',
                        cursor: ready ? 'pointer' : 'not-allowed',
                        background: ready ? 'var(--cth-lilac)' : 'transparent',
                        boxShadow: ready ? 'var(--cth-shadow-btn)' : 'inset 0 0 0 1px var(--cth-ink-100)',
                        color: ready ? 'var(--cth-on-accent)' : 'var(--cth-ink-500)',
                        fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 600,
                        transition: 'background 120ms ease, box-shadow 120ms ease, color 120ms ease'
                      }}
                    >
                      {sending === row.key ? translate('askMe.sending') : translate('askMe.respond')}
                    </button>
                  );
                })()}
                {/* The button says "Send answer", not "Answer and unblock",
                    because on a card with more than one open question this one
                    answer does not unblock it. Say which it is, here, rather
                    than letting the label promise something that will not
                    happen. */}
                {row.total > 1 && (
                  <span style={{ fontSize: 11.5, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
                    {translate('askMe.stillBlocked', { count: row.total - 1 })}
                  </span>
                )}
                {(t.humanQA?.filter((e) => e.a).length ?? 0) > 0 && (
                  <button
                    onClick={() => openTaskDetail(t.id)}
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                      fontSize: 12, color: 'var(--cth-lilac-text)',
                      fontFamily: 'var(--cth-font-ui)', fontWeight: 600
                    }}
                  >
                    {(() => {
                      const n = t.humanQA!.filter((e) => e.a).length;
                      return n === 1
                        ? translate('askMe.viewAnswers', { count: n })
                        : translate('askMe.viewAnswersPlural', { count: n });
                    })()}
                  </button>
                )}
              </div>

              {/* the cascade: what's stuck behind this answer */}
              {stuck.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, color: 'var(--cth-coral-text)' }}>
                    {stuck.length === 1
                      ? translate('askMe.blockingDownstream', { count: stuck.length })
                      : translate('askMe.blockingDownstreamPlural', { count: stuck.length })}
                  </div>
                  {stuck.slice(0, 6).map((d, i) => (
                    <div key={d.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      paddingLeft: 8 + Math.min(i, 3) * 8,
                      fontSize: 13, color: 'var(--cth-ink-700)'
                    }}>
                      <span style={{ color: 'var(--cth-ink-400)' }}>└</span>
                      <span style={{ width: 7, height: 7, flexShrink: 0, background: d.status === 'blocked' ? 'var(--cth-coral)' : 'var(--cth-sky)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                      {nameFor(d.assignee) && <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>({nameFor(d.assignee)})</span>}
                    </div>
                  ))}
                  {stuck.length > 6 && (
                    <div style={{ paddingLeft: 14, fontSize: 11, color: 'var(--cth-ink-400)' }}>{translate('askMe.more', { count: stuck.length - 6 })}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
