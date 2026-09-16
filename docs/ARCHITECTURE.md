# Architecture, project structure and design system

_Moved out of the README so that document can do its job of explaining the product._
_This is the contributor's map. Start here before your first pull request._

## Architecture

Two data planes feed one renderer:

```
┌───────────────────────────────────────────────────────────────┐
│                     Electron Renderer (React)                  │
│   ┌──────────────────┐    ┌──────────────────────────────┐    │
│   │ Office Floor     │    │ Terminal + Command Bar       │    │
│   │ (Pixi.js)        │    │ Files + Git tabs (xterm.js)  │    │
│   └─────────▲────────┘    └────────────▲─────────────────┘    │
│             │ avatar state             │ pty bytes / fs / git  │
└─────────────┼──────────────────────────┼───────────────────────┘
              │ IPC (contextBridge: window.cth)
       ┌──────┴──────────┐        ┌──────┴─────────────┐
       │  Event Plane    │        │  Terminal Plane    │
       │  hooks / hive   │        │  node-pty PTYs     │
       │  router + god   │        │  + fs + git        │
       └────────▲────────┘        └──────▲─────────────┘
                │ hook payloads          │ stdin / stdout
                └─────────┬──────────────┘
                   ┌──────┴──────────────┐
                   │ claude / codex / …  │
                   └─────────────────────┘
```

- **Terminal plane.** The main process owns a `PtyManager` that spawns each agent as a `node-pty`
  process and streams output over per-id IPC (`pty:data:<id>`). The renderer talks only through a
  typed `window.cth` bridge ([`src/preload/index.ts`](../src/preload/index.ts)), which also exposes
  sandboxed filesystem and git helpers.
- **Hive / event plane.** `hive.ts` is the on-disk multi-agent layer; `hooks.ts` runs the hook
  server that provider bridges POST lifecycle payloads to (`cth-hook` for Claude Code, `agy-hook`
  for Antigravity). `memory.ts` wraps the semantic memory CLI. The router delivers messages, drains
  provider outboxes, the god agent adjudicates, and idle/inbox wakeups keep workers draining mail.

Thirteen engines are supported — `claude`, `codex`, `grok`, `kimi`, `gemini`, `antigravity`,
`qwen`, `opencode`, `crush`, `pi`, `copilot`, `cursor` and `custom`. Each brings its own account;
the app never proxies a model call.

## Project structure

```
src/
  main/                      Electron main process (Node)
    index.ts                 window, IPC handlers, quit guard, deep links
    pty.ts / ptyEnv.ts       node-pty manager (spawn/write/resize/kill/stream) + child env
    hive.ts                  on-disk multi-agent layer (memory, mailboxes, router)
    hooks.ts                 hook server + provider hook shims (`cth-hook`, `agy-hook`)
    memory.ts / reflect.ts   semantic memory layer + memory condensation
    knowledge.ts / kg-core.cjs  knowledge graph store and CLI core
    config.ts / roster.ts    harness config persistence, home setup, agent roster
    skills.ts                skill discovery and install (resources/skills + agent homes)
    hire.ts                  hire-manifest import (see src/shared/hire.ts for the spec)
    transcript.ts            reads ~/.claude/projects/ JSONL transcripts for real token/cost telemetry
    telemetry.ts             live OTel collector + usage/cost feed for observability
    usage.ts / pricing.ts    UsageProvider seam + per-model cost attribution
    costLifetime.ts          durable lifetime spend ledger
    breaker.ts / control.ts  cost/runaway circuit breaker (steer/constrain/stop) + HITL gate
    realtime*.ts             voice control: session, actions, cost, completion + floor watchers
    freeflow.ts / groq.ts    push-to-talk dictation
    slack.ts / webhook.ts    Slack and webhook triggers; triggerHistory.ts records fires
    integrations.ts          third-party integration catalogue + broker
    github.ts                GitHub issue + CI run ingestion via the gh CLI
    updater.ts / analytics.ts  electron-updater flow + opt-out PostHog events
    db.ts                    SQLite durable store (window bounds + history)
    fs.ts / git.ts           sandboxed filesystem + git bridges
    shellEnv.ts              resolve PATH and shell env for child processes
    workerLaunch.ts / workerWake.ts  ephemeral workers god spawns, and their wakeups
  preload/                   contextBridge → typed window.cth API
  renderer/src/
    App.tsx                  top-level layout + wiring
    design/                  tokens.css / tokens.ts / global.css (design source of truth)
    components/              PixelPanel, PixelButton, AgentDetailPanel, CommandBar, SettingsModal, …
    CommandCenterPanel,      the god agent's control surface: Terminal, Needs you, Tasks, Floor,
                             Memory, Graph, Activity, Workers, Triggers, Skills
    SidebarTabs,             the focus view for one agent: Terminal, Git, Messages
    TasksKanban,             dependency-aware kanban board (Tasks tab)
    ThreadsPanel,            hive message conversation viewer (Messages tab)
    MessageQueueComposer,    park messages for a busy agent
    TechnicalLog,            folds the raw terminal away in simple mode, keeps the composer
    scene/office/            Pixi office floor: OfficeFloor, Character, Camera, cast, portraitArt,
                             avatarLibrary, pathfinding, …
    store/ · hooks/          zustand store, event loop, PTY parser, typewriter
    assets/                  tilesets, maps, fonts (see ATTRIBUTION.md)
docs/                        logos and favicons, `model-catalog.json`, and these docs
docs/design/                 per-feature design notes (knowledge graph)
hires/                       the crew's hire manifests (see hires/README.md)
resources/skills/            skills bundled with the app and installed into agent homes
HIVE.md · SPEC.md · DESIGN.md   multi-agent · product/terminal spec · visual design
docs/message-queue.md        who may type into an agent's terminal, and when
docs/release-drops.md        authoring a full-size release page instead of a toast
```

<div align="right">(<a href="#atlas">↑ back to top</a>)</div>

## Design system

The aesthetic is **Animal Crossing × Earthbound × SNES menu UI** — pixel-snapped, chunky, friendly.
[`DESIGN.md`](../DESIGN.md) is canonical; every component derives from its tokens, and the brand
accent is `--cth-lilac` (`#5B3DF5`).

Faces are drawn in code, not sampled from a sheet: `portraitArt.ts` layers skin → clothing → face →
facial hair → hair → headwear from an explicit recipe, and the walking sprite on the floor is the
same recipe with legs added, so an agent matches its card exactly. There are 31 recipes — Atlas's
own, plus the thirty in `avatarLibrary.ts` (six each from Naruto, One Piece, Attack on Titan, Fairy
Tail and Slime) — and any name outside that set is hashed into a generated face, so an agent always
has a portrait.
