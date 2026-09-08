// Break-room small talk.
//
// An agent lingering at a coffee machine is an excuse for a one-liner, and the
// crew (see cast.ts) are agents running an engineering floor, so the lines are
// about builds, retries, tokens and logs. Two kinds:
//   • solo  - one quip shown above a single agent at a break spot
//   • pair  - a two-beat exchange between two agents at the same table
//
// Lines are kept short so they fit the ThoughtBubble (≈MAX_WIDTH). Character
// keys match OfficeCharacterName, which is the ORIGINAL cast key and not the
// crew name; anyone without bespoke lines falls back to the shared spot pool so
// the floor never feels empty.

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
  michael:  ['status, everyone', 'who is blocked?', 'I read every log', 'good run this morning'],           // Atlas
  jim:      ['PR is up', 'merged before lunch', 'shipping the small one first'],                            // Luffy
  pam:      ['wrote it all down', 'the notes are in memory', 'someone will need this later'],               // Robin
  dwight:   ['ran it twice. same result.', 'that test was flaky, not me', 'I read the whole diff'],          // Zoro
  kevin:    ['still running', 'four hours in', 'let it finish'],                                            // Saitama
  angela:   ['that lint rule exists for a reason', 'no direct pushes to main', 'the build was red'],        // Mikasa
  oscar:    ['the token spend is up', 'checked the budget again', 'actually, the numbers say otherwise'],   // Light
  stanley:  ['finished beats fast', 'been on this since morning', 'no rush'],                               // Kakashi
  phyllis:  ['it is in the README', 'the docs answered it', 'reading the changelog'],                       // Sakura
  andy:     ['the webhook fires now', 'connected both ends', 'one more integration'],                       // Naruto
  kelly:    ['already replied', 'I saw it first', 'inbox is clear'],                                        // Misa
  ryan:     ['still learning the repo', 'is this the right folder?', 'I asked before I ran it'],            // Eren
  toby:     ['logged it', 'the audit trail is clean', 'someone has to file these'],                         // Armin
  creed:    ['that error only happens on Tuesdays', 'nobody owns this service', 'the logs look odd'],       // Ryuk
  meredith: ['we are out of quota', 'rate limited again', 'asked for more headroom'],                       // Nami
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
  michael:  ['status, everyone.', 'all green.', 'that is what I like to hear.'],          // Atlas
  jim:      ['question.', 'yes.', 'nothing. just checking.'],                              // Luffy
  dwight:   ['I ran it twice.', 'and?', 'same both times. as expected.'],                  // Zoro
  kevin:    ['still running.', 'how long?', 'do not ask.'],                                // Saitama
  angela:   ['this build is red.', 'it is a break room, Mikasa.'],                           // Mikasa
  oscar:    ['actually, the numbers say otherwise.', '...here we go.'],                    // Light
  stanley:  ['is it finished?', 'no.', 'then leave it be.'],                               // Kakashi
  andy:     ['the webhook fires now.', 'nobody asked.', 'it fires though.'],               // Naruto
  kelly:    ['already replied.', 'to what?', 'everything.'],                               // Misa
  creed:    ['which service is this?', 'we sit next to it every day.'],                    // Ryuk
};

/** A multi-beat exchange for two agents sharing a table. Beats alternate:
 *  index 0 = `speaker`, 1 = the table-mate, 2 = speaker, … */
export function pickExchange(speaker: string, seed: number): Exchange {
  const keyed = KEYED_EXCHANGES[speaker as OfficeCharacterName];
  if (keyed && seed % 4 === 0) return keyed;
  return pick(PAIR_POOL, seed);
}
