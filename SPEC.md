# Atlas — Spec

A desktop control room for the coding-CLI agents you already run in terminals. Each agent is a
character on a shared 2D office floor: you can watch what it is doing, type to it, and set its job,
engine and budget from one place.

---

## 1. Product shape

### What it is
- **Electron desktop app**, macOS-first, also built for Windows and Linux.
- Every agent is a real CLI process the app spawns and owns through `node-pty`. No tmux, no
  attaching to something you started elsewhere.
- One office floor (Pixi.js) holds the whole crew: one desk per agent, plus a cafeteria they walk
  to when idle. What an agent is doing shows as its status, its thought bubble and its tool bubble.
- A terminal view shows the raw byte stream for whichever agent is selected, and the composer types
  into it.
- Thirteen engines are supported (`claude`, `codex`, `grok`, `kimi`, `gemini`, `antigravity`,
  `qwen`, `opencode`, `crush`, `pi`, `copilot`, `cursor`, `custom`). Everyone brings their own
  account; the app never proxies a model call.

### What it is not
- Not a replacement for the CLI. The CLI is the runtime; this is the harness around it.
- Not a remote dashboard. Local processes only, no auth, no web access.
- Not a code editor. There is a file tree and a git tab, not an IDE.
- Not a model provider. Nothing is sent anywhere the underlying CLI would not have sent it.

---

## 2. The two planes

The terminal plane (PTY bytes) and the event plane (hook payloads and the on-disk hive) are
described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), with the hive's own contract in
[HIVE.md](HIVE.md). The short version: hooks tell the app *what* an agent is doing, the PTY stream
shows *exactly* what it said, and neither is inferred from the other.

---

## 3. Adding an agent

**Add agent** is four steps, gated so a later step cannot open until the ones before it are
answered (`src/renderer/src/components/addAgentGate.ts`):

| Step | What it asks |
|---|---|
| Identity | name and face |
| Workspace | the project folder the agent lives in |
| Engine | provider, model, spawn command, auto mode |
| Briefing | what it does, and an optional standing goal |

Simple mode drops the Engine step and inherits the workspace's engine and model.

Two other routes reach the same form, and neither spawns anything on its own: importing a hire
manifest (`hires/`, spec in `src/shared/hire.ts`) and the `atlas://hire?src=<https-url>` deep link.
A manifest is untrusted input — it pre-fills the form for human review and that is all.

---

## 4. The floor

Each agent gets a desk. Idle agents wander; working agents sit. Above them:

- a **thought bubble** for what the agent is saying, prefixed with an icon for the tool it just
  called (`ThoughtBubble.ts`, icons from `toolIcon`),
- a **status**, which is what the badge, the card and the floor all read from.

Statuses (`PixelBadge.tsx`): `idle`, `thinking`, `working`, `waiting`, `blocked`, `success`,
`ghost`, `compacting`, `looping`. One more is not an agent state at all — the badge also shows when
*you* have unsubmitted text on an agent's prompt, because that holds its message queue.

Faces are procedural, not sprite sheets: 31 recipes (Atlas plus the thirty in `avatarLibrary.ts`),
and any other name is hashed into a generated face. See [DESIGN.md](DESIGN.md) §8.

---

## 5. Configuring an agent

**Edit agent** covers Identity (name, face, colour), Briefing (description, goal) and Engine
(provider, model — applied on next restart). Budget and isolation come from the hire manifest or
its defaults: `isolate: true` gives an agent its own git worktree rather than your live checkout,
and `tokenCap` bounds its spend.

App-level settings live in `config.json` under Electron's `userData` directory. The hive — mailboxes,
memory, tasks, spawn requests — lives under `HIVE_ROOT`, which each agent gets in its environment
alongside `AGENT_ID`, `AGENT_NAME` and `AGENT_DIR`. SQLite (`db.ts`) holds only a `kv` table and
`command_history`.

---

## 6. Typing into an agent

The app is not the only thing that can type into a terminal — you can too, and so can the hive
router when it delivers a message. Who wins, and when a queued message is allowed through, is one
document: [docs/message-queue.md](docs/message-queue.md). The rule it exists to protect: the user
owns the prompt.

---

## 7. Release surface

Updates run through `electron-updater` against this repo's GitHub releases. A release can ship a
plain notes digest (a corner toast) or an authored full-size page — see
[docs/release-drops.md](docs/release-drops.md).
