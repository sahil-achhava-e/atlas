# Notice

The `ponytail` skill is by **Dietrich Gebert**, MIT licensed, vendored here
verbatim from the ponytail plugin **v4.9.0** (`DietrichGebert/ponytail`).

`SKILL.md` is unmodified. Re-vendor from the upstream plugin rather than editing
it here, so a future version is a clean replacement:

```
cp ~/.claude/plugins/cache/ponytail/ponytail/<version>/skills/ponytail/SKILL.md .
```

Only the core `ponytail` skill is bundled. The plugin also ships
`ponytail-review`, `-audit`, `-debt`, `-gain` and `-help`; they are one-shot
report commands rather than a working mode, and every bundled skill's
description costs context in every agent at boot.
