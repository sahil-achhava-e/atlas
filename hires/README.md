# Hires

A **hire** is a `.json` manifest that defines what an agent actually does. The
avatar and the name are just a face on the floor: `Zoro` means nothing until a
manifest is attached to it. Same crew member can be a backend engineer today and
a reviewer tomorrow, depending on the file you import.

Import one through **Add agent → Import hire**. The form fills from it and
nothing spawns until you press Spawn. Contract: `src/shared/hire.ts`.

## `reference/`

The 20 manifests that shipped with the upstream project, restored **unchanged**
for comparison. They are not ours and are not meant to be run as they are: the
names, characters and `"author": "Agent Gallery"` all belong to munder-difflin.

They are here because the goals are worth reading. Each is 850-1800 characters
of real instruction, not a one-line role, and several encode good habits worth
stealing: read the actual source before trusting a PR description, collapse
duplicate findings into one root cause, escalate only above a stated bar,
propose fixes from a worktree instead of pushing to main.

| Manifest | What it does |
|---|---|
| `jim-pr-reviewer` | reads PRs against the real checked-out source, comments file:line |
| `dwight-qa` | reproduce, write a failing test, then fix |
| `ryan-developer` | full-stack, ships tested and reviewed work to conventions |
| `creed-security` | adversarial security auditor |
| `stanley-migrations` | bulk refactors, codemods, migrations |
| `pam-docs` | keeps the README and docs true to the code |
| `pam-designer` | accessible, responsive production HTML/CSS |
| `oscar-analyst` | defensible, reproducible data answers |
| `kevin-data` | data wrangling, ETL, validation |
| `toby-compliance` | licence, secrets and compliance checks |
| `meredith-vendors` | dependency and supply-chain updates |
| `angela-budget` | token spend and cost auditing across the fleet |
| `ryan-prototype` | rapid product and UI prototyping |
| `phyllis-research` | market, user and competitive research |
| the rest | sales, outreach, support, marketing, social, feedback |

Upstream also ships per-provider variants of each (antigravity / claude / codex).
Those are the same goal with a different engine, so they are not restored here.

## Ours

Our manifests go in this folder, one per role. The crew is defined by the work,
not by the cast list: several backend, a couple of frontend, one reviewer, as
many as the projects need. The plan is to read the reference set, take what is
good, and write better ones rather than adopt theirs.
