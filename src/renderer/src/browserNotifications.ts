import { isBrowserMode } from './runtime';

/**
 * "Desktop notifications", in a browser.
 *
 * Main raises these with Electron's Notification. Under the server shim there is
 * no desktop to raise them on, so it forwards each one to the page, and the page
 * shows a real browser notification instead.
 *
 * PERMISSION IS ASKED FOR WHEN THE SWITCH IS TURNED ON, and at no other time. A
 * page that asks the moment it loads is the pattern browsers added their
 * gesture requirement to stop, and the honest moment to ask is the one where
 * the user has just said they want notifications.
 */
export function installBrowserNotifications(): void {
  if (!isBrowserMode() || typeof Notification === 'undefined') return;

  const on = (window.cth as unknown as {
    onNotification?: (cb: (n: { title?: string; body?: string }) => void) => () => void;
  }).onNotification;
  if (!on) return;

  on((n) => {
    // Never ask from here: this fires whenever an agent finishes, which is
    // rarely a moment the user is looking at the page, and a prompt out of
    // nowhere is how a browser learns to block the site outright.
    if (Notification.permission !== 'granted') return;
    try { new Notification(n.title || 'Atlas', { body: n.body, tag: 'atlas' }); }
    catch { /* a browser that refuses is not a failure worth surfacing */ }
  });
}

/**
 * Ask the browser for notification permission, from the click that turned the
 * switch on. Returns whether notifications can actually be shown — a `false`
 * here means the browser said no, whatever the app's own setting says.
 *
 * In the desktop app this is not the gate (macOS is), so it answers true and
 * leaves the decision where it already lives.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isBrowserMode() || typeof Notification === 'undefined') return true;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; }
  catch { return false; }
}
