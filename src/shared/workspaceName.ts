/** What to prefill "New workspace" with. `~/agents` unless that is already one
 *  this install knows, then `~/agents-2`, and so on — so pressing the button
 *  twice does not offer the folder you just made. */
export function suggestWorkspace(known: readonly string[]): string {
  const taken = new Set(known.map((k) => k.replace(/\/+$/, '').split('/').filter(Boolean).pop()));
  if (!taken.has('agents')) return '~/agents';
  for (let n = 2; n < 100; n++) if (!taken.has(`agents-${n}`)) return `~/agents-${n}`;
  return `~/agents-${Date.now()}`;
}

