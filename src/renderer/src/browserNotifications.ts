import { isBrowserMode } from './runtime';

/**
 * "Desktop notifications", in a browser.
 *
 * Main raises these with Electron's Notification. Under the server shim there is
 * no desktop to raise them on, so it forwards each one to the page — and the
 * page can show a real notification itself, through the browser, once the user
 * has allowed it.
 *
 * PERMISSION IS ASKED FOR ON A CLICK, not on load. Chrome ignores a request that
 * is not tied to a gesture, and a page that asks the instant it opens is the
 * pattern browsers added that rule to stop.
 */
export function installBrowserNotifications(): void {
  if (!isBrowserMode() || typeof Notification === 'undefined') return;

  const ask = (): void => {
    if (Notification.permission === 'default') void Notification.requestPermission();
  };
  window.addEventListener('click', ask, { once: true });

  const on = (window.cth as unknown as {
    onNotification?: (cb: (n: { title?: string; body?: string }) => void) => () => void;
  }).onNotification;
  if (!on) return;

  on((n) => {
    if (Notification.permission !== 'granted') { ask(); return; }
    try { new Notification(n.title || 'Atlas', { body: n.body, tag: 'atlas' }); }
    catch { /* a browser that refuses is not a failure worth surfacing */ }
  });
}
