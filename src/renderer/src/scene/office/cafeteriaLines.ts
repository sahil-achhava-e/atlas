// Break-room small talk.
//
// An agent lingering at a coffee machine is an excuse for a one-liner, and these
// are agents running an engineering floor, so the lines are about builds,
// retries, tokens and logs. Two kinds:
//   • solo  - one quip shown above a single agent at a break spot
//   • pair  - a two-beat exchange between two agents at the same table
//
// Lines are kept short so they fit the ThoughtBubble (≈MAX_WIDTH). Only Atlas
// has bespoke lines: the fourteen other keyed sets went with the cast they were
// written for, and a library face has no personality to write to. Everyone else
// falls back to the shared spot pool, which is what most agents used anyway.

import type { OfficeCharacterName } from './cast';

/** Where an agent is lingering - picks a contextual line pool. */
export type BreakSpot = 'coffee' | 'vending' | 'snack' | 'table';

const pick = <T,>(arr: readonly T[], seed: number): T =>
  arr[((seed % arr.length) + arr.length) % arr.length];

// ─── solo lines, by spot ─────────────────────────────────────────────────────

const COFFEE: readonly string[] = [
  'waiting on the build',
  'third cup, first commit',
  'context window is full again',
  'refilling before the long run',
  'who broke main?',
  'the tests are still running',
];

const VENDING: readonly string[] = [
  'rate limited. again.',
  'the retry will work. probably.',
  'timeout. classic.',
  'one more attempt, then I escalate',
  'B4, please be the pretzels',
  'it is stuck. shaking it gently.',
];

const SNACK: readonly string[] = [
  'quick break between runs',
  'earned this one',
  'small win, small snack',
  'who finished the chips??',
  'second breakfast',
];

const TABLE: readonly string[] = [
  'standup notes are up',
  'the diff is smaller than it looks',
  'five minutes, then back in',
  'reading the failure log',
  'pretending to read my notes',
  'I needed this break, honestly',
];

const SPOT_POOL: Record<BreakSpot, readonly string[]> = {
  coffee: COFFEE, vending: VENDING, snack: SNACK, table: TABLE,
};

// ─── character flavour - overrides the generic pool when present ─────────────
// Keys are cast keys; the comment names the crew member they draw as.

const BY_CHARACTER: Partial<Record<OfficeCharacterName, readonly string[]>> = {
  michael:  ['status, everyone', 'who is blocked?', 'I read every log', 'good run this morning'],
};

/** A solo break-room line. Character flavour ~60% of the time, else the line
 *  fits the spot the agent is standing at. `seed` keeps it deterministic per
 *  call site (avoids Math.random, which Pixi/Electron CSP-safe code prefers). */
export function pickSoloLine(character: string, spot: BreakSpot, seed: number): string {
  const flavour = BY_CHARACTER[character as OfficeCharacterName];
  if (flavour && seed % 5 < 3) return pick(flavour, Math.floor(seed / 5));
  return pick(SPOT_POOL[spot], seed);
}

// ─── paired exchanges (two agents at one table) ──────────────────────────────
//
// Each exchange is a list of beats that ALTERNATE between the two agents:
// beat[0] = the speaker who sat down, beat[1] = their table-mate, beat[2] =
// speaker again, and so on. The director plays them out one beat at a time.
// Lines are trimmed to fit the thought cloud; longer ones auto-truncate.

type Exchange = readonly string[];

/** Banter any two agents can run. */
const PAIR_POOL: readonly Exchange[] = [
  ['is the build green?', 'do not look.', '...looked.'],
  ['who reply-all-ed?', 'we do not talk about it.'],
  ['standup ran forty minutes.', 'could have been an email.'],
  ['how many retries?', 'four.', 'that is too many.'],
  ['I read the whole log.', 'and?', 'I have regrets.'],
  ['it works on my machine.', 'ship your machine then.'],
  ['who owns this service?', 'nobody. that is the problem.'],
  ['the tests are flaky.', 'or the code is.', '...rude.'],
  ['merged.', 'reviewed?', '...merged.'],
  ['the token bill is up.', 'by how much?', 'do not ask.'],
  ['roll back or fix forward?', 'yes.'],
  ['is this the right repo?', 'no.', 'that explains a lot.'],
  ['I wrote docs.', 'nobody reads docs.', 'I read docs.'],
  ['it is a one line change.', 'it is never a one line change.'],
  ['can you review this?', 'how big?', 'do not scroll.'],
  ['prod is fine.', 'you sure?', 'I am now nervous.'],
  ['the agent went quiet.', 'thinking, or dead?', 'yes.'],
  ['who approved that?', 'I did.', 'why?', 'it was 2am.'],
  ['context ran out.', 'compact it.', 'did. twice.'],
  ['long run finished.', 'result?', 'green.', 'suspicious.'],
  ['I fixed the flaky test.', 'how?', 'deleted it.', '...bold.'],
  ['nobody touched your branch.', 'someone rebased it.', 'not me.'],
  ['did you read the spec?', 'there is a spec?'],
  ['one more run and I am done.', 'you said that at noon.'],
  ['the diff is 4,000 lines.', 'approved.', 'you did not read it.', 'correct.'],
];

// Keyed off the SPEAKER so, when the right crew member sits down first, they
// get to open with their own line.
const KEYED_EXCHANGES: Partial<Record<OfficeCharacterName, Exchange>> = {
  michael:  ['status, everyone.', 'all green.', 'that is what I like to hear.'],
};

/** A multi-beat exchange for two agents sharing a table. Beats alternate:
 *  index 0 = `speaker`, 1 = the table-mate, 2 = speaker, … */
export function pickExchange(speaker: string, seed: number): Exchange {
  const keyed = KEYED_EXCHANGES[speaker as OfficeCharacterName];
  if (keyed && seed % 4 === 0) return keyed;
  return pick(PAIR_POOL, seed);
}

// ─── talking ABOUT someone who is not there ─────────────────────────────────
//
// The oldest rule of a break room: you talk about the person who has just left.
// So these carry a `{name}`, and the director only ever fills it with someone
// who is OUT OF EARSHOT — the orchestrator in his office, a lead in theirs, a
// colleague at the far end of the floor. Say it while they are standing there
// and it stops being gossip and starts being rude, which is a different floor
// from the one this is.
//
// Kept affectionate rather than cutting. These are colleagues who like each
// other, and a break room where people are unkind about the absent is not a
// nice place to watch.

const ABOUT_PERSON: readonly Exchange[] = [
  ['{name} has been quiet today.', 'deep in something.', 'or asleep.'],
  ['did {name} read the spec?', 'there is a spec?'],
  ['{name} reviewed it in four minutes.', 'read it?', 'reviewed it.'],
  ['{name} says it is a one line change.', 'it is never a one line change.'],
  ['{name} is on their third branch.', 'of the same fix?', 'yes.'],
  ['ask {name}, they wrote it.', 'they said they did not.', 'git says otherwise.'],
  ['{name} opened a card for that.', 'a good one?', 'it has a description.', 'oh.'],
  ['{name} has been in that repo all morning.', 'winning?', 'unclear.'],
  ['{name} would know.', 'do we want {name} to know?'],
  ['I owe {name} a review.', 'how long?', 'do not ask.'],
  ['{name} merged at 2am.', 'why.', 'nobody knows.'],
  ['{name} is very calm about this.', 'that worries me.'],
  ['{name} said it was fine.', 'and was it?', 'it was fine.', '...huh.'],
  ['do not tell {name} I said that.', 'tell {name} what?', 'exactly.']
];

/**
 * The sharper half: actual complaining.
 *
 * A break room where nobody ever grumbles is not a break room. These are the
 * lines people only say when the subject has left — a review that sat for two
 * days, a card with no description, being told to hold. Same rule as above,
 * harder: the director will not choose one of these unless the person named is
 * out of earshot.
 *
 * The line it stops at: colleagues who are annoyed with each other, not
 * colleagues who are nasty about each other. Nothing here is about anybody's
 * character.
 */
const COMPLAINING: readonly Exchange[] = [
  ['my review has been sitting with {name} for two days.', 'join the queue.'],
  ['{name} sent me a card with no description.', 'again?', 'again.'],
  ['{name} reassigned it without telling me.', 'classic.'],
  ['I asked {name} twice.', 'and?', 'still waiting.'],
  ['{name} said hold. no reason.', 'so we hold.', 'so we sit here.'],
  ['{name} rewrote my branch.', 'ask first, surely.', 'you would think.'],
  ['that was {name}\'s call, not mine.', 'and we are cleaning it up.'],
  ['{name} has three cards open and none moving.', 'do not say it to them.'],
  ['I get pinged, {name} gets the credit.', 'that is the job.', 'it should not be.'],
  ['{name} changed the spec mid-run.', 'after you built it?', 'after I built it.'],
  ['nobody told {name} it was blocked.', 'who was supposed to?', 'exactly.'],
  ['{name} closed it as done.', 'was it done?', 'define done.']
];

/**
 * An exchange about somebody who is not in the room. `{name}` is filled in for
 * both speakers, so the whole conversation stays about one person.
 *
 * Two in five are the complaining pool — enough that the floor has a bit of
 * friction in it, not so much that the crew sounds miserable.
 */
export function pickAboutPerson(name: string, seed: number): Exchange {
  const pool = seed % 5 < 2 ? COMPLAINING : ABOUT_PERSON;
  return pick(pool, Math.floor(seed / 5)).map((line) => line.replace(/\{name\}/g, name));
}
