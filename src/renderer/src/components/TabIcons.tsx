/**
 * The panel's tab icons.
 *
 * One 20 grid, 1.7px stroke, round caps and joins, every glyph optically
 * balanced inside 20x20. The app's other icons are a 16x16 pixel set drawn for
 * the office floor; at 36px in a white panel beside Inter they read as
 * artefacts, not as a style.
 *
 * Each shape says what its destination holds rather than decorating it: a
 * prompt for the terminal, a bell for the queue that wants a person, a board
 * for tasks, people for the team.
 */
type P = { size?: number };
const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
};
const box = (size: number) => ({ width: size, height: size, viewBox: '0 0 20 20', 'aria-hidden': true as const });

export const TerminalIcon = ({ size = 18 }: P) => (
  <svg {...box(size)}><rect {...S} x="2.4" y="3.6" width="15.2" height="12.8" rx="2.6" />
    <path {...S} d="M6 8.4l2.4 2-2.4 2M10.8 13h3.4" /></svg>
);
export const BellIcon = ({ size = 18 }: P) => (
  <svg {...box(size)}><path {...S} d="M10 3.2a4.6 4.6 0 014.6 4.6c0 3.8 1.5 5 1.5 5H3.9s1.5-1.2 1.5-5A4.6 4.6 0 0110 3.2z" />
    <path {...S} d="M8.4 15.6a1.8 1.8 0 003.2 0" /></svg>
);
export const TasksIcon = ({ size = 18 }: P) => (
  <svg {...box(size)}><rect {...S} x="2.8" y="3.4" width="14.4" height="13.2" rx="2.6" />
    <path {...S} d="M6.4 8.6l1.6 1.6 3-3.2M6.4 13.4h7" /></svg>
);
export const TeamIcon = ({ size = 18 }: P) => (
  <svg {...box(size)}><circle {...S} cx="7.6" cy="7.4" r="2.6" />
    <path {...S} d="M3 16.2c0-2.3 2.1-3.8 4.6-3.8s4.6 1.5 4.6 3.8" />
    <path {...S} d="M13.4 6.2a2.4 2.4 0 010 4.6M14.6 12.8c1.6.5 2.7 1.7 2.7 3.4" /></svg>
);
export const MemoryIcon = ({ size = 18 }: P) => (
  <svg {...box(size)}><path {...S} d="M10 2.8l1.7 4 4.3.5-3.2 2.9.9 4.2L10 12.3l-3.7 2.1.9-4.2L4 7.3l4.3-.5z" /></svg>
);
export const MapIcon = ({ size = 18 }: P) => (
  <svg {...box(size)}><circle {...S} cx="5.2" cy="6" r="2.2" /><circle {...S} cx="14.8" cy="6" r="2.2" />
    <circle {...S} cx="10" cy="14.6" r="2.2" /><path {...S} d="M6.8 7.4l2 5.4M13.2 7.4l-2 5.4M7.4 6h5.2" /></svg>
);
export const EventsIcon = ({ size = 18 }: P) => (
  <svg {...box(size)}><path {...S} d="M2.6 10h3l2-4.4 2.8 9 2-4.6h4.9" /></svg>
);
export const JobsIcon = ({ size = 18 }: P) => (
  <svg {...box(size)}><circle {...S} cx="6" cy="5.4" r="2.2" /><circle {...S} cx="6" cy="14.6" r="2.2" />
    <circle {...S} cx="14.4" cy="10" r="2.2" /><path {...S} d="M6 7.6v4.8M8.2 5.8h3.2a2.8 2.8 0 012.8 2.8v.2M8.2 14.2h3.2a2.8 2.8 0 002.8-2.8v-.2" /></svg>
);
export const TriggersIcon = ({ size = 18 }: P) => (
  <svg {...box(size)}><circle {...S} cx="10" cy="10" r="7.1" /><path {...S} d="M10 5.8V10l2.9 1.8" /></svg>
);
export const SkillsIcon = ({ size = 18 }: P) => (
  <svg {...box(size)}><path {...S} d="M8.2 3.2h3.6v2.2a1.6 1.6 0 103.2 0h2.2v3.4h-2.2a1.6 1.6 0 100 3.2h2.2v4.8h-4.4v-2a1.6 1.6 0 10-3.2 0v2H3.4v-4.4h2a1.6 1.6 0 100-3.2h-2V5.4h4.8z" /></svg>
);

/** git: a branch leaving the trunk, and the commit it lands back on. The agent
 *  bar used the `<>` code glyph for this tab, which is what the IDE button
 *  wears one row above it — two destinations cannot share a shape. */
export const GitIcon = ({ size = 18 }: P) => (
  <svg {...box(size)}><circle {...S} cx="6.2" cy="5.2" r="2.2" /><circle {...S} cx="6.2" cy="14.8" r="2.2" />
    <circle {...S} cx="14" cy="5.2" r="2.2" />
    <path {...S} d="M6.2 7.4v5.2M14 7.4v1.6a3.4 3.4 0 01-3.4 3.4H6.2" /></svg>
);

/** The placeholder for an image the preview cannot load. */
export const ImageIcon = ({ size = 14 }: P) => (
  <svg {...box(size)}><rect {...S} x="2.8" y="4.2" width="14.4" height="11.6" rx="2.2" />
    <circle {...S} cx="7.4" cy="8.4" r="1.4" />
    <path {...S} d="M4.2 14.2l3.6-3.4 2.6 2.4 2.8-3.2 3.4 4.2" /></svg>
);

/** Dismiss. Replaces the `✕` character five places were using as a button
 *  face: an emoji-class glyph whose weight, size and vertical centring come
 *  from whatever font resolves it, next to icons drawn on a known grid. */
export const CloseIcon = ({ size = 14 }: P) => (
  <svg {...box(size)}><path {...S} d="M5.8 5.8l8.4 8.4M14.2 5.8l-8.4 8.4" /></svg>
);

/** Stop and archive: a stop square inside the ring, because this control ends
 *  a running process. Deliberately not the power mark the status pill wears —
 *  that one is a STATE, and an action that looks like a status is a misread
 *  waiting to happen. */
export const StopIcon = ({ size = 17 }: P) => (
  <svg {...box(size)}><circle {...S} cx="10" cy="10" r="7.1" />
    <rect {...S} x="7.4" y="7.4" width="5.2" height="5.2" rx="1.2" /></svg>
);
/** The thread disclosure. Rotated 90° by the caller when the thread is open. */
export const ChevronIcon = ({ size = 16 }: P) => (
  <svg {...box(size)}><path {...S} d="M8 5.2l4.4 4.8L8 14.8" /></svg>
);

/** A re-read, and a path copied. Same grid and stroke as everything above. */
export const RefreshIcon = ({ size = 17 }: P) => (
  <svg {...box(size)}><path {...S} d="M16.2 8.4A6.4 6.4 0 005 5.6L3.6 7M3.8 11.6a6.4 6.4 0 0011.2 2.8L16.4 13" />
    <path {...S} d="M3.4 3.8v3.4h3.4M16.6 16.2v-3.4h-3.4" /></svg>
);
export const CopyIcon = ({ size = 17 }: P) => (
  <svg {...box(size)}><rect {...S} x="7.2" y="7.2" width="9.2" height="9.2" rx="2.2" />
    <path {...S} d="M12.8 4.6a2.2 2.2 0 00-2.2-2.2H5.8a2.2 2.2 0 00-2.2 2.2v4.8a2.2 2.2 0 002.2 2.2" /></svg>
);

/** Header actions, same grid and stroke as the tabs above. */
export const EditIcon = ({ size = 17 }: P) => (
  <svg {...box(size)}><path {...S} d="M12.4 3.8l3.8 3.8-8.2 8.2-4.4.6.6-4.4z" />
    <path {...S} d="M11 5.2l3.8 3.8" /></svg>
);
export const CodeIcon = ({ size = 17 }: P) => (
  <svg {...box(size)}><path {...S} d="M7.4 6.6L3.8 10l3.6 3.4M12.6 6.6L16.2 10l-3.6 3.4M10.8 4.4l-1.6 11.2" /></svg>
);
