# Hires

A **hire** is a `.json` manifest that defines what an agent actually does. The
avatar and the name are just a face on the floor: `Zoro` means nothing until a
manifest is attached to it. Same crew member can be a backend engineer today and
a reviewer tomorrow, depending on the file you import.

Import one through **Add agent → Import hire**. The form fills from it and
nothing spawns until you press Spawn. Contract: `src/shared/hire.ts`.

## The crew

One file per crew member, named after them. Fourteen of them; Atlas has none
because the orchestrator is not hired, it is spawned as god.

| Manifest | Agent | `character` | `accent` |
|---|---|---|---|
| `armin.hire.json` | Armin | `toby` | slate |
| `eren.hire.json` | Eren | `ryan` | lemon |
| `kakashi.hire.json` | Kakashi | `stanley` | plum |
| `light.hire.json` | Light | `oscar` | lilac |
| `luffy.hire.json` | Luffy | `jim` | jade |
| `mikasa.hire.json` | Mikasa | `angela` | sky |
| `misa.hire.json` | Misa | `kelly` | coral |
| `nami.hire.json` | Nami | `meredith` | indigo |
| `naruto.hire.json` | Naruto | `andy` | lemon |
| `robin.hire.json` | Robin | `pam` | rose |
| `ryuk.hire.json` | Ryuk | `creed` | slate |
| `saitama.hire.json` | Saitama | `kevin` | olive |
| `sakura.hire.json` | Sakura | `phyllis` | peach |
| `zoro.hire.json` | Zoro | `dwight` | mint |

`character` is the cast key the app persists — the internal id behind the face,
not a name anyone sees. Accents are unique per agent except two pairs (Armin and
Ryuk share slate, Eren and Naruto share lemon): there are fourteen of us and
twelve colours.

## What is still empty

Each manifest is scaffolded with the mechanical fields already right and the job
left blank, waiting to be written:

| Filled in | Left empty |
|---|---|
| `spec`, `name`, `character`, `accent` | `description` |
| `provider`, `model` | `goal` |
| `isolate: true`, `tokenCap` | `capabilities` |

So all fourteen import cleanly and none of them does anything yet. A hire is
worth writing at length: a goal of 850-1800 characters of real instruction beats
a one-line role, and the habits worth encoding are the specific ones — read the
actual source before trusting a PR description, collapse duplicate findings into
one root cause, escalate only above a stated bar, propose fixes from a worktree
instead of pushing to main.

Defaults worth knowing before they get overridden: `isolate: true` means an agent
works in its own git worktree rather than your live checkout, `tokenCap` is 1M,
and every one of them is on `claude` with `claude-opus-4-8[1m]`.

All fourteen pass the app's own `validateHireManifest`.
