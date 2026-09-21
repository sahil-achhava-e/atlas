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

1. **Node 20 or newer.** `node --version` to check. No C++ toolchain, no Visual
   Studio Build Tools, no Xcode command line tools.
2. **The agent CLI you intend to use, signed in.** Atlas starts `claude` (or
   another provider's CLI) as you — it does not bundle one, and it cannot sign
   in for you. Check with `claude --version`.
3. **Git**, to get the code.

## Install

```
git clone https://github.com/sahilethara/atlas.git
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
- **Update**: `git pull && npm run setup:serve`, then run it again.
- **Only one at a time.** The browser server and the desktop app share one
  workspace, so whichever starts second refuses with "Atlas is already
  running". That is the guard working, not a bug.

## When something is wrong

**The page will not load.** Is the terminal still running `npm run serve`? It
prints the URL when it is ready.

**"Atlas is already running (app, pid …)"** — the desktop app has the
workspace. Quit it, then start the server.

**An agent's terminal dies immediately.** Its CLI is missing or not signed in.
Run `claude --version` yourself in the same folder.

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
