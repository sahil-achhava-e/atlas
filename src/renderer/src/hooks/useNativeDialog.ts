import { useState } from 'react';

/**
 * A button that opens a NATIVE dialog has to answer the click itself.
 *
 * `dialog:chooseFolder` and `dialog:attachFiles` cross into the main process and
 * ask the OS for a window. That takes a beat, and for that beat the button looks
 * exactly as it did before it was pressed — so the click reads as missed, and the
 * honest response is to click again. The second click opens a second dialog
 * behind the first.
 *
 * This holds a `pending` flag for as long as the dialog is open. Feed it to the
 * button's `disabled` (PixelButton already draws a disabled fill) and the press
 * is visible immediately and cannot be repeated.
 */
export function useNativeDialog<A extends unknown[]>(
  open: (...args: A) => Promise<void>
): readonly [boolean, (...args: A) => Promise<void>] {
  const [pending, setPending] = useState(false);
  const run = async (...args: A): Promise<void> => {
    if (pending) return;
    setPending(true);
    try {
      await open(...args);
    } finally {
      setPending(false);
    }
  };
  return [pending, run] as const;
}
