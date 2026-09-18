import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropdown } from '@/components/Dropdown';
import { DESK_MAP, deskByName } from '@/scene/office/deskDirectory';

/**
 * Choose a desk, and see where it is.
 *
 * A dropdown of `pc-3` and `desk-market-researcher` is unanswerable — the names
 * say nothing about the floor. So the labels are positional ("Row 2 · desk 4")
 * and the list sits next to a mini-map with the chosen desk lit, because the
 * question being asked is "where does this agent sit", which is spatial.
 *
 * Desks already taken are shown with their occupant and cannot be chosen: two
 * agents cannot share one, and the floor would silently reseat the second.
 *
 * Atlas is absent by construction — deskDirectory leaves his cabin out.
 */
export function DeskPicker({
  value, occupants, onChange, scale = 6
}: {
  /** The chosen spawn-point name, or '' for "wherever there is room". */
  value: string;
  /** Desk name → the agent sitting there, for everyone but this agent. */
  occupants: Record<string, string>;
  onChange: (name: string) => void;
  /** Pixels per tile. The Add-agent step has a whole dialog to itself; the row
   *  in Edit agent sits beside a form and stays small. */
  scale?: number;
}) {
  const { t } = useTranslation();
  const selected = deskByName(value);
  /** With no desk chosen the floor seats first-free — so show WHICH desk that is
   *  rather than leaving it a surprise. Marked differently from a real choice:
   *  it is where they would land today, not a reservation. */
  const implied = useMemo(
    () => (value ? null : DESK_MAP.desks.find((d) => !occupants[d.name]) ?? null),
    [value, occupants]
  );

  const options = useMemo(() => [
    { value: '', label: t('deskPicker.anywhere') },
    // A taken desk stays visible — seeing who has it is the answer to "why can
    // I not pick that one" — but carries its occupant as a hint, and choosing it
    // is harmless anyway: the floor falls back to first-free rather than
    // double-seating.
    ...DESK_MAP.desks.map((d) => ({
      value: d.name,
      label: d.label,
      hint: occupants[d.name],
      tone: occupants[d.name] ? 'var(--cth-ink-400)' : undefined
    }))
  ], [occupants, t]);

  // The map is drawn at 4px per tile: big enough to recognise the shape of the
  // office, small enough to sit beside a form field.
  const S = scale;
  const W = DESK_MAP.width * S;
  const H = DESK_MAP.height * S;

  return (
    <div style={{
      display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap',
      flexDirection: scale >= 10 ? 'column' : 'row'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
        <Dropdown
          value={value}
          options={options}
          onChange={onChange}
          ariaLabel={t('deskPicker.label')}
          width={220}
          // Open DOWNWARD: this field sits low in the modal, and the default
          // upward menu put the first desks above the top edge.
          align="top"
        />
        <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
          {selected
            ? t('deskPicker.chosen', { label: selected.label })
            : implied
              ? t('deskPicker.impliedHint', { label: implied.label })
              : t('deskPicker.anywhereHint')}
          {' '}{t('deskPicker.clickHint')}
        </span>
      </div>

      <svg
        width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={t('deskPicker.mapLabel')}
        style={{
          // The floor is the light part and the walls are the dark part, which is
          // the way round a plan is read. The first version drew only the solid
          // tiles and came out as white noise on black.
          background: 'var(--cth-paper-100)',
          boxShadow: 'inset 0 0 0 1px var(--cth-ink-200)',
          borderRadius: 3, flexShrink: 0
        }}
      >
        {[...DESK_MAP.solid].map((k) => {
          const [x, y] = k.split(',').map(Number);
          return <rect key={k} x={x * S} y={y * S} width={S} height={S} fill="var(--cth-ink-100)" />;
        })}
        {DESK_MAP.desks.map((d) => {
          const taken = !!occupants[d.name];
          const isSelected = d.name === value;
          const isImplied = implied?.name === d.name;
          const grow = isSelected || isImplied ? 1 : 0;
          return (
            <rect
              key={d.name}
              x={d.x * S - grow}
              y={d.y * S - grow}
              width={S + grow * 2}
              height={S + grow * 2}
              rx={1}
              fill={isSelected ? 'var(--cth-mint)'
                : isImplied ? 'var(--cth-mint-light)'
                : taken ? 'var(--cth-coral)' : 'var(--cth-ink-400)'}
              stroke={isSelected || isImplied ? 'var(--cth-ink-900)' : 'none'}
              strokeWidth={1}
              strokeDasharray={isImplied ? '2 2' : undefined}
              style={{ cursor: 'pointer' }}
              onClick={() => onChange(isSelected ? '' : d.name)}
              role="button"
              tabIndex={0}
              aria-label={taken ? `${d.label} — ${occupants[d.name]}` : d.label}
              aria-pressed={isSelected}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(d.name); }
              }}
            >
              <title>{taken ? `${d.label} — ${occupants[d.name]}` : d.label}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
