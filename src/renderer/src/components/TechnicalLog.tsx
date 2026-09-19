import type { ReactNode } from 'react';
import { type Agent } from '@/store/store';
import { ActivityLog } from './ActivityLog';

/**
 * THE READABLE PANE. There is no terminal here.
 *
 * The pane used to host the engine's own TUI — box drawing, ANSI, spinners, and
 * a permission prompt answered by keystroke. It is the truth of the session and
 * it is unreadable unless you already know what you are looking at, and it takes
 * typing, which invites typing into a session that is not yours to drive.
 *
 * What a person is here to read is what the agent is SAYING and what it is
 * working on, so that is all this shows, read-only. It comes from the session
 * transcript rather than the terminal's bytes (shared/activityFeed.ts), because
 * the transcript is already structured and un-drawing a terminal is not.
 *
 * THE TERMINAL IS NOT GONE, it is not HERE. Fullscreen still opens the real
 * xterm for the moments only the engine's own output will do — a stuck prompt,
 * an engine error, a diff you want in full. `children` is that terminal, and it
 * is deliberately not rendered: `terminalPool` keeps one xterm per pty alive for
 * the app's lifetime either way, so nothing is lost by leaving it unmounted and
 * the scrollback is intact whenever it is opened.
 *
 * The COMPOSER is not part of this. It lives below and is untouched: this pane
 * must never be the reason there is no way to say something to an agent.
 */
export function TechnicalLog({ agent }: { agent: Agent; children?: ReactNode }) {
  return <ActivityLog agent={agent} />;
}
