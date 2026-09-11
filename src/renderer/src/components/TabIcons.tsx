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
