import { Children, isValidElement, useState, type CSSProperties, type ReactNode } from 'react';
import { Dropdown } from '../Dropdown';
import { useTranslation } from 'react-i18next';
import { TRIGGER_MODES, type TriggerMode } from '@shared/triggers';
import {
  WEEKDAY_INITIALS, WEEKDAY_LABELS, formatMinute, normalizeWeekly,
  type WeeklySchedule
} from '@shared/weeklySchedule';

/**
 * Shared chrome for the Triggers tab.
 *
 * The Command Center's own `Section`/`Scroll`/`Muted` are module-private to
 * `CommandCenterPanel.tsx`, so these mirror them exactly (same paddings, same
 * fonts, same `inset` hairlines) and add the collapse behaviour this tab needs —
 * four types of dense config do not fit down a sidebar as flat forms.
 */

/* ───────────────────────────── shared styles ─────────────────────────────── */

// The edge and the focus ring come from `.cth-input` in global.css, which every
// field in the app shares — these were drawn here in ink-100, the DIVIDER token
// whose own comment says it is meant to recede (1.5:1 in light, 1.7:1 in dark),
// so the boxes were all but invisible. `outline: none` went with it: it was
// suppressing the browser's focus ring without putting one back, which left
// these fields with no keyboard focus indicator at all.
export const inputStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  background: 'var(--cth-paper-100)', border: 'none',
  borderRadius: 'var(--cth-radius-input)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '17px',
  color: 'var(--cth-ink-900)'
};

export const monoInputStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: 'var(--cth-font-mono)'
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  lineHeight: '20px',
  resize: 'vertical'
};

export const selectStyle: CSSProperties = {
  padding: '3px 10px', background: 'var(--cth-paper-100)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-control-edge)', borderRadius: 'var(--cth-radius-input)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-900)',
  cursor: 'pointer', minWidth: 0, maxWidth: '100%'
};

/* ───────────────────────────── text helpers ──────────────────────────────── */

export function Muted({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{children}</div>;
}

/** One line of explanation under a control. Smaller than Muted, never a tooltip —
 *  a sidebar hides tooltips behind the window edge half the time. */
export function Hint({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-500)', marginTop: 3 }}>{children}</div>;
}

export function Chip({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'on' | 'off' }) {
  const fg = tone === 'on' ? 'var(--cth-status-success)'
    : tone === 'off' ? 'var(--cth-ink-500)' : 'var(--cth-ink-700)';
  const bg = tone === 'on'
    ? 'color-mix(in srgb, var(--cth-status-success) 14%, transparent)'
    : 'var(--cth-cream-100)';
  return (
    <span style={{
      flexShrink: 0, display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 'var(--cth-radius-input)',
      fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, lineHeight: '15px',
      background: bg, color: fg
    }}>{children}</span>
  );
}

export function Callout({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'note' }) {
  const warn = tone === 'warn';
  return (
    <div style={{
      marginTop: 8, padding: '10px 12px',
      fontFamily: 'var(--cth-font-ui)', fontSize: 12, lineHeight: '18px',
      color: 'var(--cth-ink-700)',
      background: warn
        ? 'color-mix(in srgb, var(--cth-status-blocked) 9%, transparent)'
        : 'var(--cth-cream-50)',
      borderInlineStart: `3px solid ${warn ? 'var(--cth-status-blocked)' : 'var(--cth-ink-100)'}`,
      borderRadius: 'var(--cth-radius-input)'
    }}>{children}</div>
  );
}

/* ─────────────────────────────── controls ────────────────────────────────── */

export function Toggle({ on, onClick, onLabel, offLabel }: {
  on: boolean; onClick: () => void; onLabel?: string; offLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: 0, border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0
      }}
    >
      <span style={{
        position: 'relative', width: 30, height: 16, flexShrink: 0,
        borderRadius: 'var(--cth-radius-pill)',
        // ink-300 like every other switch: this one used cream-200, which is a
        // SURFACE colour and measured 1.15:1 against the card it sat on.
        background: on ? 'var(--cth-status-success)' : 'var(--cth-ink-300)',
        boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--cth-control-edge)',
        transition: 'background 120ms ease'
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 16 : 2,
          width: 12, height: 12, borderRadius: 'var(--cth-radius-pill)',
          background: 'var(--cth-on-accent)', transition: 'left 120ms ease',
          boxShadow: '0 1px 2px rgba(17,20,24,0.25)'
        }} />
      </span>
      <span style={{
        fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600,
        color: on ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)'
      }}>{on ? (onLabel ?? t('common.on')) : (offLabel ?? t('common.off'))}</span>
    </button>
  );
}

export function MiniButton({ children, onClick, tone = 'plain', disabled }: {
  children: ReactNode; onClick: () => void; tone?: 'plain' | 'danger' | 'good'; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flexShrink: 0, height: 28, padding: '0 12px', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 'var(--cth-radius-btn)',
        background: disabled ? 'transparent'
          : tone === 'good' ? 'var(--cth-lilac)'
          : tone === 'danger' ? 'color-mix(in srgb, var(--cth-coral) 12%, transparent)'
          : 'var(--cth-cream-100)',
        boxShadow: tone === 'good' && !disabled ? 'var(--cth-shadow-btn)' : 'none',
        fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 600,
        color: disabled ? 'var(--cth-ink-300)'
          : tone === 'good' ? 'var(--cth-on-accent)'
          : tone === 'danger' ? 'var(--cth-coral)' : 'var(--cth-ink-900)',
        transition: 'background 120ms ease, color 120ms ease'
      }}
    >{children}</button>
  );
}

export function Select({ value, onChange, children, style }: {
  value: string; onChange: (v: string) => void; children: ReactNode; style?: CSSProperties;
}) {
  // Reads its own <option> children so no call site changes, and renders the
  // app's dropdown instead of the OS widget. Same shim as the command centre's.
  const options: { value: string; label: string }[] = [];
  const walk = (node: ReactNode): void => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === 'option') {
        const p = child.props as { value?: string; children?: ReactNode };
        options.push({
          value: String(p.value ?? ''),
          label: Children.toArray(p.children)
            .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : '')).join('')
        });
        return;
      }
      walk((child.props as { children?: ReactNode }).children);
    });
  };
  walk(children);
  const width = (style?.width as number | string | undefined) ?? 150;
  return <Dropdown value={value} options={options} onChange={onChange} width={width} align="top" />;
}

/** Label above a control. Stacked, never side-by-side — the sidebar is too
 *  narrow for a label column that does not truncate the thing it labels. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 12, lineHeight: '16px',
        color: 'var(--cth-ink-500)', marginBottom: 6
      }}>{label}</div>
      {children}
    </div>
  );
}

/* ───────────────────────────── containers ───────────────────────────────── */

export function Scroll({ children }: { children: ReactNode }) {
  return (
    <div className="cth-scrollpane" style={{
      flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
      padding: 16, background: 'var(--cth-paper-100)'
    }}>{children}</div>
  );
}

/**
 * One of the four trigger types. Collapsed it is a title, a one-line "what this
 * is", and a live summary — so opening the tab reads as four kinds of trigger
 * rather than a wall of forms.
 *
 * Children stay MOUNTED while collapsed (hidden, not unmounted) for two reasons:
 * the summary chip is fed by the section itself and would go blank the moment
 * you closed it, and a section's own open rows survive collapsing its parent.
 */
export function TriggerCard({ title, blurb, summary, defaultOpen = false, children }: {
  title: string; blurb: string; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      marginBottom: 12, background: 'var(--cth-paper-100)',
      borderRadius: 'var(--cth-radius-card)',
      boxShadow: '0 0 0 1px var(--cth-ink-100), var(--cth-shadow-sm)',
      overflow: 'hidden'
    }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left',
          padding: '14px 16px', border: 'none', cursor: 'pointer',
          background: 'transparent'
        }}
      >
        <span style={{
          flexShrink: 0, marginTop: 2, display: 'inline-flex', color: 'var(--cth-ink-400)',
          transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 140ms ease'
        }}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M7.6 5l4.8 5-4.8 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'block', fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 14,
            lineHeight: '19px', letterSpacing: '-0.1px', color: 'var(--cth-ink-900)'
          }}>{title}</span>
          <span style={{
            display: 'block', fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, lineHeight: '18px',
            color: 'var(--cth-ink-500)', marginTop: 3
          }}>{blurb}</span>
        </span>
        {summary !== undefined && <Chip>{summary}</Chip>}
      </button>
      <div style={{ display: open ? 'block' : 'none', padding: '12px 16px 16px' }}>{children}</div>
    </div>
  );
}

/** A card inside a card — one webhook, one context rule. */
export function SubCard({ children }: { children: ReactNode }) {
  return (
    <div style={{
      marginBottom: 8, padding: '12px 14px 14px',
      background: 'var(--cth-cream-50)', borderRadius: 'var(--cth-radius-input)'
    }}>{children}</div>
  );
}

/** Header row inside a SubCard: a disclosure caret, a title, and controls. */
export function SubHeader({ open, onToggle, title, sub, right }: {
  open: boolean; onToggle: () => void; title: ReactNode; sub?: ReactNode; right?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={onToggle}
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
          padding: 0, border: 'none', background: 'transparent', cursor: 'pointer'
        }}
      >
        <span style={{ flexShrink: 0, width: 8, fontSize: 11, color: 'var(--cth-ink-500)' }}>{open ? '▾' : '▸'}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'block', fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '16px',
            color: 'var(--cth-ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>{title}</span>
          {sub !== undefined && (
            <span style={{
              display: 'block', fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-500)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>{sub}</span>
          )}
        </span>
      </button>
      {right}
    </div>
  );
}

/* ──────────────────────────── trigger mode ───────────────────────────────── */

/** The shared `strict / allow-all / communication-only` gate. Labels and blurbs
 *  come from `TRIGGER_MODES` so webhooks and org can never drift apart. */
export function ModePicker({ value, onChange }: { value: TriggerMode; onChange: (m: TriggerMode) => void }) {
  const current = TRIGGER_MODES.find((m) => m.value === value) ?? TRIGGER_MODES[0];
  return (
    <>
      <Select value={value} onChange={(v) => onChange(v as TriggerMode)} style={{ width: '100%' }}>
        {TRIGGER_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </Select>
      <Hint>{current.blurb}</Hint>
    </>
  );
}

/* ──────────────────────────── interval picker ────────────────────────────── */

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const WEEK = 604_800_000;

export const INTERVAL_OPTS: { ms: number; label: string }[] = [
  { ms: 15 * MINUTE, label: '15m' },
  { ms: 30 * MINUTE, label: '30m' },
  { ms: HOUR, label: '1h' },
  { ms: 2 * HOUR, label: '2h' },
  { ms: 6 * HOUR, label: '6h' },
  { ms: 12 * HOUR, label: '12h' },
  { ms: DAY, label: '24h' },
  { ms: WEEK, label: 'weekly' }
];

/** A truthful label for ANY stored interval, preset or not. Arbitrary intervals
 *  persist now, so the label is computed rather than looked up — a select that
 *  falls back to the nearest preset would quietly lie about the stored value. */
export function fmtInterval(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'off';
  if (ms === WEEK) return 'weekly';
  if (ms % WEEK === 0) return `${ms / WEEK}w`;
  if (ms % DAY === 0) return `${ms / DAY}d`;
  if (ms % HOUR === 0) return `${ms / HOUR}h`;
  if (ms % MINUTE === 0) return `${ms / MINUTE}m`;
  return `${Math.round(ms / 1000)}s`;
}

const CUSTOM = '__custom';

/**
 * @param minMs/maxMs the range MAIN will actually store. Context rules are
 * clamped to 1 minute … 24 hours on the way in, so offering "weekly" there would
 * put a label on screen that the saved value does not match. Schedules take any
 * interval and pass the default range.
 */
export function IntervalPicker({ value, onChange, minMs = MINUTE, maxMs = Number.POSITIVE_INFINITY }: {
  value: number; onChange: (ms: number) => void; minMs?: number; maxMs?: number;
}) {
  const { t } = useTranslation();
  const opts = INTERVAL_OPTS.filter((o) => o.ms >= minMs && o.ms <= maxMs);
  const preset = opts.some((o) => o.ms === value);
  const [custom, setCustom] = useState(!preset);
  const showCustom = custom || !preset;
  const clamp = (ms: number) => Math.min(maxMs, Math.max(minMs, ms));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Select
        value={showCustom ? CUSTOM : String(value)}
        onChange={(v) => {
          if (v === CUSTOM) { setCustom(true); return; }
          setCustom(false);
          onChange(Number(v));
        }}
      >
        {!preset && <option value={CUSTOM}>{fmtInterval(value)} ({t('triggersUi.custom')})</option>}
        {opts.map((o) => <option key={o.ms} value={String(o.ms)}>{o.label}</option>)}
        {preset && <option value={CUSTOM}>{t('triggersUi.customEllipsis')}</option>}
      </Select>
      {showCustom && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number"
            min={Math.max(1, Math.round(minMs / MINUTE))}
            max={Number.isFinite(maxMs) ? Math.round(maxMs / MINUTE) : undefined}
            value={Math.max(1, Math.round(value / MINUTE))}
            onChange={(e) => {
              const mins = Number(e.target.value);
              if (Number.isFinite(mins) && mins > 0) onChange(clamp(Math.round(mins) * MINUTE));
            }}
            className="cth-input"
            style={{ ...monoInputStyle, width: 68, padding: '3px 5px' }}
          />
          <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('triggersUi.min')}</span>
        </span>
      )}
    </div>
  );
}

/* ───────────────────────────── percent field ─────────────────────────────── */

export function PctField({ value, onChange }: { value: number; onChange: (pct: number) => void }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="number"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0);
        }}
        className="cth-input"
        style={{ ...monoInputStyle, width: 60, padding: '3px 5px' }}
      />
      <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>%</span>
      <div style={{
        flex: 1, minWidth: 40, height: 8,
        background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)'
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct === 0 ? 'var(--cth-ink-300)' : 'var(--cth-lemon)' }} />
      </div>
    </div>
  );
}

/* ────────────────────────────── secret field ─────────────────────────────── */

/** Masked by default; reveals only on demand. The value never lands in a
 *  `title`/tooltip — those leak into screenshots and accessibility trees. */
export function SecretField({ value, revealed, onReveal, onCopy, copied, placeholder, onChange, onBlur }: {
  value: string;
  revealed: boolean;
  onReveal: () => void;
  onCopy?: () => void;
  copied?: boolean;
  placeholder?: string;
  onChange?: (v: string) => void;
  onBlur?: () => void;
}) {
  const { t } = useTranslation();
  const readOnly = !onChange;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type={revealed ? 'text' : 'password'}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={onBlur}
        className="cth-input"
        style={{ ...monoInputStyle, flex: 1, minWidth: 0, padding: '4px 10px' }}
      />
      <MiniButton onClick={onReveal}>{revealed ? t('common.hide') : t('common.show')}</MiniButton>
      {onCopy && <MiniButton onClick={onCopy} tone={copied ? 'good' : 'plain'}>{copied ? `${t('common.copy')} ✓` : t('common.copy')}</MiniButton>}
    </div>
  );
}

/* ──────────────────────────── weekly schedule ────────────────────────────── */

/** A weekly schedule the picker can hold mid-edit. Days may be empty while the
 *  user is deselecting, which `normalizeWeekly` would reject — so the draft type
 *  is looser than the stored one, and the SAVE is what has to be valid. */
export type WeeklyDraft = { days: number[]; minute: number };

export const DEFAULT_WEEKLY: WeeklyDraft = { days: [1, 2, 3, 4, 5], minute: 9 * 60 };

/** True when this draft is safe to store. The one gate every call site shares. */
export function weeklyIsUsable(w: WeeklyDraft): boolean {
  return normalizeWeekly(w) !== null;
}

/**
 * Day-of-week + time-of-day picker.
 *
 * Seven toggles rather than a multi-select, because picking "Mon Wed Fri" is the
 * whole job and a native multi-select makes it a modifier-key puzzle. The order
 * is Sunday-first to match `Date.getDay()`, so no index maths sits between what
 * is clicked and what is stored.
 */
export function WeeklyPicker({ value, onChange }: {
  value: WeeklyDraft; onChange: (w: WeeklyDraft) => void;
}) {
  const { t } = useTranslation();
  const toggle = (d: number) => onChange({
    ...value,
    days: value.days.includes(d) ? value.days.filter((x) => x !== d) : [...value.days, d].sort((a, b) => a - b)
  });
  const setDays = (days: number[]) => onChange({ ...value, days });
  const same = (days: number[]) =>
    value.days.length === days.length && days.every((d) => value.days.includes(d));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {WEEKDAY_INITIALS.map((initial, d) => {
          const on = value.days.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              aria-pressed={on}
              style={{
                width: 26, height: 24, border: 'none', cursor: 'pointer',
                background: on ? 'var(--cth-mint)' : 'var(--cth-cream-200)',
                boxShadow: on
                  ? 'inset 0 0 0 1.5px var(--cth-ink-500)'
                  : 'inset 0 0 0 1px var(--cth-ink-100)',
                fontFamily: 'var(--cth-font-ui)', fontSize: 11,
                color: on ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)'
              }}
            >{initial}</button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('triggersUi.at')}</span>
        {/* A native time field, so typing 0930 works and the value is already
            the HH:MM the schedule stores. Minute granularity, not 5-minute
            steps: "09:47 on Tuesdays" is a legitimate thing to want. */}
        <input
          type="time"
          value={formatMinute(value.minute)}
          onChange={(e) => {
            const [h, m] = e.target.value.split(':').map(Number);
            if (Number.isFinite(h) && Number.isFinite(m)) onChange({ ...value, minute: h * 60 + m });
          }}
          className="cth-input"
          style={{ ...inputStyle, width: 108, padding: '3px 10px' }}
        />
        <span style={{ flex: 1 }} />
        <MiniButton onClick={() => setDays(same([1, 2, 3, 4, 5]) ? [] : [1, 2, 3, 4, 5])}>{t('triggersUi.weekdays')}</MiniButton>
        <MiniButton onClick={() => setDays(same([0, 1, 2, 3, 4, 5, 6]) ? [] : [0, 1, 2, 3, 4, 5, 6])}>{t('triggersUi.everyDay')}</MiniButton>
      </div>
      {value.days.length === 0 && <Hint>{t('triggersUi.pickDayHint')}</Hint>}
    </div>
  );
}

/**
 * The whole "when does this run" control: pick a repeating gap, or pick days and
 * a time. Both call sites (the new-schedule form and an expanded row) use this
 * so the two can never drift apart.
 *
 * `weekly === null` IS interval mode. Keeping the mode in the value rather than
 * in local state means a row that reloads from disk cannot show the wrong tab.
 */
export function SchedulePicker({ intervalMs, weekly, onInterval, onWeekly }: {
  intervalMs: number;
  weekly: WeeklyDraft | null;
  onInterval: (ms: number) => void;
  onWeekly: (w: WeeklyDraft | null) => void;
}) {
  const { t } = useTranslation();
  const tab = (active: boolean): CSSProperties => ({
    padding: '3px 16px 2px', border: 'none', cursor: 'pointer',
    background: active ? 'var(--cth-cream-100)' : 'transparent',
    boxShadow: active ? 'inset 0 0 0 1.5px var(--cth-ink-500)' : 'inset 0 0 0 1px var(--cth-ink-100)',
    fontFamily: 'var(--cth-font-ui)', fontSize: 11,
    color: active ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)'
  });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <button type="button" style={tab(!weekly)} onClick={() => onWeekly(null)}>{t('triggersUi.every')}</button>
        <button type="button" style={tab(!!weekly)} onClick={() => onWeekly(weekly ?? DEFAULT_WEEKLY)}>{t('triggersUi.onDays')}</button>
      </div>
      {weekly
        ? <WeeklyPicker value={weekly} onChange={onWeekly} />
        : <IntervalPicker value={intervalMs} onChange={onInterval} />}
    </div>
  );
}

/** Narrow a stored mission's `weekly` to a draft, or null for interval mode.
 *  One place decides what "this mission is weekly" means. */
export function weeklyDraft(w: WeeklySchedule | { days: number[]; minute: number } | undefined): WeeklyDraft | null {
  const n = normalizeWeekly(w);
  return n ? { days: n.days, minute: n.minute } : null;
}
