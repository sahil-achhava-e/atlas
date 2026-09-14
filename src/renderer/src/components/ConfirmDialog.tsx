import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';

/**
 * A small in-app confirm, for the handful of actions that end something.
 *
 * Replaces `window.confirm`, which draws the BROWSER's alert: a grey system
 * sheet in the OS font, outside the theme, that also blocks the whole renderer
 * thread while it is up. It is the one piece of UI in the app that no token
 * reaches.
 *
 * Deliberately not a general modal: title, one line of body, two buttons. An
 * action that needs more explanation than that needs its own dialog.
 */
export interface ConfirmDialogProps {
  title: string;
  body: string;
  /** The affirmative button's label — say what it does ("Stop and archive"),
   *  never "OK", so the button and the consequence match. */
  confirmLabel: string;
  /** Paints the confirm button coral. Anything that ends a process. */
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  title, body, confirmLabel, destructive = false, onCancel, onConfirm
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  // PixelButton does not forward a ref, so focus reaches through the row.
  const rowRef = useRef<HTMLDivElement>(null);

  // Esc cancels, and focus lands on the confirm button so the dialog is
  // answerable from the keyboard — both of which the browser's alert gave us
  // for free and a hand-rolled one has to put back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    rowRef.current?.querySelector<HTMLButtonElement>('button:last-of-type')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(26, 19, 32, 0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // Above the 500 the add/edit dialogs sit at: this interrupts them.
        zIndex: 900
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 380, maxWidth: '92vw' }}>
        <PixelPanel variant="dialog" title={title} noPadding>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{
              margin: 0,
              fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '19px',
              color: 'var(--cth-ink-700)'
            }}>{body}</p>
            <div ref={rowRef} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <PixelButton variant="secondary" size="sm" onClick={onCancel}>
                {t('common.cancel')}
              </PixelButton>
              <PixelButton
                variant={destructive ? 'destructive' : 'primary'}
                size="sm"
                onClick={onConfirm}
              >
                {confirmLabel}
              </PixelButton>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}
