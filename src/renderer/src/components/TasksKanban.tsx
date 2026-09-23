import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { PixelBadge } from './PixelBadge';
import { Icon } from './Icon';
import { useStore } from '@/store/store';
import { StatusGlyph } from './StatusGlyph';
import { Dropdown } from './Dropdown';
import { TasksIcon } from './TabIcons';
import { SpritePortrait } from './SpritePortrait';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { markdownToPlainText } from '@/markdown/plainText';
import { openAsks } from '@shared/humanQA';
import { useRtl } from '@/i18n/useDirection';
import { getPref, setPref } from '../store/prefs';
import { normalizeStatus, type TaskStatus } from '@shared/taskStatus';

/** A card on the task kanban. Mirrors HiveTask in the main/preload process —
 *  re-declared locally so the renderer doesn't reach into the preload package
 *  (same convention as store/config.ts). */
export interface HumanQA {
  q: string;
  a?: string;
  /** Who wrote the ask. The orchestrator is the only agent that writes these —
   *  everyone else raises it with them — so a missing `by` reads as the
   *  orchestrator. Without it the board labelled the ask with the CARD'S
   *  ASSIGNEE, which said "Luffy is asking" over a question Atlas had written
   *  about Luffy's work, and made it look like the crew was going round him. */
  by?: string;
  /** Optional multiple choice. An agent that already knows the alternatives
   *  should offer them: "develop or the release branch" is a question with two
   *  answers, not an invitation to type prose. Free text stays available
   *  underneath, because the right answer is often "neither, do X". */
  choices?: string[];
  /** More than one may be picked. */
  multi?: boolean;
  askedAt?: string;
  answeredAt?: string;
  /** Set when the human dismisses the ask from the ASK ME board WITHOUT
   *  answering — the question stays on the card (history is preserved) but
   *  openQuestion() stops returning it, so the card leaves ASK ME. */
  dismissedAt?: string;
}

export type { TaskStatus };

export interface HiveTask {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  /** Set by the lead when the card goes to review. The engineer stays in
   *  `assignee`, so a done card still says who built it. */
  reviewer?: string;
  /** The branch this work is on — named after the card, not the agent. */
  branch?: string;
  status: TaskStatus;
  dependsOn: string[];
  priority: number;
  createdAt: string;
  /** First-class human feedback: the god appends {q} when a card needs the
   *  human; the ASK ME view fills in {a}. Full history stays on the card. */
  humanQA?: HumanQA[];
}

/** Every unanswered, undismissed question on the card, in ledger order.
 *  A card can hold more than one, and each is a separate thing the human owes
 *  an answer to — see src/shared/humanQA.ts for why that matters. */
export function openQuestions(t: HiveTask): HumanQA[] {
  return openAsks(t) as HumanQA[];
}

/** The card's LAST open question, for the one-question-per-card surfaces (the
 *  kanban badge, the sticky note on an agent's strip card). ASK ME lists them
 *  all instead — a card with three open asks is three things to answer, and
 *  showing only the last one is how two of them went unseen. */
export function openQuestion(t: HiveTask): HumanQA | undefined {
  const open = openQuestions(t);
  return open.length ? open[open.length - 1] : undefined;
}

/** Waiting on the human = an unanswered question on the card.
 *
 *  No longer `status === 'blocked' && …`. The status is now DERIVED from the
 *  open asks on the ledger write path (statusWithOpenAsks), so a card with an
 *  open ask is blocked by construction and testing the status here only added a
 *  way for an ask to fall off this board while still open. */
export function waitsOnHuman(t: HiveTask): boolean {
  return openQuestions(t).length > 0;
}

type Status = HiveTask['status'];

const VIEW_KEY = 'cth.tasks.view';

const COLUMNS: { key: Status; labelKey: string; accent: string }[] = [
  { key: 'todo',        labelKey: 'kanban.colTodo',       accent: 'var(--cth-sky)' },
  { key: 'in-progress', labelKey: 'kanban.colInProgress', accent: 'var(--cth-lemon)' },
  { key: 'in-review',   labelKey: 'kanban.colInReview',   accent: 'var(--cth-lilac)' },
  { key: 'blocked',     labelKey: 'kanban.colBlocked',    accent: 'var(--cth-coral)' },
  { key: 'done',        labelKey: 'kanban.colDone',       accent: 'var(--cth-mint)' }
];

const POLL_MS = 5000;

/** Deterministic fallback id derived from a task's content (djb2 → base36).
 *  Used for tasks lacking a valid string id so re-parsing tasks.json on every
 *  5s poll yields the SAME id — no React key churn / card remount. Unlike
 *  shortId() (random, for brand-new tasks), this never changes across polls. */
function stableId(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (((h << 5) + h) ^ seed.charCodeAt(i)) | 0;
  return `t-${(h >>> 0).toString(36)}`;
}

/** Normalize whatever hive:tasks returns into a typed task array. The god
 *  writes this file by hand — every field except the shape itself is optional
 *  in practice, so EVERY consumer must go through this (exported for the
 *  detail overlay; a raw card without dependsOn once crashed it). */
export function parseTasks(raw: unknown): HiveTask[] {
  const list = (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown }).tasks))
    ? (raw as { tasks: unknown[] }).tasks
    : [];
  return list
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t, i) => ({
      id: typeof t.id === 'string' && t.id
        ? t.id
        : stableId(`${typeof t.title === 'string' ? t.title : ''}|${typeof t.createdAt === 'string' ? t.createdAt : ''}|${i}`),
      title: typeof t.title === 'string' ? t.title : '(untitled)',
      description: typeof t.description === 'string' ? t.description : undefined,
      assignee: typeof t.assignee === 'string' ? t.assignee : undefined,
      reviewer: typeof t.reviewer === 'string' ? t.reviewer : undefined,
      branch: typeof t.branch === 'string' ? t.branch : undefined,
      // Never a whitelist test. Agents write this file by hand and the old word
      // for in-progress is "doing" — see shared/taskStatus.ts.
      status: normalizeStatus(t.status),
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.filter((d): d is string => typeof d === 'string') : [],
      priority: typeof t.priority === 'number' ? t.priority : 3,
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
      humanQA: Array.isArray(t.humanQA)
        ? (t.humanQA as unknown[])
          .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as { q?: unknown }).q === 'string')
          .map((e) => ({
            q: e.q as string,
            a: typeof e.a === 'string' ? e.a : undefined,
            askedAt: typeof e.askedAt === 'string' ? e.askedAt : undefined,
            answeredAt: typeof e.answeredAt === 'string' ? e.answeredAt : undefined,
            // Preserve a dismissal across the 5s re-parse, else the card would
            // resurface on the next poll (openQuestion would see it as open).
            dismissedAt: typeof e.dismissedAt === 'string' ? e.dismissedAt : undefined,
            choices: Array.isArray(e.choices)
              ? (e.choices as unknown[]).filter((c): c is string => typeof c === 'string' && !!c.trim()).slice(0, 8)
              : undefined,
            multi: e.multi === true
          }))
        : undefined
    }));
}

/**
 * Task kanban over hive/tasks.json — a READ surface. Polls every 5s; cards
 * carry just the title and open the app-wide detail overlay on click. The god
 * is the ledger's writer: new work enters via the dispatch box (mailed to the
 * god), never by the human inserting cards the orchestrator never heard about.
 */
export function TasksKanban() {
  const { t } = useTranslation();
  const agents = useStore((s) => s.agents);
  const [tasks, setTasks] = useState<HiveTask[]>([]);
  // Detail view: cards show just the title — clicking one opens the full
  // breakdown as an APP-WIDE overlay over the office floor (see
  // TaskDetailOverlay) — the content grows (contracts, deps, human Q&A), so it
  // gets the big stage instead of the narrow side panel.
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try { setTasks(parseTasks(await window.cth.hiveTasks())); } catch { /* keep last good */ }
  }, []);

  // Dismiss a card off the board (human-initiated). The kanban is otherwise the
  // god's to write, but a person can clear a card they no longer want tracked.
  // Main removes the named id from its latest on-disk ledger, so a webhook or
  // god card added since this renderer's last poll cannot be lost.
  const dismissTask = useCallback(async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id)); // optimistic
    try {
      const result = await window.cth.hiveDeleteTask(id);
      if (!result.ok) void refresh();
    } catch { /* keep last good; the next poll re-syncs from disk */ }
  }, [refresh]);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [refresh]);

  const restorableAgents = useStore((s) => s.restorableAgents);
  /** Resolve an assignee id to a display name — falls back to the restorable
   *  roster so a done card keeps its author's name even after that worker's
   *  terminal is gone, then to the raw id. */
  /** List or board. Remembered, because it is a preference about how you read,
   *  not a thing you set per visit. The list wins in a 420px panel and the
   *  board wins in focus mode, so both are right and neither is the default for
   *  everyone. */
  const [view, setView] = useState<'list' | 'board'>(() => {
    // The board is the default: it is what the tab is for, and the list is the
    // fallback for a narrow pane. A stored preference still wins.
    return getPref(VIEW_KEY) === 'list' ? 'list' : 'board';
  });
  const pickView = (v: 'list' | 'board') => {
    setView(v);
    setPref(VIEW_KEY, v);
  };

  const characterFor = (id?: string): string | undefined =>
    id ? agents.find((a) => a.id === id)?.character : undefined;
  const nameFor = (id?: string): string | undefined =>
    id
      ? (agents.find((a) => a.id === id)?.name
        ?? restorableAgents.find((a) => a.id === id)?.name
        ?? id)
      : undefined;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--cth-paper-200)', position: 'relative' }}>
      {/* Toolbar — read-only: the god is the ledger's writer. New work enters
          through the dispatch box (which mails the god), not by the human
          inserting cards the orchestrator never heard about. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', flexShrink: 0,
        borderBottom: '1px solid var(--cth-ink-300)'
      }}>
        <span style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, color: 'var(--cth-ink-500)' }}>
          {t('kanban.count', { count: tasks.length })}
        </span>
        <span style={{ flex: 1 }} />
        <span className="cth-iconbar" style={{
          display: 'inline-flex', gap: 2, padding: 3,
          background: 'var(--cth-cream-100)', borderRadius: 'var(--cth-radius-btn)'
        }}>
          {([
            { key: 'list' as const, label: t('kanban.viewList'), path: 'M4 5.5h12M4 10h12M4 14.5h12' },
            { key: 'board' as const, label: t('kanban.viewBoard'), path: 'M4.5 4.5h3.6v11H4.5zM11.9 4.5h3.6v7h-3.6z' }
          ]).map((v) => (
            <button
              key={v.key}
              onClick={() => pickView(v.key)}
              data-label={v.label}
              aria-label={v.label}
              aria-pressed={view === v.key}
              style={{
                width: 28, height: 26, border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 'calc(var(--cth-radius-btn) - 2px)',
                background: view === v.key ? 'var(--cth-paper-100)' : 'transparent',
                boxShadow: view === v.key ? 'var(--cth-shadow-sm)' : 'none',
                color: view === v.key ? 'var(--cth-lilac-text)' : 'var(--cth-ink-500)',
                transition: 'background 120ms ease, color 120ms ease'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d={v.path} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </span>
      </div>

      {view === 'board' ? (
        /* Board: the same cards in columns. It needs width, so the columns keep
           a real minimum and the board scrolls sideways rather than crushing
           four of them into a sidebar — which is what the old default did. */
        <div style={{
          flex: 1, minHeight: 0, display: 'flex', gap: 10, padding: 14,
          overflowX: 'auto', overflowY: 'hidden'
        }}>
          {COLUMNS.map((col) => {
            const cards = tasks.filter((x) => x.status === col.key);
            return (
              <div key={col.key} style={{
                flex: '1 0 280px', minWidth: 280, display: 'flex', flexDirection: 'column',
                background: 'var(--cth-cream-50)',
                borderRadius: 'var(--cth-radius-card)',
                boxShadow: '0 0 0 1px var(--cth-ink-100)'
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
                  borderBottom: '1px solid var(--cth-ink-100)'
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 'var(--cth-radius-pill)',
                    background: col.accent, flexShrink: 0
                  }} />
                  <span style={{
                    fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13,
                    color: 'var(--cth-ink-900)'
                  }}>{t(col.labelKey)}</span>
                  <span style={{
                    marginInlineStart: 'auto',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 20, height: 20, padding: '0 6px',
                    borderRadius: 'var(--cth-radius-input)', background: 'var(--cth-cream-200)',
                    fontFamily: 'var(--cth-font-ui)', fontSize: 11, fontWeight: 600,
                    // The count sits ON the cream-200 pill: ink-500 was 4.36:1 there.
                    color: 'var(--cth-ink-700)'
                  }}>{cards.length}</span>
                </div>
                <div style={{
                  flex: 1, minHeight: 0, overflowY: 'auto',
                  padding: 10, display: 'flex', flexDirection: 'column', gap: 8
                }}>
                  {cards.length === 0 ? (
                    <div style={{
                      padding: '18px 8px', textAlign: 'center',
                      fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-400)'
                    }}>{t('kanban.emptyColumn')}</div>
                  ) : cards.map((x) => (
                    <TaskCard
                      key={x.id}
                      task={x}
                      accent={col.accent}
                      assigneeName={nameFor(x.assignee)}
                      assigneeCharacter={characterFor(x.assignee)}
                      reviewerName={nameFor(x.reviewer)}
                      onOpen={() => openTaskDetail(x.id)}
                      onDismiss={() => dismissTask(x.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      /* Grouped list, not columns. Four columns inside a 420px panel gave every
         card about 90px of width: titles cut mid-word, three of the four columns
         usually empty, and the whole thing scrolling sideways. Work is grouped
         by status down the page instead, so a card gets the full width and an
         empty status costs nothing. */
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto', padding: 14,
        display: 'flex', flexDirection: 'column', gap: 16
      }}>
        {COLUMNS.map((col) => {
          const cards = tasks.filter((x) => x.status === col.key);
          if (cards.length === 0) return null;
          return (
            <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                position: 'sticky', top: -14, zIndex: 2,
                padding: '6px 0', background: 'var(--cth-paper-100)'
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 'var(--cth-radius-pill)',
                  background: col.accent, flexShrink: 0
                }} />
                <span style={{
                  fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13,
                  color: 'var(--cth-ink-900)'
                }}>{t(col.labelKey)}</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 20, height: 20, padding: '0 6px',
                  borderRadius: 'var(--cth-radius-input)',
                  background: 'var(--cth-cream-100)',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 11, fontWeight: 600,
                  color: 'var(--cth-ink-500)'
                }}>{cards.length}</span>
              </div>
              {cards.map((x) => (
                <TaskCard
                  key={x.id}
                  task={x}
                  accent={col.accent}
                  assigneeName={nameFor(x.assignee)}
                  assigneeCharacter={characterFor(x.assignee)}
                  reviewerName={nameFor(x.reviewer)}
                  onOpen={() => openTaskDetail(x.id)}
                  onDismiss={() => dismissTask(x.id)}
                />
              ))}
            </div>
          );
        })}

        {tasks.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            textAlign: 'center', padding: '40px 16px'
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 46, height: 46, borderRadius: 'var(--cth-radius-pill)',
              background: 'var(--cth-cream-100)', color: 'var(--cth-ink-400)'
            }}>
              <TasksIcon size={22} />
            </span>
            <div style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 15, fontWeight: 600, color: 'var(--cth-ink-900)' }}>
              {t('kanban.emptyTitle')}
            </div>
            <div style={{ fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink-500)', maxWidth: 280 }}>
              {t('kanban.emptySub')}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
// Deliberately minimal — a colored status edge, the task id, the title, a
// whisper of an assignee. Everything else (the full contract, deps, controls)
// lives in the detail view a click away: a kanban card can carry little more
// than a title.

function TaskCard({ task, accent, assigneeName, assigneeCharacter, reviewerName, onOpen, onDismiss }: {
  task: HiveTask;
  accent: string;
  assigneeName?: string;
  /** The agent's sprite, so a card shows the same face as the floor. */
  assigneeCharacter?: string;
  /** Who is reading the PR, shown only while the card is in review. */
  reviewerName?: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const needsYou = waitsOnHuman(task);
  return (
    <div style={{ position: 'relative', display: 'flex' }}>
      <button
        onClick={onOpen}
        className="cth-task-card"
        style={{
          flex: 1, minWidth: 0,
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: '14px 16px',
          border: 'none', cursor: 'pointer', textAlign: 'left',
          background: 'var(--cth-paper-100)',
          borderInlineStart: `3px solid ${accent}`,
          borderRadius: 'var(--cth-radius-input)',
          boxShadow: '0 0 0 1px var(--cth-ink-100)',
          transition: 'box-shadow 120ms ease, transform 120ms ease'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-500)'
          }}>{task.id}</span>
          {needsYou && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '2px 8px', borderRadius: 'var(--cth-radius-input)',
              background: 'color-mix(in srgb, var(--cth-status-blocked) 14%, transparent)',
              // The tint keeps the status colour; the word takes the readable
              // one. Amber on its own 14% tint measured 2.74:1.
              color: 'var(--cth-lemon-text)',
              fontFamily: 'var(--cth-font-ui)', fontSize: 11, fontWeight: 600
            }}>
              <StatusGlyph status="blocked" size={11} />
              {t('kanban.needsYouShort')}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <PriorityDots level={Math.max(1, Math.min(5, task.priority))} />
        </span>

        <span style={{
          fontFamily: 'var(--cth-font-ui)', fontSize: 14, fontWeight: 600, lineHeight: '20px',
          color: 'var(--cth-ink-900)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
        }}>{task.title}</span>

        {/* One line of what it IS. The title says what will be true when the
            card is done; this says enough to know whether you care, without
            opening it. Two lines and then clipped — the full text is one click
            away, and a card that grows with its description stops being
            scannable, which is the only thing a board is for. */}
        {markdownToPlainText(task.description ?? '') && (
          <span style={{
            fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, lineHeight: '18px',
            color: 'var(--cth-ink-500)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
          }}>{markdownToPlainText(task.description ?? '')}</span>
        )}

        {/* Who has it, with their own face. A shouted uppercase surname told you
            less and looked like a label rather than a person. */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          {assigneeName ? (
            <>
              <span style={{
                width: 20, height: 20, flexShrink: 0, borderRadius: 'var(--cth-radius-pill)',
                overflow: 'hidden', background: 'var(--cth-cream-200)',
                display: 'inline-flex', alignItems: 'flex-end', justifyContent: 'center'
              }}>
                {assigneeCharacter
                  ? <SpritePortrait character={assigneeCharacter} scale={0.5} />
                  : <span style={{
                      alignSelf: 'center', fontFamily: 'var(--cth-font-ui)',
                      fontSize: 10, fontWeight: 700, color: 'var(--cth-ink-700)'
                    }}>{assigneeName.slice(0, 1).toUpperCase()}</span>}
              </span>
              <span style={{
                fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-700)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>{assigneeName}</span>
            </>
          ) : (
            <span style={{
              fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-400)'
            }}>{t('kanban.unassignedShort')}</span>
          )}
          {/* Who has it stays the engineer; the reviewer rides alongside, so a
              card in review says both without the work changing hands. */}
          {task.status === 'in-review' && (
            <span style={{
              fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, color: 'var(--cth-ink-500)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {reviewerName
                ? t('kanban.reviewedBy', { name: reviewerName })
                : t('kanban.noReviewerYet')}
            </span>
          )}
        </span>
      </button>

      <button
        onClick={onDismiss}
        className="cth-iconbar cth-quiet-danger"
        data-label={t('kanban.dismiss')}
        aria-label={t('kanban.dismiss')}
        style={{
          position: 'absolute', top: 8, insetInlineEnd: 8,
          width: 24, height: 24, border: 'none', background: 'transparent',
          borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--cth-ink-400)', opacity: 0
        }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}


// ─── Detail view ─────────────────────────────────────────────────────────────
// The full breakdown of one task: status, assignee, priority, the complete
// description (the god writes 4-part dispatch contracts in there — preserved
// line by line), dependencies resolved to their titles, the human Q&A trail,
// and the move/assign controls that used to crowd every card. Rendered as an
// APP-WIDE overlay (over the office floor) — this content grows, so it gets
// the big stage instead of the narrow side panel. Exported for App's
// TaskDetailOverlay; opened via the store's openTaskDetail from anywhere.

export function TaskDetail({ task, all, assigneeName, assigneeCharacter, onMove, onAssign, onClose }: {
  task: HiveTask;
  all: HiveTask[];
  assigneeName?: string;
  /** The agent's sprite, so the chip shows the same face as the floor. */
  assigneeCharacter?: string;
  onMove: (s: Status) => void;
  onAssign: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const rtl = useRtl();
  const col = COLUMNS.find((c) => c.key === task.status) ?? COLUMNS[0];
  // Belt + suspenders: parseTasks normalizes these, but the ledger is a
  // hand-written file — never trust a card's shape at the point of use.
  const deps = (task.dependsOn ?? [])
    .map((id) => all.find((t) => t.id === id))
    .filter((t): t is HiveTask => !!t);
  const created = new Date(task.createdAt);
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 280,
        background: 'color-mix(in srgb, var(--cth-ink-900) 46%, transparent)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: '94vw', maxHeight: '90vh', display: 'flex' }}>
        <PixelPanel variant="dialog" noPadding style={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: 0 }}>
          {/* Header: which task, and when it was raised. The id is the handle
              every dispatch uses and the timestamp is how you tell two attempts
              apart, so both belong at the top rather than buried in a fact row
              under the title. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 16px', borderBottom: '1px solid var(--cth-ink-100)'
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 7,
              fontFamily: 'var(--cth-font-ui)', fontSize: 15, fontWeight: 600,
              letterSpacing: '-0.2px', color: 'var(--cth-ink-900)'
            }}>
              {t('kanban.taskTitle')}
              <span style={{ color: 'var(--cth-ink-400)', fontWeight: 400 }}>·</span>
              <span style={{
                fontFamily: 'var(--cth-font-mono)', fontSize: 12.5, fontWeight: 500,
                color: 'var(--cth-ink-700)'
              }}>{task.id}</span>
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '4px 11px', borderRadius: 'var(--cth-radius-input)',
              background: `color-mix(in srgb, ${col.accent} 14%, transparent)`,
              color: col.accent,
              fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12
            }}>{t(col.labelKey)}</span>
            <span style={{ flex: 1 }} />
            <span style={{
              fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-500)',
              whiteSpace: 'nowrap'
            }}>{isNaN(created.getTime()) ? '' : created.toLocaleString()}</span>
            <button
              onClick={onClose}
              aria-label={t('common.close')}
              className="cth-iconbar"
              data-label={t('common.close')}
              style={{
                width: 28, height: 28, flexShrink: 0, border: 'none', background: 'transparent',
                borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--cth-ink-400)'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflowY: 'auto' }}>
            {/* Title under a status-colored bar */}
            <div style={{ borderLeft: `4px solid ${col.accent}`, paddingLeft: 8 }}>
              <div style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 15, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>
                {task.title}
              </div>
            </div>

            {/* Fact row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* The id leads the row for the same reason it leads on the card:
                  it is the handle every dispatch and every message uses to name
                  this task, so it should be the first thing here too. */}

              {assigneeName ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '3px 11px 3px 3px', borderRadius: 'var(--cth-radius-input)',
                  background: 'var(--cth-cream-100)',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600,
                  color: 'var(--cth-ink-900)'
                }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: 'var(--cth-radius-pill)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--cth-lilac)', color: 'var(--cth-on-accent)', fontSize: 10, fontWeight: 700
                  }}>{assigneeName.slice(0, 1).toUpperCase()}</span>
                  {assigneeName}
                </span>
              ) : (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 11px', borderRadius: 'var(--cth-radius-input)',
                  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 12,
                  color: 'var(--cth-ink-500)'
                }}>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="10" cy="7.2" r="2.8" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M4.6 16.4c0-2.6 2.4-4.3 5.4-4.3s5.4 1.7 5.4 4.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  {t('kanban.unassigned')}
                </span>
              )}
              <PriorityDots level={Math.max(1, Math.min(5, task.priority))} />

            </div>

            {/* The contract, rendered as markdown — the same card variant as the
                Q&A trail below. The god writes these in markdown (the hive
                protocol tells it to: bold the ask, backtick the paths, bullet
                the options), and this block used to print the asterisks and
                backticks raw while the Q&A two blocks down rendered them.

                paper-200 + a hairline, not cream-50: in dark mode cream-50 IS
                the app ground (#0E1014), so the old fill was the page colour
                and the contract read as text floating with no panel at all. */}
            <div style={{
              padding: 14, background: 'var(--cth-paper-200)',
              boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
              borderRadius: 'var(--cth-radius-input)',
              fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '20px',
              color: 'var(--cth-ink-900)', wordBreak: 'break-word'
            }} dir={rtl ? 'auto' : undefined}>
              {task.description?.trim()
                ? <MarkdownPreview source={task.description.trim()} variant="card" />
                : <span style={{ color: 'var(--cth-ink-400)', fontStyle: 'italic' }}>{t('kanban.noDescription')}</span>}
            </div>

            {/* The human Q&A trail — every decision documented on the card.
                Rendered as markdown (card variant), matching the ASK ME tab the
                "view earlier answers" link arrives from. */}
            {(task.humanQA?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--cth-ink-500)' }}>
                  {t('kanban.humanQA')}
                </div>
                {task.humanQA!.map((e, i) => {
                  const open = !e.a && !e.dismissedAt;
                  const asked = e.askedAt ? new Date(e.askedAt) : null;
                  const answered = e.answeredAt ? new Date(e.answeredAt) : null;
                  const when = (d: Date | null) =>
                    d && !isNaN(d.getTime()) ? d.toLocaleString() : '';
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 0,
                        borderRadius: 'var(--cth-radius-input)',
                        overflow: 'hidden',
                        borderInlineStart: `3px solid ${open
                          ? 'var(--cth-status-blocked)'
                          : e.a ? 'var(--cth-status-success)' : 'var(--cth-ink-100)'}`,
                        background: 'var(--cth-cream-50)',
                        boxShadow: open
                          ? `0 0 0 1px color-mix(in srgb, var(--cth-status-blocked) 35%, transparent), var(--cth-shadow-sm)`
                          : '0 0 0 1px var(--cth-ink-100)'
                      }}
                    >
                      {/* Each exchange is one object with two halves, so a trail
                          of five reads as five conversations rather than ten
                          floating bubbles. */}
                      <div style={{ padding: '11px 13px', background: 'transparent' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5,
                          fontFamily: 'var(--cth-font-ui)', fontSize: 11, color: 'var(--cth-ink-500)'
                        }}>
                          <span style={{ fontWeight: 600, color: 'var(--cth-lilac-text)' }}>
                            {t('kanban.asked')}
                          </span>
                          {when(asked) && <span>{when(asked)}</span>}
                          {open && (
                            <span style={{
                              marginInlineStart: 'auto',
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '3px 9px', borderRadius: 'var(--cth-radius-input)',
                              background: 'color-mix(in srgb, var(--cth-status-blocked) 13%, transparent)',
                              color: 'var(--cth-status-blocked)', fontWeight: 600
                            }}>
                              <StatusGlyph status="blocked" size={12} />
                              {t('kanban.awaitingAnswer')}
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '20px',
                          color: 'var(--cth-ink-900)'
                        }}>
                          <MarkdownPreview source={e.q} variant="card" />
                        </div>
                      </div>

                      {e.a && (
                        <div style={{
                          padding: '11px 13px',
                          background: 'color-mix(in srgb, var(--cth-status-success) 9%, var(--cth-paper-100))',
                          borderTop: '1px solid color-mix(in srgb, var(--cth-status-success) 22%, transparent)'
                        }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5,
                            fontFamily: 'var(--cth-font-ui)', fontSize: 11, color: 'var(--cth-ink-500)'
                          }}>
                            <span style={{ fontWeight: 600, color: 'var(--cth-status-success)' }}>
                              {t('kanban.youAnswered')}
                            </span>
                            {when(answered) && <span>{when(answered)}</span>}
                          </div>
                          <div style={{
                            fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '20px',
                            color: 'var(--cth-ink-900)'
                          }}>
                            <MarkdownPreview source={e.a} variant="card" />
                          </div>
                        </div>
                      )}

                      {e.dismissedAt && !e.a && (
                        <div style={{
                          padding: '8px 12px', background: 'var(--cth-cream-50)',
                          borderTop: '1px solid var(--cth-ink-100)',
                          fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-500)'
                        }}>{t('kanban.dismissedWithoutAnswer')}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Dependencies, resolved to titles */}
            {deps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12, color: 'var(--cth-ink-500)' }}>
                  {t('kanban.dependsOn')}
                </div>
                {deps.map((d) => {
                  const dc = COLUMNS.find((c) => c.key === d.status) ?? COLUMNS[0];
                  return (
                    <div key={d.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '3px 10px',
                      background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)',
                      fontSize: 13, color: 'var(--cth-ink-700)'
                    }}>
                      <span style={{ width: 8, height: 8, background: dc.accent, boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer: where you act, so it is separated from what you are
                reading rather than being the last paragraph of it. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              margin: '4px -16px -16px', padding: '12px 16px',
              background: 'var(--cth-cream-50)',
              borderTop: '1px solid var(--cth-ink-100)'
            }}>
              <Dropdown
                value={task.status}
                ariaLabel={t('kanban.moveTo')}
                onChange={(v) => onMove(v as Status)}
                options={COLUMNS.map((c) => ({ value: c.key, label: t(c.labelKey), tone: c.accent }))}
              />
              <span style={{ flex: 1 }} />
              <button
                onClick={onClose}
                style={{
                  height: 34, padding: '0 14px', flexShrink: 0,
                  border: 'none', borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
                  background: 'var(--cth-paper-100)', color: 'var(--cth-ink-900)',
                  boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 600,
                  transition: 'background 120ms ease, box-shadow 120ms ease'
                }}
                className="cth-ghost-btn"
              >{t('common.close')}</button>
              <button
                onClick={onAssign}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  height: 34, padding: '0 16px', flexShrink: 0,
                  border: 'none', borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
                  background: 'var(--cth-lilac)', color: 'var(--cth-on-accent)',
                  boxShadow: 'var(--cth-shadow-btn)',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 600,
                  transition: 'background 120ms ease, box-shadow 120ms ease'
                }}
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle cx="8.4" cy="7" r="2.8" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M3.4 16.2c0-2.5 2.2-4.1 5-4.1 1.1 0 2.1.25 2.9.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  <path d="M13.4 13.6h4.2M15.5 11.5v4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                {t('kanban.assign')}
              </button>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

function PriorityDots({ level }: { level: number }) {
  const { t } = useTranslation();
  // Five levels, each with its own name and its own colour, because "P4" and a
  // row of bars both need a key card. The tint is the colour at low alpha so a
  // board full of these reads as a board, not as a traffic light.
  // Two colours, not one: `tone` fills the dot and tints the pill, `text` is
  // the word. The same value cannot do both — lemon on its own 14% tint
  // measured 2.74:1, because a colour bright enough to see as a dot is too
  // bright to read as 11px type.
  const band = level >= 5
    ? { key: 'urgent', tone: 'var(--cth-coral)', text: 'var(--cth-coral-text)' }
    : level === 4
      ? { key: 'high', tone: 'var(--cth-lemon)', text: 'var(--cth-lemon-text)' }
      : level === 3
        ? { key: 'normal', tone: 'var(--cth-ink-500)', text: 'var(--cth-ink-700)' }
        : level === 2
          ? { key: 'low', tone: 'var(--cth-sky)', text: 'var(--cth-sky-text)' }
          : { key: 'lowest', tone: 'var(--cth-ink-500)', text: 'var(--cth-ink-700)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
      padding: '2px 9px', borderRadius: 'var(--cth-radius-input)',
      background: `color-mix(in srgb, ${band.tone} 14%, transparent)`,
      color: band.text,
      fontFamily: 'var(--cth-font-ui)', fontSize: 11, fontWeight: 600
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 'var(--cth-radius-pill)',
        background: band.tone, flexShrink: 0
      }} />
      {t(`kanban.priority_${band.key}`)}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: 'var(--cth-paper-100)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)', fontFamily: 'var(--cth-font-ui)',
  fontSize: 13, lineHeight: '17px', color: 'var(--cth-ink-900)', outline: 'none', boxSizing: 'border-box'
};

const selectStyle: React.CSSProperties = {
  padding: '3px 10px', background: 'var(--cth-paper-100)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)', fontFamily: 'var(--cth-font-ui)',
  fontSize: 13, color: 'var(--cth-ink-900)', cursor: 'pointer'
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, color: 'var(--cth-ink-500)'
};
