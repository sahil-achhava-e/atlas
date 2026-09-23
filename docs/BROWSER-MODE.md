# Running Atlas in a browser

For company laptops. No app to install, no installer to get approved, nothing
for SmartScreen or an endpoint agent to block — Atlas runs as a local web app on
your own machine and you open it in a tab.

The desktop builds exist for personal machines. On a managed laptop, use this.

## What it is, and is not

The browser tab and the desktop app are the **same program over the same
files** — same workspace, same agents, same board. The tab is a different way
to look at it, not a cut-down version.

It runs **entirely on your machine**. The server binds `127.0.0.1` and nothing
else, so nobody on the network can reach it, and that is deliberate: this
process can start agents that run commands in your repositories. There is no
login because there is nothing to log in to.

Two people cannot share one of these. Each person runs their own.

## What you need first

**1. Node 20 or newer.** `node --version` to check. No C++ toolchain, no Visual
Studio Build Tools, no Xcode command line tools.

**2. Git**, to get the code.

**3. An agent CLI, installed and signed in.** This is the part people miss.
Atlas does not bundle a model or a CLI — it starts the one you already use, as
you, with your account. Pick one:

| | install | then |
| --- | --- | --- |
| **Claude Code** | `npm install -g @anthropic-ai/claude-code` | `claude` |
| **Codex** | `npm install -g @openai/codex` | `codex` |
| **Gemini CLI** | `npm install -g @google/gemini-cli` | `gemini` |

Run it once on its own first — `claude`, `codex` or `gemini` — and complete the
sign-in. If it cannot start for you in a terminal, it cannot start for Atlas
either, and every agent's terminal will die immediately.

Claude Code also has a native installer if you would rather not use npm:

```
# macOS
curl -fsSL https://claude.ai/install.sh | bash
# Windows (PowerShell)
irm https://claude.ai/install.ps1 | iex
```

Those three are what setup offers. Atlas knows thirteen CLIs in total —
OpenCode, Crush, Copilot, Pi and others — and every agent on the floor can run
a different one, set per agent after setup.

## Install

```
git clone https://github.com/sahil-achhava-e/atlas.git
cd atlas
npm run setup:serve
```

`setup:serve` installs without building the desktop app, so it needs no
compiler. Both native pieces — the database and the terminals — arrive as
prebuilt binaries for macOS and Windows, Intel and ARM.

Use `setup:serve`, not a plain `npm ci`. A plain install runs
`electron-rebuild`, which rebuilds those same two native modules for the
desktop app's runtime — and once it has, the browser-mode server cannot load
them. If you did it by accident, `npm rebuild better-sqlite3` puts it back.

(If `electron-rebuild` fails outright on your machine — no compiler — the
install now finishes anyway with a warning, and browser mode works.)

## Run

```
npm run serve
```

Then open **http://127.0.0.1:5188**.

The first run walks you through setup: pick your projects, name a workspace,
and it creates `~/Atlas/<name>-workspace` for your crew.

Leave the terminal open — it IS the app. Closing it stops your agents. Ctrl-C
to stop deliberately.

## Day to day

- **Open it again**: `npm run serve` in the same folder, then the same URL.
- **Update**: `npm run update`, then stop the server and `npm run serve` again.
  It pulls, works out whether dependencies actually moved, and only reinstalls
  if they did. It refuses if you have local changes, and it does not stop your
  agents — that is deliberate, since stopping the server stops them and the
  moment is yours to pick.

  There is **no update notification** in browser mode. The auto-updater belongs
  to the desktop app; in the tab, nothing tells you a new version exists, so run
  `npm run update` when you want one. Your version is in Settings, and the
  releases are at `github.com/sahil-achhava-e/atlas/releases`.

  Restarting does not lose anything. The workspace, the agents, their briefings
  and desks are on disk, and each agent resumes its own CLI session, so a
  restart costs the turn in flight and nothing else.
- **Only one at a time.** The browser server and the desktop app share one
  workspace, so whichever starts second refuses with "Atlas is already
  running". That is the guard working, not a bug.

## When something is wrong

**The page will not load.** Is the terminal still running `npm run serve`? It
prints the URL when it is ready.

**"Atlas is already running (app, pid …)"** — the desktop app has the
workspace. Quit it, then start the server.

**An agent's terminal dies immediately.** Its CLI is missing or not signed in.
Run that CLI by itself in the same folder — `claude`, `codex` or `gemini` — and
see what it says. Atlas starts it exactly as you would.

**Your endpoint agent blocks something.** Browser mode avoids the big one — no
Electron framework, no signed installer — but `node` and the two prebuilt
native modules still have to be allowed to run. Those are the three paths worth
asking about:

```
node                                             (your Node install)
node_modules/better-sqlite3/build/Release/better_sqlite3.node
node_modules/node-pty/prebuilds/<platform>/pty.node
```

## Windows notes

Everything above is the same. Two differences worth knowing:

- Terminals use ConPTY. The installer patches a node-pty crash that happens
  when an agent's console has already gone; that patch runs automatically.
- Keeping the machine awake for long unattended runs is **not verified on
  Windows**. A laptop that sleeps pauses its agents until you wake it.
