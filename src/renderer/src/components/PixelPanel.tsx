import { CSSProperties, ReactNode } from 'react';
import { AccentColorName } from '@/design/tokens';

type Variant = 'default' | 'inset' | 'active' | 'terminal' | 'dialog';

export interface PixelPanelProps {
  variant?: Variant;
  title?: string;
  /** When given, the title bar carries a close control. Every dialog in the app
   *  can be dismissed from its own corner rather than only from the footer. */
  onClose?: () => void;
  /** Accessible name for that control. */
  closeLabel?: string;
  accent?: AccentColorName;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
  noPadding?: boolean;
}

const borderByVariant: Record<Variant, string> = {
  default:  'var(--cth-panel-border)',
  inset:    'var(--cth-panel-border-inset)',
  active:   'var(--cth-panel-border)',  // accent overlay added separately
  terminal: 'var(--cth-panel-border-terminal)',
  dialog:   'var(--cth-panel-border-dialog)'
};

const fillByVariant: Record<Variant, string> = {
  default:  'var(--cth-cream-100)',
  inset:    'var(--cth-cream-200)',
  active:   'var(--cth-cream-100)',
  terminal: 'var(--cth-paper-100)',
  dialog:   'var(--cth-paper-100)'
};

export function PixelPanel({
  variant = 'default',
  title,
  onClose,
  closeLabel = 'Close',
  accent,
  children,
  style,
  className,
  noPadding = false
}: PixelPanelProps) {
  const baseStyle: CSSProperties = {
    background: fillByVariant[variant],
    // A card is a lifted surface now, not an outlined box. The hairline stays
    // underneath it: on dark a soft shadow is nearly invisible, and the outline
    // is what keeps the card's edge findable there.
    boxShadow: `${borderByVariant[variant]}, var(--cth-shadow-card)`,
    borderRadius: 'var(--cth-radius-card)',
    padding: noPadding ? 0 : 'var(--cth-space-3)',
    position: 'relative',
    ...style
  };

  // Active variant: paint accent over the middle border slot (3px ring at 1px inset)
  if (variant === 'active' && accent) {
    baseStyle.boxShadow = `
      inset 0 0 0 1px var(--cth-ink-100),
      inset 0 0 0 3px var(--cth-${accent}),
      inset 0 0 0 5px var(--cth-ink-900),
      var(--cth-shadow-card)`;
  }

  return (
    <div className={className} style={baseStyle}>
      {title && (
        <div
          style={{
            margin: noPadding ? 0 : '-12px -12px 12px',
            padding: '14px 16px 12px',
            background: accent ? `var(--cth-${accent})` : 'transparent',
            color: 'var(--cth-ink-900)',
            fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
            fontSize: 15, letterSpacing: '-0.2px', lineHeight: '20px',
            boxShadow: 'inset 0 -1px 0 var(--cth-ink-100)',
            display: 'flex', alignItems: 'center', gap: 12
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>{title}</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="cth-ghost-btn"
              style={{
                width: 28, height: 28, flexShrink: 0, border: 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 'var(--cth-radius-btn)',
                background: 'transparent', color: 'var(--cth-ink-500)', cursor: 'pointer'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
