---
name: bug-fix
description: Fix a tracked bug in any repo, reproduce-first. Fetches the work item, proves the bug with a re-runnable BEFORE artifact, fixes it, proves the artifact now passes, and prepares the tracker update for the human to approve. Use whenever asked to fix a bug by id, or to work a bug from the board.
---

# Fixing a bug

The rule this exists for: **a fix you cannot prove is a guess.** Everything below
is in service of one artifact, created before the fix and re-run after it.

Project coordinates (tracker, branches, checks, gates, invariants) come from
`.atlas/project.json` at the repo root. Azure DevOps plumbing — auth, TLS, work
item reads and updates — is the `azure-devops` skill; use it rather than writing
`az` incantations here. Never hardcode either into this file.

## 0. Preflight (fails fast, one line each)

1. `.atlas/project.json` exists and parses. If not: say which repo has no config
   and stop. Do not guess a base branch.
2. Working tree clean (`git status --porcelain` empty), or stop and say so.
3. The tracker answers: fetch the work item. A TLS or auth error here is the
   `azure-devops` skill's §1, not a bug in the task.

A preflight failure is one line and a stop. Fifteen identical errors later is not.

## 1. Read the bug

Pull title, severity, state, repro steps (strip HTML), area path, tags, and any
image attachments — look at the screenshots, they usually carry the real repro.

Stop, and say why, if: the state is already Resolved or Closed; the area is
outside this repo; the repro steps do not describe observable behaviour.

Restate it in four lines before touching code: what happens, what should happen,
where you think it lives, how you will prove it.

## 2. Branch

`git fetch origin && git checkout -b <fixPrefix><id>-<slug> origin/<base>`

From the freshly fetched remote ref, never a local branch that may be days
behind. Slug: lowercase, hyphens, 40 chars.

## 3. Prove the bug — BEFORE artifact (mandatory)

Pick the lightest form that actually reproduces THIS bug:

- **Backend, logic, API** — write the test you would write anyway, against the
  unfixed code, and watch it fail. That red run is the artifact. Second best: a
  script that calls the real function on the bug's exact inputs and captures the
  wrong output verbatim.
- **Pure computation** (pricing, rounding, dates, timezones) — run the real code
  on the bug's exact numbers, old expression and new, so BEFORE/AFTER is a table.
- **UI** — you cannot see. Use the reported on-screen values as the baseline and
  trace each wrong value to the code that produces it. The human's own check is
  the AFTER.

**Never use the running dev server as the baseline.** Mid-task the backend is not
restarted, so a live call may hit stale-compiled or hot-reloaded code and lie
about which version produced the output. Use something deterministic.

Cannot reproduce? Stop. Report what you checked, and offer to ask the reporter
for what is missing. Never fix an unconfirmed bug.

## 4. Size it, then spend accordingly

- **Small** — one file, no new behaviour, no schema, no auth, no money. Fix it,
  turn the artifact green, run the checks, report. No gates, no ceremony.
- **Medium / Large** — more than one file, or it touches an invariant, a
  migration, auth, pricing or an external contract. Say so and get the human's
  nod on the approach before implementing.

Judge honestly. A one-line null check does not earn a ceremony, and a pricing
change does not escape one.

## 5. Fix it

Root cause, not symptom: grep every caller of what you are changing. One guard in
the shared function beats a guard in each caller, and patching only the path the
bug report names leaves its siblings broken.

Read `invariants` from the config before you write. They are the things that are
silently catastrophic rather than loudly wrong.

## 6. Prove the fix — AFTER

Re-run the same artifact:
- red test → now green. Show both runs.
- script or table → BEFORE and AFTER on the same inputs, from the real code.
- UI → the values that should now appear, handed to the human to confirm.

Then run every `checks` entry from the config and quote what each said. A check
you did not run is a check that failed.

Delete scratch harnesses. The durable proof is the test you committed.

## 7. Hand back

Do not post to the tracker, do not commit, do not merge. Produce:

```
Bug <id>: <title>
Root cause: <one sentence — the actual defect, not the symptom>
Fix: <one sentence — what changed>
Proof: <the artifact, before → after>
Checks: <each check and what it printed>
Branch: <name>
```

Then ask for one of: **approve** (post the comment, resolve the work item, commit
on the branch) · **approve and merge** (also merge to base and push) · **revise**
· **abort** (delete the branch, change nothing).

Wait. Resolving someone else's tracker and pushing to a shared branch are not
yours to decide.

On approve, the tracker update is the `azure-devops` skill's job: post the
two-line comment, set the state, and set the build field if the project has one.
Every past comment stays; you are adding to a history, not replacing it.

## What this skill will not do

Spawn subagents to review its own work. Separation of duties between two
instances of the same model is theatre; the red-to-green artifact is the thing
that actually cannot lie. If the work genuinely needs a second pair of eyes, it
needs a second hired agent with its own worktree, which is the human's call.
