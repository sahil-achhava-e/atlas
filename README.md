# Atlas

Atlas turns the coding CLI you already use into a crew of long-lived agents working
on your machine, each pinned to a project folder, coordinated by an orchestrator
called **Atlas**. You give Atlas the job. It splits the work, hands pieces to the
right agent, and comes back only for the calls that are yours to make.

Built on [munder-difflin](https://github.com/chaitanyagiri/munder-difflin) and
reworked: an audience question at setup, a mode for people who do not code, and a
skill for Office files. MIT, same licence as upstream.

The app runs on your machine and keeps its state there. The agents themselves talk
to whichever engine you point them at, so your prompts and code go to Anthropic,
OpenAI or Google exactly as they do when you run that CLI yourself. Everyone brings
their own account.

## What it does

**A crew, not a chat window.** Agents are long-lived processes, one per project
folder, each with its own terminal, memory and job. Atlas reads the board, splits
the work and dispatches it. Agents message each other through their own inboxes
rather than through you.

**A board you answer, not a prompt you babysit.** When an agent needs a decision it
posts the question to Needs you, with the face of who is asking, how long they have
been waiting and how many tasks are stuck behind it. Answering unblocks the card and
the work carries on. Tasks live on a kanban with an owner on every card.

**Whichever engine you already pay for.** Thirteen CLI presets, with `claude`,
`codex` and `gemini` offered at setup. Every agent can run a different one.

**They remember.** Each agent keeps notes it writes itself. The crew shares a
searchable memory across sessions, and an optional knowledge graph holds company
documents an agent can query instead of guessing.

**It keeps going while you are away.** Schedules and webhooks start work on their
own, sessions resume after a restart, and the team comes back when you reopen the
app. A circuit breaker and token budgets stop an agent that loops or overspends.

**Office files are first class.** Word, Excel, PowerPoint and PDF, through a skill
that ships inside the app. Details below.

**Designed rather than defaulted.** Every colour, edge and type step comes from one
token file, so light and dark are the same design and not two. Text and borders are
held to WCAG AA and the contrast was measured, not eyeballed. Real icons, no emoji
standing in for them. Motion only where it explains something. Thirty faces, one
per agent and never two the same, so you can tell your crew apart at a glance.
English and Arabic, with the whole layout mirrored for right to left.

**For people who do not code, too.** A second mode that hides the terminal, git and
the model ids. Details below.

## Two ways to use it

Setup opens by asking one question, in its own dialog, before anything else: are you
technical or not. The answer decides which app you get. It is a switch in Settings
afterwards, so nobody is stuck with the wrong one.

**Technical** is the full thing: terminals, git, the file editor, model ids, skills,
triggers, the memory graph.

**Simple mode** is for someone who does not code. A manager with a folder of
spreadsheets, not a repo. It hides what they cannot act on:

| | Technical | Simple mode |
|---|---|---|
| Setup steps | 6 | 5, no model picker |
| Screens in the panel | 10 | 5 |
| Terminal | shown | folded away, one click to open |
| Git tab, file editor | shown | hidden |
| Add agent | 4 steps | 3, no engine or branch questions |
| Settings sections | 4 | General only |
| Agents talk | engineering shorthand | plain language |

Two things follow from this and are worth knowing before you hand it to anyone.
Agents run with autonomy on in simple mode, because a permission prompt is answered
by typing into a terminal and that terminal is folded away. And there is **no undo**
for a folder that is not a git repository, so an agent's edit to a document is
permanent. The bundled Office skill tells agents to write a new file and back up
before editing in place, which is a habit, not a guarantee.

## Office documents

Agents get a skill for Word, Excel, PowerPoint and PDF that ships inside the app.
Nothing to install, both modes, from the first agent you start.

| Format | Read | Write | How |
|---|---|---|---|
| Excel `.xlsx` `.xlsm` | yes | yes | `openpyxl` |
| Word `.docx` | yes | edit, and create plain documents | Python stdlib, `textutil` on macOS |
| PowerPoint `.pptx` | yes | text edits | Python stdlib |
| PDF | text only | no | `pypdf` |

Every recipe avoids compiled Python extensions on purpose. Application allowlisting
(ThreatLocker, and MDM generally) refuses to load them on a managed laptop, so
`python-docx`, `python-pptx` and `pandas` install cleanly and then fail at import.
The skill recognises that failure and says so instead of reinstalling in a loop.

Known limits: `textutil` drops tables when it makes a `.docx`, so a real table means
filling a template or delivering a `.xlsx`. New PowerPoint decks need `python-pptx`,
so agents fill an existing deck instead. Making a PDF needs a converter that is not
here.

## Setup

Three engines: `claude`, `codex`, `gemini`. Setup checks which are installed and
offers to install the one you pick. After the persona question the steps are
welcome, engine, folders, permissions, away, home — five in simple mode, which skips
permissions. Home is last, because the folder is easier to
choose once you know what goes in it. It suggests `~/Atlas-data`.

Folders are not repos. A project is any folder with files in it.

## Building and releasing

```bash
npm install          # postinstall rebuilds node-pty against Electron's ABI
npm run dev          # Electron with hot reload
npm run typecheck
npm run test:focused
npm run dist:mac     # dist/Atlas-1.0.0-mac-universal.dmg
```

Windows gets an NSIS installer and a portable exe, Linux an AppImage. Updates come
from releases on `sahilethara/atlas`.

Needs Node 18+, a C/C++ toolchain for `node-pty`, and at least one agent CLI on
`PATH`.

**Packaging does not run on a ThreatLocker machine.** `electron-builder` shells out
to `app-builder`, a downloaded binary, and it is killed on launch (exit 137). The
same policy kills Electron itself, so `npm run dev` does not run either. Releases are
built on an unmanaged Mac, by hand — there is no CI in this repo. Without a Developer
ID certificate the output is unsigned, and an unsigned app will not open on a managed
Mac.

Publishing a release is three steps: bump `version` in `package.json`, run
`npm run dist:mac` (and `dist:win` / `dist:linux` where you can), then upload the
installers **together with `latest*.yml` and the `.blockmap` files** to a GitHub
release on `sahilethara/atlas`. The updater reads those channel files, not the
release body — the toast's "what's new" comes from `build/release-notes.md`, baked
into `latest*.yml` at package time.

## Previewing the UI without Electron

Vite serves the renderer from a Linux container, your browser is the window, and
edits hot-reload.

```bash
# first time
cd .preview && docker build -t atlas-preview . && cd ..
docker run -d --name atlas-preview -p 5199:5199 \
  -v "$PWD":/app -v atlas_node_modules:/app/node_modules atlas-preview

# after that
open -a Docker                    # if it is not running
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

## Layout

| Path | What |
|---|---|
| `src/main/` | Electron main: hive, PTYs, IPC, config, the folder dialog |
| `src/preload/` | the `window.cth` bridge |
| `src/renderer/` | the React app: floor, Command Center, setup wizard |
| `src/renderer/src/scene/office/` | the floor, and the procedural portraits |
| `src/shared/` | code both sides use: providers, engine availability, identity |
| `resources/skills/` | skills copied into every agent on spawn |
| `.preview/` | the browser preview harness (this fork only) |

## Acknowledgements

- Office tilesets and Tiled maps: **Modern Interiors — RPG Tileset [16x16]** by
  [LimeZu](https://limezu.itch.io/), used under the Complete Version licence. Crediting
  LimeZu is a condition of that licence.
- Floor scene code (`CharacterSprite`, `ToolBubble`, `SpriteAdapter`) is ported from
  [shahar061/the-office](https://github.com/shahar061/the-office) (ISC).
- The app itself is built on [munder-difflin](https://github.com/chaitanyagiri/munder-difflin), MIT.

Character portraits and walking sprites are drawn procedurally in `portraitArt.ts` and carry
no third-party licence. See `src/renderer/src/assets/ATTRIBUTION.md` for the full accounting.
