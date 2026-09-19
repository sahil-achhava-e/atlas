/**
 * Which half of the app this is.
 *
 * The renderer is the same code in both, but a browser tab has no OS to ask:
 * it cannot add a login item, cannot open System Settings, and cannot show a
 * native dialog. A switch that does nothing is worse than a switch that is not
 * there, so the few places it matters check here.
 */
export function isBrowserMode(): boolean {
  return (window.cth as unknown as { isServerMode?: boolean } | undefined)?.isServerMode === true;
}
