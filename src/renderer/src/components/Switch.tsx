/**
 * The app's on/off control.
 *
 * A button reading "off" tells you nothing about which state you are in until
 * you read the word, and every screen styled its own: an orange pill here, a
 * ghost button there. One switch, one shape, and the state is the thing you
 * see first.
 */
export function Switch({
  on,
  label,
  onChange,
  tone = 'var(--cth-mint)',
  disabled = false
}: {
  on: boolean;
  label: string;
  onChange: () => void;
  /** The colour of the ON track. Coral marks a switch that grants something. */
  tone?: string;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      style={{
        width: 38, height: 22, flexShrink: 0, position: 'relative',
        padding: 0, border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        borderRadius: 999,
        background: on ? tone : 'var(--cth-ink-300)',
        transition: 'background 140ms ease'
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16,
        borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,.28)',
        transition: 'left 140ms ease'
      }} />
    </button>
  );
}
