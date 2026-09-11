import { useEffect, useRef, useState } from 'react';

/**
 * A dropdown that looks like the rest of the app.
 *
 * A native <select> renders the OS widget: a different font, a different
 * radius, a different highlight colour, and on macOS a menu that ignores every
 * token in this file. One control in the app looking like it came from another
 * program is the thing you notice first.
 *
 * Deliberately small: a button, a list, click-outside, Escape, and arrow keys.
 * No portal and no positioning library — the menu is absolutely positioned in
 * its own stacking context, which is enough for a control that sits inside a
 * dialog or a panel.
 */
export interface DropdownOption {
  value: string;
  label: string;
  /** Optional colour for the leading dot: state, accent, whatever the caller means. */
  tone?: string;
}

export function Dropdown({
  value,
  options,
  onChange,
  ariaLabel,
  width = 180,
  align = 'bottom'
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  width?: number | string;
  /** Which way the menu opens. Bottom by default because the first use sits in
   *  a dialog footer; a dropdown near the top of a panel wants 'top'. */
  align?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const root = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const picked = options[active];
        if (picked) { onChange(picked.value); setOpen(false); }
      }
    };
    // Capture, so Escape closes the menu before the dialog behind it closes too.
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, options, active, onChange]);

  return (
    <div ref={root} style={{ position: 'relative', width, flexShrink: 0 }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen((o) => !o); }}
        style={{
          width: '100%', height: 34, padding: '0 10px 0 12px',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          border: 'none', borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
          background: 'var(--cth-paper-100)',
          boxShadow: open
            ? 'inset 0 0 0 1px var(--cth-lilac), 0 0 0 3px color-mix(in srgb, var(--cth-lilac) 18%, transparent)'
            : 'inset 0 0 0 1px var(--cth-ink-100)',
          fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 500,
          color: 'var(--cth-ink-900)',
          transition: 'box-shadow 120ms ease'
        }}
      >
        {current?.tone && (
          <span style={{
            width: 8, height: 8, flexShrink: 0, borderRadius: 'var(--cth-radius-pill)',
            background: current.tone
          }} />
        )}
        <span style={{ flex: 1, textAlign: 'start', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current?.label}
        </span>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"
          style={{ flexShrink: 0, color: 'var(--cth-ink-500)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 140ms ease' }}>
          <path d="M5.5 8l4.5 4.4L14.5 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: 'absolute', insetInlineStart: 0,
            ...(align === 'bottom' ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
            minWidth: '100%', zIndex: 50,
            padding: 4, borderRadius: 'var(--cth-radius-input)',
            background: 'var(--cth-paper-100)',
            boxShadow: '0 0 0 1px var(--cth-ink-100), var(--cth-shadow-hover)'
          }}
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  width: '100%', height: 32, padding: '0 10px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  border: 'none', borderRadius: 'var(--cth-radius-btn)', cursor: 'pointer',
                  background: i === active ? 'var(--cth-cream-100)' : 'transparent',
                  fontFamily: 'var(--cth-font-ui)', fontSize: 13,
                  fontWeight: selected ? 600 : 400,
                  color: 'var(--cth-ink-900)', textAlign: 'start'
                }}
              >
                {o.tone && (
                  <span style={{
                    width: 8, height: 8, flexShrink: 0, borderRadius: 'var(--cth-radius-pill)',
                    background: o.tone
                  }} />
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                {selected && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ color: 'var(--cth-lilac)' }}>
                    <path d="M3.4 8.4l3 3 6.2-6.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
