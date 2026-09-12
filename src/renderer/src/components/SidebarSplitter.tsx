import { useEffect, useRef, useState } from 'react';

export interface SidebarSplitterProps {
  /** What a screen reader calls this handle. */
  ariaLabel?: string;
  /** Current sidebar width in px. */
  width: number;
  /** Called with the new width (already clamped externally). */
  onChange: (px: number) => void;
  /** Containing viewport width — used to clamp delta to a sane max. */
  viewportWidth: number;
  min?: number;
  max?: number;
}

/**
 * Vertical drag handle. Sits between the floor canvas (left) and the sidebar
 * (right). Drag left → wider sidebar. Cursor + pixel-stripe affordance.
 */
export function SidebarSplitter({
  width, onChange, viewportWidth, min = 320, max = 1200,
  ariaLabel = 'Resize the panel'
}: SidebarSplitterProps) {
  const startRef = useRef<{ clientX: number; width: number } | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!startRef.current) return;
      const delta = e.clientX - startRef.current.clientX; // the panel is on the left: drag right = grow
      const clampMax = Math.min(max, Math.max(min, viewportWidth - 360));
      const next = Math.min(clampMax, Math.max(min, startRef.current.width + delta));
      onChange(next);
    };
    const onUp = () => {
      startRef.current = null;
      setActive(false);
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    if (active) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [active, viewportWidth, min, max, onChange]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className="cth-splitter"
      data-active={active ? '1' : undefined}
      // Arrow keys move it too: a drag handle that only answers the mouse is
      // unreachable for anyone who does not use one.
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === 'ArrowLeft') { onChange(Math.max(min, width - step)); e.preventDefault(); }
        if (e.key === 'ArrowRight') { onChange(Math.min(max, width + step)); e.preventDefault(); }
      }}
      onMouseDown={(e) => {
        startRef.current = { clientX: e.clientX, width };
        setActive(true);
        e.preventDefault();
      }}
      onDoubleClick={() => onChange(420)}
      style={{
        // A 10px sliver was a hard target. 14 to grab, with the line drawn at
        // 1px in the middle so the seam still looks like a seam.
        width: 14,
        cursor: 'col-resize',
        flexShrink: 0,
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent'
      }}
    >
      {/* The seam itself. */}
      <span className="cth-splitter-line" style={{
        position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1,
        transform: 'translateX(-0.5px)',
        background: active ? 'var(--cth-lilac)' : 'var(--cth-ink-100)',
        transition: 'background 120ms ease'
      }} />
      {/* The grip: a pill you can see and aim at, brand-coloured while dragging
          so the whole column reads as being moved by you. */}
      <span className="cth-splitter-grip" style={{
        position: 'relative',
        width: 4, height: 34, borderRadius: 999,
        background: active ? 'var(--cth-lilac)' : 'var(--cth-ink-300)',
        transition: 'background 120ms ease, transform 120ms ease',
        transform: active ? 'scaleY(1.25)' : 'none'
      }} />
    </div>
  );
}
