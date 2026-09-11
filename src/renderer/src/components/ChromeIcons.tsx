/**
 * Title-bar icons: moon, sun, gear, expand, collapse.
 *
 * One 24 grid, one 1.8px stroke, round caps and joins throughout, so the three
 * controls read as a set rather than three glyphs that happened to land next to
 * each other. The rest of the app uses a 16x16 pixel set; this bar does not,
 * for the same reason the mark does not.
 */
type P = { size?: number };
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const MoonIcon = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path {...S} d="M20.5 14.2A8.6 8.6 0 019.8 3.5a8.6 8.6 0 1010.7 10.7z" />
  </svg>
);

export const SunIcon = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle {...S} cx="12" cy="12" r="4.2" />
    <path {...S} d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6L6 18M18 6l1.6-1.6" />
  </svg>
);

export const GearIcon = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle {...S} cx="12" cy="12" r="3.1" />
    <path {...S} d="M19.4 14.6a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.03 1.56V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.11-1.56 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.56-1.03H3a2 2 0 110-4h.1a1.7 1.7 0 001.56-1.11 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34H9a1.7 1.7 0 001.03-1.56V3a2 2 0 114 0v.1a1.7 1.7 0 001.03 1.56 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87V9a1.7 1.7 0 001.56 1.03H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1.03z" />
  </svg>
);

export const ExpandIcon = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path {...S} d="M8.5 3.5h-5v5M15.5 3.5h5v5M15.5 20.5h5v-5M8.5 20.5h-5v-5" />
  </svg>
);

export const CollapseIcon = ({ size = 17 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path {...S} d="M3.5 8.5h5v-5M20.5 8.5h-5v-5M20.5 15.5h-5v5M3.5 15.5h5v5" />
  </svg>
);
