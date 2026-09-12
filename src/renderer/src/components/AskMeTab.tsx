import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { PixelBadge } from './PixelBadge';
import { useStore } from '@/store/store';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { type HiveTask, type HumanQA, openQuestion, waitsOnHuman } from './TasksKanban';
import { compareByNewestAsk } from './askMeOrder';
import { StatusGlyph } from './StatusGlyph';
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
  const allWaiting = tasks
    .filter(waitsOnHuman)
    .sort((a, b) => compareByNewestAsk(openQuestion(a), openQuestion(b)));
  // Search covers the title AND the question, because you remember the wording
  // of what was asked far more often than the name of the card it came from.
  const waiting = q
    ? allWaiting.filter((t) =>
        t.title.toLowerCase().includes(q) || (openQuestion(t)?.q ?? '').toLowerCase().includes(q))
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

  const sendAnswer = async (task: HiveTask) => {
    const text = (drafts[task.id] ?? '').trim();
    const open = openQuestion(task);
    if (!text || !open || sending) return;
    setSending(task.id);
    try {
      // 1) Document the answer ON the card.
      const next = tasks.map((t) => {
        if (t.id !== task.id) return t;
        const qa = (t.humanQA ?? []).map((e) =>
          e === open || (e.q === open.q && !e.a)
            ? { ...e, a: text, answeredAt: new Date().toISOString() }
            : e
        );
        return { ...t, humanQA: qa };
      });
      const updated = next.find((candidate) => candidate.id === task.id);
      const result = updated
        ? await window.cth.hivePatchTask(task.id, { humanQA: updated.humanQA })
        : { ok: false };
      if (!result.ok) throw new Error('task changed before answer could be saved');
      setTasks(next);
      // 2) Tell the god, so the card gets unblocked and work continues.
      await window.cth.hiveSend({
        to: 'god',
        act: 'inform',
        subject: `HUMAN ANSWER on task "${task.title}"`,
        body: [
          `The human answered the open question on task ${task.id} ("${task.title}"):`,
          `Q: ${open.q}`,
          `A: ${text}`,
          'The answer is also recorded in the card\'s humanQA. Act on it, unblock the card, and continue the work.'
        ].join('\n')
      }, 'human');
      setAnswerDraft(task.id, '');
    } catch { /* leave the draft so the user can retry */ }
    setSending(null);
  };

  // Dismiss the open ask off the ASK ME board WITHOUT answering it. We mark the
  // open humanQA entry `dismissedAt` (no fabricated answer) so openQuestion()
  // stops returning it and the card leaves this view — the question itself stays
  // on the card, so the Q&A history is never dropped (protocol). The task stays
  // blocked on the kanban; the god can re-ask by appending a fresh humanQA entry.
  const dismiss = async (task: HiveTask) => {
    const open = openQuestion(task);
    if (!open || sending === task.id) return;
    const next = tasks.map((t) => {
      if (t.id !== task.id) return t;
      const qa = (t.humanQA ?? []).map((e) =>
        e === open || (e.q === open.q && !e.a && !e.dismissedAt)
          ? { ...e, dismissedAt: new Date().toISOString() }
          : e
      );
      return { ...t, humanQA: qa };
    });
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
      {waiting.map((t) => {
        const open = openQuestion(t)!;
        const stuck = dependentsTree(t.id, tasks);
        return (
          <div key={t.id} style={{
            background: 'var(--cth-paper-100)',
            borderRadius: 'var(--cth-radius-card)',
            boxShadow: '0 0 0 1px var(--cth-ink-100), var(--cth-shadow-card)',
            display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden'
          }}>
            {/* Header: the task, who is stuck on it. A lilac band with a hard
                dark rule under it made every card look like a dialog; a card
                only needs one surface and a title that reads as a title. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px 8px'
            }}>
              <button
                onClick={() => openTaskDetail(t.id)}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 14, fontWeight: 600,
                  letterSpacing: '-0.1px', color: 'var(--cth-ink-900)',
                  flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}
              >
                {t.title}
              </button>
              {nameFor(t.assignee) && <PixelBadge status="blocked" label={nameFor(t.assignee)!} />}
              {/* Dismiss — clears this ask off the board without answering it.
                  The card's Q&A history is preserved (the question stays on the
                  card, just marked dismissed). */}
              <button
                onClick={() => void dismiss(t)}
                disabled={sending === t.id}
                aria-label={translate('askMe.dismissAria')}
                className="cth-iconbar cth-quiet-danger"
                data-label={translate('askMe.dismissTitle')}
                style={{
                  flexShrink: 0, width: 26, height: 26, padding: 0, marginLeft: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', cursor: sending === t.id ? 'default' : 'pointer',
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
                fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '20px',
                color: 'var(--cth-ink-700)'
              }}>
                <MarkdownPreview source={open.q} variant="card" />
              </div>

              {/* Choices, when the agent offered them. Radio for one, checkbox
                  for several, and the text box stays underneath: the useful
                  answer is often "neither, do this instead". Picking writes
                  straight into the same draft the box edits, so there is one
                  answer and one send. */}
              {open.choices && open.choices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {open.choices.map((choice) => {
                    const draft = drafts[t.id] ?? '';
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
                          name={`ask-${t.id}`}
                          checked={picked}
                          onChange={(e) => {
                            if (!open.multi) { setAnswerDraft(t.id, choice); return; }
                            const lines = (drafts[t.id] ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
                            const next = e.target.checked
                              ? [...lines.filter((x) => x !== choice), choice]
                              : lines.filter((x) => x !== choice);
                            setAnswerDraft(t.id, next.join('\n'));
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
                value={drafts[t.id] ?? ''}
                onChange={(e) => setAnswerDraft(t.id, e.target.value)}
                onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendAnswer(t); }}
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
                  const ready = !!(drafts[t.id] ?? '').trim() && sending !== t.id;
                  return (
                    <button
                      onClick={() => void sendAnswer(t)}
                      disabled={!ready}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        height: 32, padding: '0 14px', flexShrink: 0,
                        border: 'none', borderRadius: 'var(--cth-radius-btn)',
                        cursor: ready ? 'pointer' : 'not-allowed',
                        background: ready ? 'var(--cth-lilac)' : 'transparent',
                        boxShadow: ready ? 'var(--cth-shadow-btn)' : 'inset 0 0 0 1px var(--cth-ink-100)',
                        color: ready ? '#FFFFFF' : 'var(--cth-ink-500)',
                        fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 600,
                        transition: 'background 120ms ease, box-shadow 120ms ease, color 120ms ease'
                      }}
                    >
                      {sending === t.id ? translate('askMe.sending') : translate('askMe.respond')}
                    </button>
                  );
                })()}
                {(t.humanQA?.filter((e) => e.a).length ?? 0) > 0 && (
                  <button
                    onClick={() => openTaskDetail(t.id)}
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                      fontSize: 12, color: 'var(--cth-lilac)',
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
                  <div style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, color: 'var(--cth-coral)' }}>
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
