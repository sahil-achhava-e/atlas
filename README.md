# Atlas

A personal fork of [munder-difflin](https://github.com/chaitanyagiri/munder-difflin),
rebranded and reworked. Not distributed, not a product: it is the copy I run.

Atlas turns the coding CLI you already use into a crew of long-lived agents working
on your machine, each pinned to a project folder, coordinated by an orchestrator
called **Atlas**. You give Atlas the job; it splits the work, hands pieces to the
right agent, and comes back only for the calls that are yours to make.

Everything runs locally. Nothing is sent anywhere.

---

## Status

Working on: the setup wizard, the theme, and the crew. The office floor and the
Command Center are still as forked.

**The packaged app does not build on this machine.** ThreatLocker SIGKILLs unsigned
standalone binaries, which kills `esbuild` and the unsigned native modules Electron
needs, so `npm run dev` and `electron-builder` both die on launch. The renderer is a
plain React app with no hard Electron dependency, so it previews in a browser
instead. That is what `.preview/` is for.

## Previewing the UI

Vite serves the renderer from a Linux container (no ThreatLocker), your browser is
the window, and edits hot-reload.

```bash
# first time
cd .preview && docker build -t atlas-preview . && cd ..
docker run -d --name atlas-preview -p 5199:5199 \
  -v "$PWD":/app -v atlas_node_modules:/app/node_modules atlas-preview

# after that
open -a Docker              # if it is not running
docker start atlas-preview
node .preview/pick-folder.mjs &   # native folder chooser, see below
open http://127.0.0.1:5199
```

**What works and what does not.** The Electron main process is not there, so
`.preview/stub-cth.js` stands in for the `window.cth` preload bridge. Every call
resolves empty unless the stub names it. The UI, layout, theme and copy are real.
Live agents, terminals, git and file access are not.

**The folder picker.** A browser cannot open a native dialog, and Chrome's own
directory picker demands an "allow this site to view and copy files" grant while
still refusing to hand over an absolute path. So `.preview/pick-folder.mjs` runs on
the host, calls `osascript`, and returns real paths. Vite proxies `/__pick` to it, so
the page's fetch stays same-origin and the app's CSP is untouched. If the helper is
not running the preview falls back to Chrome's picker, then to typing a path.

**Switching theme colour:**

```bash
python3 .preview/theme.py nebula   # purple, amethyst, indigo, plum, nebula, blue
```

Each run resets `tokens.css` and `index.html` from the last commit before applying,
so variants never stack, and uncommitted edits to those two files are discarded.

## What changed from upstream

- **Atlas everywhere.** Name, orchestrator, boot splash, default folder
  (`~/atlas-data`). `DEFAULT_GOD_NAME` in `src/shared/godIdentity.ts` is the single
  source; a few places had it hardcoded, including the prompt that told the
  orchestrator its own name.
- **Nebula theme.** Deep violet in both light and dark, one lit ground instead of the
  diagonal weave. Brand violet, cyan for selection, mint only where green means "on".
- **Type.** Press Start 2P is gone. The display face is JetBrains Mono pinned to
  weight 700 (`"Atlas Display"` in `fonts.css`), so labels can size freely.
- **Setup rebuilt.** Six steps in a proper box with a step rail and a progress
  footer, rewritten copy in both registers, three engines instead of eleven, home
  moved last with a review of what Finish will write.
- **The crew.** Fifteen anime characters drawn from the same procedural recipes as
  the walking sprites, plus four accessories (straw hat, mask, blindfold, whiskers)
  that make them recognisable at 18 pixels wide.
- **A frozen baseline commit** (`0db52fe`) sits under all of it, so the diff from
  upstream stays readable.

## Layout

| Path | What |
|---|---|
| `src/main/` | Electron main: hive, PTYs, IPC, config, the folder dialog |
| `src/preload/` | the `window.cth` bridge |
| `src/renderer/` | the React app: floor, Command Center, setup wizard |
| `src/renderer/src/scene/office/` | the floor, and the procedural portraits |
| `src/shared/` | code both sides use: providers, engine availability, identity |
| `.preview/` | the browser preview harness (this fork only) |

## Running for real

On a machine without ThreatLocker:

```bash
npm install     # postinstall rebuilds node-pty against Electron's ABI
npm run dev     # Electron with hot reload
npm run typecheck
```

Needs Node 18+, a C/C++ toolchain for `node-pty`, and at least one agent CLI on
`PATH`: `claude`, `codex` or `gemini`.

## Credit and licence

All of the hard work is [Chaitanya Giri's](https://github.com/chaitanyagiri/munder-difflin).
MIT, and `LICENSE` is unchanged. Bundled art keeps its own terms in `LICENSE-ASSETS`.
