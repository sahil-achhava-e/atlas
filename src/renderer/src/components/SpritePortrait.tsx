import { useEffect, useRef, useState } from 'react';
import { paintCastPortrait } from '@/scene/office/cast';
import { PORTRAIT_W, PORTRAIT_H } from '@/scene/office/portraitArt';

const FRAME_W = PORTRAIT_W;
const FRAME_H = PORTRAIT_H;

export interface SpritePortraitProps {
  /** A cast key, or any other string, which gets a generated face. */
  character: string;
  /** Pixels per source pixel, in CSS pixels. The backing store is this times
   *  the display's device pixel ratio, so the art is drawn at the resolution
   *  the screen actually has rather than at half of it. */
  scale?: number;
  background?: string;
}

/** The display's device pixel ratio, kept current when the window moves between
 *  a laptop screen and an external monitor — otherwise a portrait painted at
 *  2x stays at 2x on a 1x display (and soft the other way round). */
function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = (): void => setDpr(window.devicePixelRatio || 1);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [dpr]);
  return dpr;
}

/** Static standing portrait, painted from the procedural recipe. */
export function SpritePortrait({
  character,
  scale = 2,
  background = 'transparent'
}: SpritePortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dpr = useDevicePixelRatio();

  // ONE SOURCE PIXEL = A WHOLE NUMBER OF DEVICE PIXELS. That is the whole trick,
  // and both halves of it were missing.
  //
  // The backing store used to be sized in CSS pixels, so on a 2x display every
  // portrait was painted at half the resolution the screen could show and the
  // compositor stretched it the rest of the way.
  //
  // And the scales callers ask for are not all whole: 0.85, 1.25, 0.56. At 2x
  // those are 1.7, 2.5 and 1.12 device pixels per source pixel, so a column
  // lands on a fraction and the edge smears whatever the smoothing flag says.
  // Snapping to a whole number and deriving the CSS box from it costs a pixel
  // or two of size and buys an exactly crisp image; a portrait sits bottom
  // aligned in an overflow-hidden box everywhere it is used, so a slightly
  // taller one crops at the crown rather than breaking a layout.
  // FLOOR, not round: rounding up would make a portrait LARGER than the box the
  // layout reserved for it (1.5 on a 1x display would round to 2, a third
  // bigger). Below one device pixel per source pixel there is nothing to snap
  // to — an 18px-wide drawing cannot be drawn smaller than 18 device pixels
  // without resampling — so that case passes through and shrinks.
  const raw = scale * dpr;
  const devScale = raw >= 1 ? Math.floor(raw) : raw;
  const bw = FRAME_W * devScale;
  const bh = FRAME_H * devScale;
  const w = bw / dpr;
  const h = bh / dpr;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, bw, bh);
    if (background !== 'transparent') {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, bw, bh);
    }
    // Paint at the DEVICE scale. The painter blits with smoothing off, so this
    // is a nearest-neighbour enlargement to the real pixel grid, not a stretch.
    paintCastPortrait(ctx, character, devScale).catch(() => { /* asset load race */ });
  }, [character, background, devScale, bw, bh]);

  return (
    <canvas
      ref={canvasRef}
      width={bw}
      height={bh}
      style={{
        width: w,
        height: h,
        imageRendering: 'pixelated'
      }}
    />
  );
}
