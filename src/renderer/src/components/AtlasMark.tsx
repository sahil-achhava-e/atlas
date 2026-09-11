/**
 * The Atlas mark.
 *
 * Atlas carried the sky; this app runs a floor of agents that carry work. So
 * the mark is a sphere held on two shoulders, which also reads as the letter A:
 * apex, crossbar, splayed legs. One agent orbits it, because the thing that
 * makes Atlas Atlas is that it is never working alone.
 *
 * Drawn as filled geometry rather than outline strokes: at 20px an outline mark
 * next to 17px bold type reads as a wireframe, not a logo. The gradient runs
 * from the brand violet to a deeper indigo so the tile has a direction of light
 * and does not sit flat against a white bar.
 *
 * ids are suffixed per instance because two copies of a gradient with the same
 * id on one page makes the second one inherit the first.
 */
let seq = 0;

export function AtlasMark({ size = 30, radius = 10 }: { size?: number; radius?: number }) {
  const id = `atlas-mark-${++seq}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--cth-lilac)" />
          <stop offset="1" stopColor="var(--cth-lilac-hover)" />
        </linearGradient>
        {/* the light that makes the tile feel like an object rather than a swatch */}
        <radialGradient id={`${id}-sheen`} cx="0.3" cy="0.16" r="0.9">
          <stop stopColor="#FFFFFF" stopOpacity="0.28" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="32" height="32" rx={radius} fill={`url(#${id}-bg)`} />
      <rect width="32" height="32" rx={radius} fill={`url(#${id}-sheen)`} />

      {/* the shoulders, carrying */}
      <path
        d="M9 24.2 13.2 15.4h5.6L23 24.2h-3.4l-1-2.2h-5.2l-1 2.2H9Z"
        fill="#FFFFFF"
        fillOpacity="0.95"
      />
      {/* the weight */}
      <circle cx="16" cy="10.2" r="3.6" fill="#FFFFFF" />
      {/* one agent in orbit */}
      <circle cx="24.4" cy="7.6" r="1.7" fill="#FFFFFF" fillOpacity="0.55" />
    </svg>
  );
}
