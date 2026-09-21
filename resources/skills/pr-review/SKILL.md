---
name: pr-review
description: The merge-decision review for a pull request in any repo. Says what the PR does, what it changes in production, what business logic moves, and what the risk is, then gives a verdict the approver can act on in ten seconds. Use when asked to review a PR, review a branch before merge, or work the PR queue.
---

# Deciding whether a PR is safe to merge

This is the **approver's** review, and it answers one question: if this ships
today, what changes for the people using it, and what could go wrong?

It is not a style pass. The author already ran `pre-commit-review`; repeating
line-level nitpicks here wastes the one review that can still stop a bad merge.

Coordinates from `.atlas/project.json`; tracker and PR plumbing from the
`azure-devops` skill.

## What to review

- **no argument** — the oldest open non-draft PR targeting the base branch that
  you have not yet voted on. Casting any vote drops it from the walk, so repeated
  runs move through the queue oldest to newest, one at a time.
- **a number** — that PR id.
- **a branch name** — that source branch against the base.
- **`current`** — the working branch against the base, for work that is not a PR yet.

## 1. Establish scope

Fetch. Get the real merge base, not the tip of your local base branch. Then read:

- the diff, in full, for anything risky;
- **the surrounding code of every risky file**, because impact lives in what you
  did not change;
- the project's `rules` files, especially the shared decisions or known-couplings
  list. That file is where "touching one leg of this breaks the other two" is
  written down.

If the PR claims to fix a tracked bug, read the bug. Compare the fix to the
bug's expected result and say whether it actually achieves it. A clean,
well-tested fix for the wrong thing is still the wrong thing.

Read the PR's existing comment threads before writing. Repeating a point the
author already answered wastes both of you.

## 2. Answer the questions that decide a merge

**Behaviour** — what does an operator, a customer, an integrator see differently
after this ships? Give one before-and-after example, concretely.

**Blast radius** — which flows and roles are affected, and explicitly which
adjacent ones are not. Naming what is untouched is half the value.

**Business logic** — pricing, money, refunds, lifecycle and status transitions,
capacity, permissions. Flag every one with what changes numerically. If the
author did not call it out, that is a REQUEST CHANGES until they confirm it was
intended. If there are none, say "no business-logic changes" in those words.

**Couplings** — if the PR touches one leg of a known coupling, verify every leg
moved. One-leg changes are the classic silent bug.

**Data and deploy** — migration? correct order? reversible? does this need
another system deployed with it, or is it one safe unit?

**Security** — auth, isolation between tenants or customers, secrets, injection,
permission guards. A pre-existing hole you find along the way is an out-of-band
note to the owner, never a PR comment: an unfixed vulnerability written into a
repo travels with every clone.

**Tests** — does the changed behaviour have coverage that would fail if it
regressed? Not "are there tests", but "would these have caught this".

**Rollback** — how is this undone if it is wrong in production? If the answer is
"restore a backup", say so, because that is a risk, not a plan.

## 3. Mark every section

Each section carries exactly one mark:

- **PASS** — checked against the diff and the files, no concern.
- **ATTENTION** — non-blocking, or a decision the approver must consciously make.
- **FAIL** — blocking.
- **N/A** — genuinely does not apply, with a clause saying why.

A point you could not verify is ATTENTION with "not verified: why" — never PASS.

The verdict follows the marks, not the other way round: any FAIL means REQUEST
CHANGES, otherwise any ATTENTION means APPROVE WITH COMMENTS, otherwise APPROVE.
If you want a different verdict, change the marks and show the evidence.

## 4. Output

```
## PR review — <source> → <target>

Summary (plain language, what and why, no mark)

Bug ↔ fix        <mark>   (bug-fix PRs only)
Change inventory <mark>
Production impact<mark>
Business logic   <mark>
Known couplings  <mark>
Data / migrations<mark>
API contract     <mark>
Security         <mark>
Test coverage    <mark>
Risks (ranked)   <mark>
Rollback         <mark>

Verdict: APPROVE | APPROVE WITH COMMENTS | REQUEST CHANGES

Action required from you
<one verb, at most three one-clause items, and the single vote command>
```

The last section is the one the approver reads. One verdict verb, at most three
fix items of one clause each, one command. Everything else is already above it.

## 5. Do not act on the author's behalf

This review informs a decision; it does not cast it. Do not vote, do not merge,
do not post to the PR unless asked in that turn. Do not push to the author's
branch.

The one thing worth saying twice: if it is a bug-fix PR and the fix does not
achieve what the bug asked for, say so prominently and do not report the bug as
closed, even when the code is clean. Reduced scope is a decision for the human,
made deliberately, not a thing that happens quietly at merge.
