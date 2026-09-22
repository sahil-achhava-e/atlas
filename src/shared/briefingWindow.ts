/**
 * A briefing is several messages, not one message with several recipients.
 *
 * The boardroom filled only when ONE hive message had two or more targets,
 * which in practice means a broadcast. But a lead does not broadcast — that
 * reaches the whole floor including crews with nothing to do with the work. A
 * lead writes to each engineer by name, so a design meeting arrives as separate
 * single-target messages. From this floor's own log, Atlas asking Naruto to run
 * a design meeting:
 *
 *   +0s   naruto → sasuke   Design input: Merchandise scan/reconciliation
 *   +15s  naruto → sakura   Design input: admin Merchandise tab
 *   +33s  naruto → hinata   Design review: Merchandise scan/reconciliation
 *
 * That is a meeting by any reading, and the floor drew three desk handoffs and
 * left the boardroom empty.
 *
 * TWO THINGS MAKE THIS HARDER THAN "GROUP THE MESSAGES". The gaps are 15-18
 * seconds, so the window has to be generous. And by the time a burst has gone
 * quiet the recipients are working — on the very thing they were briefed about
 * — and a working agent never leaves its desk, which is the floor's rule and a
 * good one. So a settled briefing does not fire once and vanish: it WAITS,
 * offered on every tick, until the group is free at the same moment. Usually
 * that is a minute or two later, when they have replied to their lead.
 *
 * Clock-free and timer-free: the caller passes `now` and asks what is pending,
 * so the rule is testable without fake timers.
 */

/** Quiet time after the last message before a burst counts as finished. The
 *  observed gaps inside one dispatch are 13-18s. */
export const BRIEFING_SETTLE_MS = 25_000;

/** A burst stops growing after this, so an afternoon of unrelated traffic does
 *  not accumulate into one enormous meeting. */
export const BRIEFING_MAX_MS = 150_000;

/** How long a settled briefing keeps waiting for everyone to be free before it
 *  is given up on. Past this it is stale: the work has moved on. */
export const BRIEFING_PATIENCE_MS = 240_000;

/** How many people make it a meeting rather than a handoff. */
export const BRIEFING_MIN_ATTENDEES = 2;

export interface Briefing {
  /** Who did the briefing — they take the head of the table. */
  from: string;
  /** Everyone they wrote to in the burst, in the order first written to. */
  attendees: string[];
}

interface Burst {
  ids: string[];
  first: number;
  last: number;
}

export class BriefingWindow {
  private bursts = new Map<string, Burst>();

  /** Record one routed message. `targets` is what the router resolved, so a
   *  broadcast arrives as its full recipient list and still forms one
   *  briefing. */
  note(from: string, targets: readonly string[], now: number): void {
    if (!from) return;
    const recipients = targets.filter((t) => t && t !== from);
    if (!recipients.length) return;
    let burst = this.bursts.get(from);
    // Past the ceiling: that burst belongs to an earlier piece of work, and a
    // new message starts a new one rather than reopening it.
    if (burst && now - burst.first > BRIEFING_MAX_MS) {
      this.bursts.delete(from);
      burst = undefined;
    }
    if (!burst) {
      burst = { ids: [], first: now, last: now };
      this.bursts.set(from, burst);
    }
    for (const id of recipients) if (!burst.ids.includes(id)) burst.ids.push(id);
    burst.last = now;
  }

  /**
   * Briefings that have gone quiet and are still worth staging.
   *
   * Offered on EVERY call until the caller says one was staged, because the
   * room is rarely free the moment the briefing lands. Bursts that never
   * gathered two recipients, and ones nobody could stage inside the patience
   * window, are dropped here.
   */
  pending(now: number): Briefing[] {
    const out: Briefing[] = [];
    for (const [from, burst] of [...this.bursts]) {
      const quiet = now - burst.last >= BRIEFING_SETTLE_MS;
      const capped = now - burst.first >= BRIEFING_MAX_MS;
      if (!quiet && !capped) continue;
      if (burst.ids.length < BRIEFING_MIN_ATTENDEES
        || now - burst.last > BRIEFING_SETTLE_MS + BRIEFING_PATIENCE_MS) {
        this.bursts.delete(from);
        continue;
      }
      out.push({ from, attendees: burst.ids });
    }
    return out;
  }

  /** The meeting formed — stop offering this one. */
  staged(from: string): void { this.bursts.delete(from); }

  /** Forget everything — for teardown. */
  clear(): void { this.bursts.clear(); }
}
