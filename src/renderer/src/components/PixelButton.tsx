import { CSSProperties, ReactNode, useState } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'danger-ghost';
type Size = 'sm' | 'md' | 'lg';

export interface PixelButtonProps {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: CSSProperties;
  title?: string;
}

const heightBySize: Record<Size, number> = { sm: 26, md: 34, lg: 42 };
const padBySize: Record<Size, string> = { sm: '0 10px', md: '0 16px', lg: '0 20px' };

export function PixelButton({
  variant = 'primary',
  size = 'md',
  children,
  onClick,
  disabled = false,
  fullWidth = false,
  style,
  title
}: PixelButtonProps) {
  const [pressed, setPressed] = useState(false);
  const [hover, setHover] = useState(false);

  // DISABLED TEXT IS ITS OWN COLOR, not the variant's.
  //
  // Every variant swaps its FILL to `--cth-cream-300` when disabled, but the
  // variants used to keep their enabled text token — and `primary`'s is
  // `--cth-cream-50`, the INVERSE foreground picked to sit on an ink-900 button.
  // On the cream-300 disabled fill that pairing collapses: in dark mode it is
  // #1A191E text on #37363E (~1.4:1, effectively invisible), and in light mode a
  // near-white #FFFDF5 on tan, which is barely better. That is why a disabled
  // Send or Dispatch reads as an empty box.
  //
  // `--cth-ink-500` is the one foreground that works against cream-300 in BOTH
  // themes, because both tokens flip together — and a muted label is what a
  // disabled control should look like anyway.
  // ink-700, not ink-600: a disabled button's fill is cream-200, and ink-600 on
  // THAT measured 4.48:1. WCAG exempts inactive controls, but a label nobody can
  // read is still a label nobody can read.
  const disabledText = 'var(--cth-ink-700)';

  const palette = (() => {
    switch (variant) {
      case 'primary':
        // The main action wears the brand colour. It used to be ink-900, which
        // is the TEXT token: in light mode that made a near-black button, and in
        // dark mode the token flips to off-white, so the same button turned pale.
        // One accent reads the same way in both themes, and it is the one thing
        // on screen that should look clickable before you read it.
        return {
          fill:    disabled ? 'var(--cth-cream-200)' : (hover ? 'var(--cth-lilac-hover)' : 'var(--cth-lilac)'),
          text:    disabled ? disabledText : 'var(--cth-on-accent)',
          border:  disabled ? 'var(--cth-ink-300)' : 'var(--cth-lilac)',
          shadow:  'var(--cth-lilac-hover)'
        };
      case 'secondary':
        // White with a hairline, not a grey fill: beside a filled primary, two
        // filled buttons make you decide which one is the answer.
        return {
          fill:    disabled ? 'var(--cth-cream-200)' : (hover ? 'var(--cth-cream-100)' : 'var(--cth-paper-100)'),
          text:    disabled ? disabledText : 'var(--cth-ink-800)',
          border:  disabled ? 'var(--cth-ink-300)' : 'var(--cth-ink-300)',
          shadow:  'var(--cth-ink-100)'
        };
      case 'ghost':
        return {
          fill:    hover ? 'var(--cth-cream-100)' : 'transparent',
          text:    disabled ? disabledText : 'var(--cth-ink-800)',
          border:  'transparent',
          shadow:  'transparent'
        };
      case 'danger-ghost':
        // Destructive, but not SHOUTING it while idle. A solid red block parked
        // permanently beside three outline buttons makes a toolbar look like an
        // alarm; the red belongs on the pointer, where the consequence is about
        // to happen. Same idea the IDE's close button hand-rolled in CSS.
        return {
          fill:    disabled ? 'transparent' : (hover ? 'var(--cth-coral)' : 'transparent'),
          text:    disabled ? disabledText : (hover ? 'var(--cth-on-danger)' : 'var(--cth-coral-text)'),
          border:  disabled ? 'transparent' : (hover ? 'var(--cth-coral)' : 'var(--cth-ink-300)'),
          shadow:  'transparent'
        };
      case 'destructive':
        // White text on red. Ink-900 on coral was near-black on red, which is
        // the least legible pair in the palette and the one that matters most.
        return {
          fill:    disabled ? 'transparent' : (hover ? 'color-mix(in srgb, var(--cth-coral) 86%, #000)' : 'var(--cth-coral)'),
          // Not a literal white: dark mode's coral is a LIGHT red, where white
          // measures 2.77:1. The token flips with the theme.
          text:    disabled ? disabledText : 'var(--cth-on-danger)',
          border:  disabled ? 'var(--cth-ink-100)' : 'var(--cth-coral)',
          shadow:  'var(--cth-ink-300)'
        };
    }
  })();

  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => { setPressed(false); setHover(false); }}
      onMouseEnter={() => setHover(true)}
      disabled={disabled}
      style={{
        // Centre content HERE rather than trusting each call site.
        //
        // A <button> with a fixed height centres bare text on its own, but a
        // child that is itself `inline-flex` (which every icon+label call site
        // uses, to sit the glyph beside the word) aligns on ITS baseline
        // instead. So a row of buttons where some labels were wrapped and some
        // were bare text — `edit` beside `IDE` and `terminal` — sat at visibly
        // different heights. Fixing it per call site fixes today's row and not
        // the next one someone writes.
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Matches the gap the wrapped call sites already use, so an icon can be
        // dropped in beside a label with no wrapper at all.
        gap: 4,
        // Kill descender-driven drift: with the height fixed above, an inherited
        // line-height only moves the text off centre.
        lineHeight: 1,
        // A button never shrinks below its own label. The default flex-shrink is
        // 1, and with `whiteSpace: nowrap` below, a squeezed button keeps drawing
        // its full-width text out of a narrowed box — so in a tight row the
        // labels paint straight over whatever sits to their left. That is not a
        // clipped button, it is two controls on top of each other.
        flexShrink: 0,
        height: heightBySize[size],
        padding: padBySize[size],
        background: palette.fill,
        color: palette.text,
        border: 'none',
        borderRadius: 'var(--cth-radius-btn)',
        // A primary button carries its own colour into its shadow, which is what
        // makes it read as the one thing to press. Secondary keeps the hairline:
        // an outline is the right weight for a control that is not the answer.
        boxShadow: pressed && !disabled
          ? `inset 0 0 0 1px ${palette.border}`
          : variant === 'primary'
            ? 'var(--cth-shadow-btn)'
            : `inset 0 0 0 1px ${palette.border}, var(--cth-shadow-sm)`,
        transform: pressed && !disabled ? 'translateY(1px)' : 'none',
        transition: 'box-shadow 140ms ease, transform 90ms ease',
        fontFamily: 'var(--cth-font-ui)',
        fontWeight: 600,
        fontSize: size === 'lg' ? 'var(--cth-text-body-md)' : 'var(--cth-text-body-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: fullWidth ? '100%' : 'auto',
        userSelect: 'none',
        // Height is fixed by the size variant above, so a label that wraps does
        // not make the button taller — the extra line simply prints through the
        // bottom border. Every label here is a short phrase ("Check for updates",
        // "reset & start over"), so wrapping is always a layout bug rather than a
        // wanted behaviour. Callers that genuinely want a multi-line button can
        // still override, since `style` spreads after this.
        whiteSpace: 'nowrap',
        ...style
      }}
    >
      {children}
    </button>
  );
}
