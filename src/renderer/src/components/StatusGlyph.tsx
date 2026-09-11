/**
 * A glyph per agent state, on one 16 grid.
 *
 * A coloured dot says "something is true about this agent" and makes you learn
 * which colour means what. A glyph says which thing, and colour then only has
 * to reinforce it, which is also what makes the set work for anyone who cannot
 * separate the reds from the greens.
 *
 * Five shapes for ten states, matching how the colours already group:
 *   standby  idle, ghost      — free, nothing in hand
 *   spinner  working/thinking/compacting — running
 *   bell     blocked, waiting, typing, looping — someone has to act
 *   check    success          — just finished
 */
import type { StatusKind } from './PixelBadge';

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
};

export function StatusGlyph({ status, size = 13 }: { status: StatusKind; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true as const };

  // Standby: the universal "powered, not running" mark. Reads as resting rather
  // than broken, which grey dots never managed.
  if (status === 'idle' || status === 'ghost') {
    return (
      <svg {...common}>
        <path {...S} d="M4.6 4.9a4.6 4.6 0 106.8 0" />
        <path {...S} d="M8 2.2v4.4" />
      </svg>
    );
  }

  if (status === 'success') {
    return (
      <svg {...common}>
        <path {...S} d="M3.4 8.6l3 3 6.2-7" />
      </svg>
    );
  }

  if (status === 'blocked' || status === 'waiting' || status === 'typing' || status === 'looping') {
    return (
      <svg {...common}>
        <path {...S} d="M8 2.6a3.6 3.6 0 013.6 3.6c0 3 1.2 4 1.2 4H3.2s1.2-1 1.2-4A3.6 3.6 0 018 2.6z" />
        <path {...S} d="M6.7 12.6a1.4 1.4 0 002.6 0" />
      </svg>
    );
  }

  // Running: an open arc, so the shape itself suggests motion without needing
  // an animation that would have to run on every card on the floor.
  return (
    <svg {...common}>
      <path {...S} d="M13.4 8a5.4 5.4 0 11-2.6-4.6" />
      <path {...S} d="M10.6 2.6l.6 2.9-2.9.6" />
    </svg>
  );
}
