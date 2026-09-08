// Design tokens — single source of truth. Mirrors tokens.css for non-styled consumers (Pixi).
// Any change here must also update tokens.css.

export const colors = {
  cream: {
    50: 0xfffdf5,
    100: 0xfff8e7,
    200: 0xf4e9c7,
    300: 0xe8d9a0
  },
  paper: {
    100: 0xfcfaf0,
    200: 0xf0ead2
  },
  ink: {
    900: 0x1a1320,
    700: 0x3d2e4a,
    500: 0x6b5878,
    300: 0xa899b5,
    100: 0xd9cfe0
  },
  // v0.3.4 recalibration: same hues, professional saturation (mirrors tokens.css)
  accent: {
    coral: 0xf2685c,
    coralLight: 0xffd9d4,
    mint: 0x35b876,
    mintLight: 0xcff0df,
    sky: 0x22a6c4,
    skyLight: 0xcbebf3,
    lemon: 0xefb223,
    lemonLight: 0xffedc2,
    lilac: 0x8b6fe8,
    lilacLight: 0xe2dafb,
    peach: 0xf2914d,
    peachLight: 0xffe2c9,
    rose: 0xe85c93,
    roseLight: 0xffd6e5,
    plum: 0xb457ce,
    plumLight: 0xf0d9f7,
    indigo: 0x4e6fe3,
    indigoLight: 0xd8defb,
    jade: 0x12a38c,
    jadeLight: 0xc4efe6,
    olive: 0x9aae3c,
    oliveLight: 0xe8f0c4,
    slate: 0x78859a,
    slateLight: 0xdde2e8
  },
  // Presence: busy red, away yellow, available green, idle pale.
  // Mirrors the --cth-status-* tokens; keep the two in step.
  status: {
    idle: 0xb8b2c0,
    thinking: 0xd64550,
    working: 0xd64550,
    blocked: 0xe0a32e,
    success: 0x4ca362,
    ghost: 0xd9d3de
  },
  world: {
    grassLight: 0xd4eab0,
    grassDark: 0xb5d589,
    woodLight: 0xe5c896,
    woodDark: 0xc9a66b,
    path: 0xe8d8b0,
    wall: 0x8b6f47
  }
} as const;

export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64
} as const;

export const type = {
  display: '"Atlas Display", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Geeza Pro", "Noto Naskh Arabic", "Segoe UI Historic", monospace',
  ui: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Geeza Pro", "Noto Naskh Arabic", "Segoe UI Historic", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, "PingFang SC", "Microsoft YaHei", "Noto Sans Mono CJK SC", "Noto Sans CJK SC", "Geeza Pro", "Noto Naskh Arabic", "Segoe UI Historic", monospace'
} as const;

export const tileSize = 32; // px — the world is built from 32×32 tiles

export type AccentColorName =
  | 'coral' | 'mint' | 'sky' | 'lemon' | 'lilac' | 'peach'
  | 'rose' | 'plum' | 'indigo' | 'jade' | 'olive' | 'slate';

export const accentByName: Record<AccentColorName, number> = {
  coral: colors.accent.coral,
  mint:  colors.accent.mint,
  sky:   colors.accent.sky,
  lemon: colors.accent.lemon,
  lilac: colors.accent.lilac,
  peach: colors.accent.peach,
  rose: colors.accent.rose,
  plum: colors.accent.plum,
  indigo: colors.accent.indigo,
  jade: colors.accent.jade,
  olive: colors.accent.olive,
  slate: colors.accent.slate
};

export const accentLightByName: Record<AccentColorName, number> = {
  coral: colors.accent.coralLight,
  mint:  colors.accent.mintLight,
  sky:   colors.accent.skyLight,
  lemon: colors.accent.lemonLight,
  lilac: colors.accent.lilacLight,
  peach: colors.accent.peachLight,
  rose: colors.accent.roseLight,
  plum: colors.accent.plumLight,
  indigo: colors.accent.indigoLight,
  jade: colors.accent.jadeLight,
  olive: colors.accent.oliveLight,
  slate: colors.accent.slateLight
};

/** An agent's accent: one of the twelve token names, or a literal '#rrggbb'
 *  the user mixed themselves. Everything that paints an accent goes through
 *  here, so a custom colour works anywhere a named one does. */
export function accentCss(a: string): string {
  return a.startsWith('#') ? a : `var(--cth-${a})`;
}
export function accentFillCss(a: string): string {
  // A custom colour has no matching '-light' token, so it is faded here instead.
  return a.startsWith('#') ? `${a}33` : `var(--cth-${a}-light)`;
}
export function accentNumber(a: string): number | undefined {
  if (a.startsWith('#')) return parseInt(a.slice(1), 16);
  return (accentByName as Record<string, number>)[a];
}

// Convert 0xRRGGBB to "#RRGGBB"
export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0').toUpperCase();
}
