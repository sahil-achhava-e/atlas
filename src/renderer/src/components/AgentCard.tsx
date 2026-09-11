import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelBadge, StatusKind } from './PixelBadge';
import { useHasTerminalDraft } from './terminalPool';
import { SpritePortrait } from './SpritePortrait';
import { AccentColorName } from '@/design/tokens';
import { OfficeCharacterName } from '@/scene/office/cast';

export interface AgentCardProps {
  name: string;
  character: string;
  accent: string;
  status: StatusKind;
  /** This agent's pty, if it has one. Only used to notice that the USER has
   *  unsent text on its prompt — which holds the agent's queue, and otherwise
   *  looks identical to an idle agent with nothing to do. */
  ptyId?: string;
  project: string;
  /** What this agent is FOR, one line — the job title under its name. */
  description?: string;
  action?: string;
  /** Context gauge: 0..8 segments filled (session context ÷ context limit). */
  progress?: number;
  /** Live context size (tokens) — shown in the gauge tooltip. */
  contextTokens?: number;
  /** Context-window limit (tokens) assumed for the agent's model. */
  contextLimit?: number;
  selected?: boolean;
  /** Your clone — gets a persistent accent frame + BOSS tag so it stands out.
   *  (`isGod` / the `god` agent id stay as-is internally; this is display only.) */
  isGod?: boolean;
  onClick?: () => void;
  /** Number of ledger tasks this agent is actively DOING — rendered as a blue
   *  sticky note stuck to the card. Clicking it opens the first task's detail. */
  doingCount?: number;
  onTaskNoteClick?: () => void;
  draggable?: boolean; // must sit on the <button> itself — Chromium won't start a drag on an ancestor from inside a form control
  /** Private note — rendered as the card's own row (v0.3.4) so it can never
   *  cover the context gauge. First line only; full text in the tooltip. */
  note?: string;
  /** Opens the note editor (the strip owns the editing overlay). When set, the
   *  card shows a small ✎ affordance on its note row. */
  onEditNote?: () => void;
}

const fmtK = (n: number): string => `${Math.round(n / 1000)}k`;

/** One card size for every agent — and for the empty slot the strip draws at
 *  the end of the dock, which has to line up with them. */
export const CARD_WIDTH = 164;
export const CARD_HEIGHT = 72;

/**
 * v0.3.4 compact redesign: one identity row (name + status), one context line
 * (action while working, repo while idle — both in the tooltip), one note row,
 * and a slim gauge pinned to the bottom edge. Nothing overlaps anything.
 */
export function AgentCard({
  name, character, accent, status, ptyId, project, description, action, progress = 0,
  contextTokens, contextLimit, selected, isGod, onClick,
  doingCount = 0, onTaskNoteClick, draggable, note, onEditNote
}: AgentCardProps) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(false);
  const typing = useHasTerminalDraft(ptyId);
  // IDENTITY and SELECTION are two different things, and conflating them is why
  // selecting Michael appeared to do nothing.
  //
  // The card used to pass `isGod || selected` into PixelPanel's 'active' variant,
  // whose frame is `inset 1px + 3px accent + 5px ink` — five pixels of border in
  // the agent's OWN accent. Three problems in one: the selection cue changed
  // colour per agent (the "blue halo" on a sky agent), it was invisible on god
  // because god was framed unconditionally, and stacking the selection ring
  // outside it made the boss card visibly fatter than its neighbours.
  //
  // Now: god is marked by its SURFACE (see godSurface), everyone shares the same
  // 1px panel border, and selection is one accent-independent ring — identical on
  // every card, god included.

  // The selected card wears an ink ring OUTSIDE its border. ink-900 rather than
  // an accent so the cue is identical on every agent, and it flips with the
  // theme (near-black on cream, near-white on the dark ground), staying legible
  // over whatever accent the card already carries.
  const selectionRing = selected ? '0 0 0 2px var(--cth-ink-900)' : '';

  // Context gauge as ONE clean fill (0..8 → 0..100%). Colour escalates as the
  // window fills: accent while comfortable, amber from 6/8, coral from 7/8.
  const pct = Math.min(8, Math.max(0, progress)) / 8 * 100;
  const gaugeColor = progress >= 7 ? 'var(--cth-coral)'
    : progress >= 6 ? 'var(--cth-lemon)'
      : `var(--cth-${accent})`;
  const gaugeTitle = contextTokens !== undefined && contextLimit
    ? t('agentCard.contextTitle', { used: fmtK(contextTokens), limit: fmtK(contextLimit), pct: Math.round((contextTokens / contextLimit) * 100) })
    : t('agentCard.contextGaugeTitle');

  // ONE card size for every agent. God used to be 216x86 against everyone
  // else's 196x76, so the dock never lined up — and once the selection ring was
  // added outside its 5px accent frame, the boss card grew a visibly thicker
  // edge than any other. Distinction now comes from the card's SURFACE, not from
  // making its box bigger or its border heavier.
  // 196 was too tight once god's row carried NAME + BOSS + status: the name
  // truncated to "MIC…" — the one word on the card that must never be the thing
  // that gets cut. Widened for every card so the dock stays uniform, with enough
  // slack that Talk's info mark (which only appears when the OpenAI key is
  // missing) has somewhere to sit rather than pushing the row apart.
  const width = CARD_WIDTH;
  const height = CARD_HEIGHT;
  const lift = isGod ? -2 : 0;
  /** God's distinction: a tinted surface plus a thin accent border all the way
   *  around — NOT the 3px rule that used to sit on the top edge alone. That rule
   *  read as a stray yellow bar rather than as part of the card, and an edge
   *  treatment that only exists on one side always looks like a mistake or a
   *  progress bar. Same 1px geometry as every other card, so the box is
   *  unchanged and the selection ring still means exactly one thing everywhere. */
  const godSurface: React.CSSProperties = isGod
    ? {
        // A WASH, not the full accent-light: at full strength the boss card was
        // a block of colour that pulled the eye away from whatever is actually
        // working. Mixed toward the app's own surface so it reads as "this card
        // is different" rather than as an alert.
        background: `color-mix(in srgb, var(--cth-${accent}-light) 55%, var(--cth-cream-100))`,
        boxShadow: `inset 0 0 0 1px var(--cth-${accent})`, borderRadius: 'var(--cth-radius-input)'
      }
    : {};
  const dropShadow = isGod
    ? `2px 3px 0 0 rgba(26,19,32,${hover ? 0.2 : 0.14})`
    : (hover ? '1px 2px 0 0 rgba(26,19,32,0.12)' : 'none');
  // Ring first so it sits tight to the card, then the existing drop shadow.
  const outerShadow = [selectionRing, dropShadow === 'none' ? '' : dropShadow]
    .filter(Boolean).join(', ') || 'none';

  // One context line: what it's DOING while working, WHERE it lives while idle.
  // God's `project` is the internal hive id — the card said "hive", which names
  // nothing you can look at. What he does is the useful line, in both states.
  const infoLine = isGod ? (action ?? project) : ((status !== 'idle' && action) ? action : project);
  const noteFirstLine = (note ?? '').split('\n').find((l) => l.trim()) ?? '';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      draggable={draggable}
      // The ring is the visual answer to "which terminal is open"; this is the
      // same answer for a screen reader. Matches SidebarRow in fullscreen.
      aria-current={selected ? 'true' : undefined}
      // Everything the card used to spell out in rows, in one tooltip: who,
      // what it is doing, and your note about it.
      className="cth-titlebar-nodrag"
      style={{
        width, minWidth: width, height,
        padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
        position: 'relative',
        transform: lift ? `translateY(${lift}px)` : 'none',
        boxShadow: outerShadow,
        transition: 'transform 90ms steps(2, end), box-shadow 90ms steps(2, end)'
      }}
    >
      {/* The taken note, stuck to the card like on the desk: this worker is
          actively DOING a ledger task. Click → the task's detail overlay. */}
      {doingCount > 0 && (
        <span
          onClick={(e) => { e.stopPropagation(); onTaskNoteClick?.(); }}
          style={{
            position: 'absolute', right: -4, bottom: -5, zIndex: 2,
            width: 20, height: 18,
            background: 'var(--cth-sky)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-300), 1px 2px 0 rgba(26,19,32,0.18)', borderRadius: 'var(--cth-radius-input)',
            transform: 'rotate(4deg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--cth-font-display)', fontSize: 8, color: 'var(--cth-ink-900)',
            cursor: 'pointer'
          }}
        >
          {doingCount > 1 ? doingCount : '✎'}
        </span>
      )}
      <PixelPanel
        variant="default"
        style={{ height: '100%', padding: '6px 6px 5px', ...godSurface }}
        noPadding
      >
        <div style={{
          position: 'relative', height: '100%',
          display: 'flex', gap: 7
        }}>
          {/* Presence, in the corner. At tile size the dot IS the status line. */}
          <PixelBadge
            status={typing ? 'typing' : status}
            dotOnly
            style={{ position: 'absolute', top: 0, right: 0 }}
          />

          {/* Portrait tile. Anchored to the sprite's TOP: the portrait is taller
              than the tile, and bottom-anchoring cropped the head — crop feet,
              not face. */}
          <div style={{
            width: 32, height: 44, flexShrink: 0, alignSelf: 'center',
            // God's CARD carries the accent wash, so his tile cannot — it would
            // vanish into its own background. Paper reads as an inset frame.
            background: isGod ? 'var(--cth-paper-100)' : `var(--cth-${accent}-light)`,
            boxShadow: `inset 0 0 0 1px var(--cth-ink-${isGod ? '300' : '100'})`,
            borderRadius: 'var(--cth-radius-input)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'hidden'
          }}>
            <SpritePortrait character={character} scale={2} />
          </div>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{
              fontFamily: 'var(--cth-font-display)',
              fontSize: 10, lineHeight: '14px',
              color: 'var(--cth-ink-900)',
              paddingRight: 12,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>{name.toUpperCase()}</span>

            {/* What it is FOR. The card is a rectangle so this line has width to
                land in: three lines hold a real sentence, and the tooltip holds
                anything longer. */}
            {description && (
              <span style={{
                fontSize: 9.5, lineHeight: '12px',
                color: 'var(--cth-ink-500)',
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', overflowWrap: 'anywhere'
              }}>{description}</span>
            )}

            {/* Context gauge — drawn only once there is a reading. An empty
                bordered bar reads as progress stuck at zero, which is a
                different and more worrying claim than "nothing measured yet". */}
            <div style={{ marginTop: 'auto', width: '100%' }}>
              <div style={{
                height: 3, width: '100%',
                background: contextTokens ? 'var(--cth-cream-200)' : 'transparent',
                boxShadow: contextTokens ? 'inset 0 0 0 1px var(--cth-ink-100)' : 'none',
                overflow: 'hidden'
              }}>
                <div style={{ width: `${pct}%`, height: '100%', background: gaugeColor }} />
              </div>
            </div>
          </div>

          {/* The private note lives in the tooltip at this size; the ✎ appears
              on hover so it costs no layout. */}
          {onEditNote && hover && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onEditNote(); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onEditNote(); }
              }}
              aria-label={t('agentCard.editNoteAria', { name })}
              style={{
                position: 'absolute', right: 0, bottom: 0,
                width: 14, height: 14,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, lineHeight: 1, cursor: 'pointer',
                color: 'var(--cth-ink-500)'
              }}
            >✎</span>
          )}
        </div>
      </PixelPanel>
    </div>
  );
}
