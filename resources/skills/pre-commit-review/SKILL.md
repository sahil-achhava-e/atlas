---
name: pre-commit-review
description: The mandatory quality gate before any commit, in any repo. Reviews the staged and unstaged change set against the project's own rules, runs its checks and gates, and returns READY TO COMMIT or NEEDS FIXES. Use before every commit, and whenever asked whether a change is ready.
---

# Reviewing your own change before it is committed

This runs **before every commit**, including a docs-only one. The task that
produced the commit may have run tests, seeded data or left a scratch file, and
those are exactly what leaks.

You are reviewing your OWN work. That is the hard part: the failure mode is not
missing a rule, it is wanting to be done.

Project specifics come from `.atlas/project.json` — `checks`, `gates`,
`invariants`, and `rules` (the files that are the actual standard for this repo).
Read those rule files; do not restate them from memory, and do not assume another
project's rules apply here.

## 1. See the whole change set

```bash
git status --short
git diff --name-only HEAD
git diff --name-only --cached
```

Review everything that will be in the commit, staged or not. Group it: source,
tests, migrations, config, docs. Say the counts out loud — a review that does not
know how many files it is reviewing is not a review.

## 2. Run the project's gates

Every entry in `gates` from the config, in order, verbatim. Each one is a HARD
gate: non-zero exit is NEEDS FIXES, and the entry's `onFail` text is the fix
instruction to report.

Gates are the project's own scar tissue — a changeset validator, a decisions
index, a test-data sweep. They exist because something leaked once. Do not skip
one because the change "obviously" does not need it.

## 3. Run the project's checks

Every entry in `checks` — type checks, lint, whatever the project lists — and the
`tests` command. Quote the actual output. "Tests pass" without a count is not
evidence.

## 4. Read the diff against the invariants

Read the `invariants` from the config and check the diff against each one
explicitly, naming the file and line where it holds or breaks. These are the
rules that fail silently: tenant scoping, money, auth, timezones.

Then, universally, for every new or changed function:

- **Dead code** — grep the repo for callers. A new non-exported function with no
  caller is dead. MUST FIX.
- **Duplication** — grep for something that already does this. A new query, a new
  helper, a new type that restates an existing one. MUST FIX, because two copies
  drift and only one gets fixed next time.
- **Type sync** — a shared request/response shape must match on both sides. A
  missing field that forces `as any` is MUST FIX.
- **Debug residue** — console logging, commented-out code, a hardcoded skip, a
  scratch file staged by accident, a secret or a real credential in a diff.
- **Swallowed errors** — `catch (e) { throw e }`, an empty catch, an error logged
  and then ignored.
- **Scope** — anything in this diff that the task did not ask for. Unrequested
  refactoring inside a bug fix is how a one-line fix becomes a review nobody can
  do.

## 5. Classify honestly

- **MUST FIX** — blocks the commit. A bug, a security or isolation hole, a
  broken invariant, new duplication, new dead code, a failing gate or check.
- **TECH DEBT** — pre-existing, in a file you touched. Record it, name it in the
  report, do not block on it and do not fix it inside this commit.

The distinction is *new versus pre-existing*, not *easy versus hard*.

## 6. Report

```
## Pre-commit review

Files: <n> (<breakdown>)

| Check | Result |
|---|---|
| <each gate>   | PASS / FAIL — <reason> |
| <each check>  | PASS / FAIL — <what it printed> |
| tests         | PASS / FAIL — <n passed, n failed, n skipped> |
| <each invariant> | PASS / FAIL — <file:line> |
| dead code / duplication / type sync | PASS / FAIL |

MUST FIX
- <file:line> — <what> — <why it matters> — <the fix>

TECH DEBT (not blocking)
- <file:line> — <what>

Verdict: READY TO COMMIT | NEEDS FIXES
```

A mark you did not verify is not a PASS. Write "not verified: <why>" and treat it
as a finding. The verdict must follow the table: any MUST FIX means NEEDS FIXES,
no exceptions and no "ready to commit, with one caveat".

## 7. On READY TO COMMIT

Stage the files, then, if the project sets `reviewFlag`, write the staged-diff
hash to it so the commit hook can confirm the review matches what is actually
being committed:

```bash
git add <files>
git diff --staged --numstat | md5 > <reviewFlag> 2>/dev/null \
  || git diff --staged --numstat | md5sum | cut -d' ' -f1 > <reviewFlag>
```

`--numstat`, not `--stat`: the latter is terminal-width dependent and produced
mismatches when the writer and the hook ran at different widths. Touching the
flag file does not work and is not a shortcut — change the files after the
review and the hash stops matching, which is the point.

Committing is still the human's call unless they have said otherwise.

## 8. What needs a human to click

End with what only a person can check, shortest useful list:

```
Must test: <action> — <why this change affects it>
Should test: <action>
Skip: <areas this change cannot reach>
TL;DR: <one sentence smoke test>
```
