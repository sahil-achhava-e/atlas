# Atlas — Design System

> The aesthetic is **Animal Crossing × Earthbound × SNES menu UI**. Pixel-snapped, chunky, friendly. Every UI element should feel like it could appear in a Nintendo game from 1995–2005. This document is canonical: any new component must derive from these tokens.

---

## 1. Principles

1. **Pixel-snapped everything.** No half-pixels. No CSS blur. No floaty `border-radius`. The grid is real.
2. **Chunky over slick.** Borders are visible, panels have weight, buttons feel pressable. If a component could exist on iOS 17, it's wrong.
3. **Limited palette.** Each screen uses ≤ 8 colors. Each sprite uses ≤ 5. Restraint creates the look.
4. **Information through motion.** An avatar walking *is* the status. Don't add a progress bar if the walk already communicates.
5. **Friendly, never cute-for-its-own-sake.** Copy is short and human. Avoid baby talk. Think Tom Nook's signage, not Saturday morning cartoons.
6. **Read like a 90s game manual.** Heavy use of named panels, framed groups, status windows. Information has a *home*.

### What we are NOT
- Not glassmorphism. Not Material. Not iOS. Not "modern web." Not "retro filter on a normal app."
- Not pixel art for its own sake — every pixel choice serves a UX function.

---

## 2. References (study these)

| Reference | What we steal |
|---|---|
| **Animal Crossing: New Leaf / NH** | Villager characters, soft palette, friendly copy, dialog boxes |
| **Earthbound / Mother 3** | Status windows, multi-layer panel borders, vibrant flat colors |
| **Stardew Valley** | Font choice, tile floors, sprite proportions |
| **Pokémon B/W & X/Y** | Clean info panels, summary screens |
| **Mario Kart 8 (HUD only)** | Coin/timer chips, vibrant accents on neutral backgrounds |
| **Undertale** | Terminal-style typography for system feedback |
| **Stardew Concerned Ape sprites** | Walk cycles, station design |
| **SNES Final Fantasy VI menus** | Three-layer panel borders, cornered headers |

---

## 3. Color system

All colors specified in `#RRGGBB`. Token names use a `--cth-<category>-<weight>` pattern (CSS variables) and a parallel TypeScript `tokens.colors.<category>.<weight>` (objects).

### 3.1 Base (panels, floors, surfaces)

| Token | Hex | Use |
|---|---|---|
| `cream-50` | `#FFFDF5` | Lightest highlight, dialog box innermost |
| `cream-100` | `#FFF8E7` | Default panel fill |
| `cream-200` | `#F4E9C7` | Inset / alt row |
| `cream-300` | `#E8D9A0` | Disabled fill |
| `paper-100` | `#FCFAF0` | Terminal background |
| `paper-200` | `#F0EAD2` | Subtle panel variant |

### 3.2 Ink (text, outlines)

| Token | Hex | Use |
|---|---|---|
| `ink-900` | `#1A1320` | Body text, outer borders. **Never use `#000`.** |
| `ink-700` | `#3D2E4A` | Secondary text, middle border layer |
| `ink-500` | `#6B5878` | Tertiary text, disabled borders |
| `ink-300` | `#A899B5` | Placeholder, hairline dividers |
| `ink-100` | `#D9CFE0` | Subtle separators |

### 3.3 Agent accents (vibrant, character colors)

Saturated and warm. Each avatar gets one — the strip badge, the agent's chat selection highlight, their nameplate.

| Token | Hex | Mnemonic |
|---|---|---|
| `coral` | `#FF6B6B` | Mario red |
| `coral-light` | `#FFB4B4` | |
| `mint` | `#6BCF7F` | 1UP green |
| `mint-light` | `#B4E5BD` | |
| `sky` | `#4ECDC4` | Wind Waker ocean |
| `sky-light` | `#A8E6E0` | |
| `lemon` | `#FFD93D` | Pikachu |
| `lemon-light` | `#FFEC99` | |
| `lilac` | `#B197FC` | Psychic-type |
| `lilac-light` | `#D6C5FF` | |
| `peach` | `#FFA07A` | Princess Peach |
| `peach-light` | `#FFD0B5` | |

### 3.4 Status (system semantics)

| Token | Hex | Means |
|---|---|---|
| `status-idle` | `#A899B5` | Agent at desk, awaiting |
| `status-thinking` | `#4ECDC4` | Reasoning + en route to a station |
| `status-working` | `#FFD93D` | At a station, using a tool |
| `status-waiting` | `#6C8EF5` | Worker stalled on god or another agent |
| `status-blocked` | `#FF6B6B` | Notification fired, needs user |
| `status-success` | `#6BCF7F` | Just finished |
| `status-ghost` | `#D9CFE0` | Pane closed, fading out |
| `status-compacting` | `#9B7EDE` | Boxing up context (PreCompact/PostCompact) |
| `status-looping` | `#FF9F43` | Circuit breaker armed — runaway |
| `status-typing` | `#E8A33D` | **Not an agent state.** *You* have unsent text on that agent's prompt, which is holding its message queue |

### 3.5 World (the floor itself)

| Token | Hex | Use |
|---|---|---|
| `grass-light` | `#D4EAB0` | Light tile |
| `grass-dark` | `#B5D589` | Dark tile (checkerboard) |
| `wood-light` | `#E5C896` | Room floor light tile |
| `wood-dark` | `#C9A66B` | Room floor dark tile |
| `path` | `#E8D8B0` | Pathways between rooms |
| `wall` | `#8B6F47` | Room walls (3px stroke) |

### 3.6 Gradient bans

No gradients except: vertical 2-stop on title bars (`cream-100` → `cream-200`). That's it. Every other surface is flat.

---

## 4. Typography

Three fonts, all loaded from Google Fonts. **Every text element must declare a font from this set.** No system fonts.

| Role | Family | Why |
|---|---|---|
| **Display** | `Press Start 2P` | NES-iconic, headings only, 8/12/16 px |
| **UI** | `Pixelify Sans` | Modern readable pixel font, body/labels |
| **Mono / terminal** | `VT323` | CRT terminal feel, large x-height |

### 4.1 Type scale (all px integers)

| Token | Size | Line height | Use |
|---|---|---|---|
| `display-lg` | 16 / `Press Start 2P` | 24 | App title, screen titles |
| `display-md` | 12 / `Press Start 2P` | 20 | Section headers, modal titles |
| `display-sm` | 8 / `Press Start 2P` | 12 | Badges, chip labels |
| `body-lg` | 18 / `Pixelify Sans` | 24 | Primary body |
| `body-md` | 16 / `Pixelify Sans` | 20 | Default UI text |
| `body-sm` | 14 / `Pixelify Sans` | 18 | Secondary, captions |
| `mono-md` | 16 / `VT323` | 20 | Terminal stream |
| `mono-sm` | 14 / `VT323` | 18 | Inline log lines, paths |

### 4.2 Weight
All fonts ship in a single weight. **Never bold.** For emphasis: use color (`ink-900` vs `ink-500`) or a chip/badge.

### 4.3 Case
- Display fonts: **TITLE CASE**, never ALL CAPS (Press Start 2P is already loud).
- UI fonts: Sentence case.
- Status badges: lowercase ("working", "thinking", "blocked").

### 4.4 Letter spacing
- Press Start 2P: `0` (already wide enough).
- Pixelify Sans: `0`.
- VT323: `0`.
Never add letter-spacing — it breaks the pixel grid.

---

## 5. Spacing & grid

Base unit: **4 px**. Every margin, padding, gap, position must be a multiple of 4. No exceptions outside sprite-internal art.

| Token | px |
|---|---|
| `space-0` | 0 |
| `space-1` | 4 |
| `space-2` | 8 |
| `space-3` | 12 |
| `space-4` | 16 |
| `space-5` | 24 |
| `space-6` | 32 |
| `space-7` | 48 |
| `space-8` | 64 |

### Layout

- Main window minimum: 1280 × 800.
- Standard gutter: 16 px (`space-4`).
- Panel internal padding: 12 px (`space-3`).
- Floor canvas: dynamically sized, but tile grid is 32 × 32 px (one game tile).

### Pixel snapping

- All `transform: translate(...)` values must be integers.
- `imageRendering: pixelated` on every `<canvas>` and any rendered sprite `<img>`.
- Zoom levels are integer scales (1×, 2×, 3×) — never 1.5×.

---

## 6. Borders & panels

The SNES three-layer border is foundational. Every panel uses it.

### 6.1 Anatomy

```
┌────────────────────────────────┐  ← outer:  ink-900, 2px
│┌──────────────────────────────┐│  ← middle: cream-200, 2px
││┌────────────────────────────┐││  ← inner:  ink-700, 1px
│││                            │││
│││   panel content            │││  ← fill:   cream-100
│││                            │││
││└────────────────────────────┘││
│└──────────────────────────────┘│
└────────────────────────────────┘
```

CSS implementation: nested `box-shadow inset` rather than nested DOM. No `border-radius`. Total border weight: 5 px on each side.

### 6.2 Panel variants

| Variant | Outer | Middle | Inner | Fill | Use |
|---|---|---|---|---|---|
| `panel/default` | `ink-900` | `cream-200` | `ink-700` | `cream-100` | Standard |
| `panel/inset` | `ink-700` | `cream-100` | `ink-500` | `cream-200` | Recessed area |
| `panel/active` | `ink-900` | accent | `ink-700` | `cream-100` | Selected agent, focused input |
| `panel/terminal` | `ink-900` | `ink-700` | `ink-500` | `paper-100` | Terminal background |
| `panel/dialog` | `ink-900` | `cream-200` | `ink-700` | `cream-50` | Modals, notifications |

### 6.3 Corner cuts

Optional. Adds an 8-bit "rounded corner" feel by clipping 2 px squares from each corner. Implementation: SVG `clip-path` or four absolute-positioned 2 × 2 squares matching the parent background. Reserved for: dialogs, the main app frame.

### 6.4 Drop shadow

The only shadow allowed is a **hard offset**: 4 px right, 4 px down, `ink-900` at 25% opacity. No blur. Used on: modals, toasts, dragging avatars.

```css
filter: drop-shadow(4px 4px 0 rgba(26, 19, 32, 0.25));
```

Or as a sibling block element absolutely positioned 4 px offset.

---

## 7. Components

Every component is spec'd by its anatomy, states, props, and example.

### 7.1 `<PixelPanel>`

Foundational container.

```
Props:
  variant    'default' | 'inset' | 'active' | 'terminal' | 'dialog'
  title?     string        — renders titlebar
  accent?    AccentColor   — applies to title bar + middle border if active
  children   ReactNode

States:
  default   — as drawn
  hover     — no change (panels don't hover; only buttons do)
  focused   — middle border becomes accent, 1px wider
```

### 7.2 `<PixelButton>`

3D pressable. Defaults to chunky.

```
Props:
  variant   'primary' | 'secondary' | 'ghost' | 'destructive'
  size      'sm' (24h) | 'md' (32h) | 'lg' (40h)
  icon?     IconName
  children  ReactNode

States:
  default   — top edge bright, bottom edge dark
  hover     — fill becomes light variant of variant color
  active    — translate(0, 2px), bottom edge disappears (pressed)
  disabled  — fill = cream-300, ink-500 text, no press affordance
  focus     — 2px ink-900 outline at +2px offset

Primary: fill = ink-900, text = cream-50
Secondary: fill = cream-100, text = ink-900, border = ink-900
Ghost: no fill, border = ink-500, text = ink-700
Destructive: fill = coral, text = cream-50
```

### 7.3 `<PixelBadge>` (status chip)

```
Props:
  status    'idle' | 'thinking' | 'working' | 'waiting' | 'blocked' | 'success'
            | 'ghost' | 'compacting' | 'looping' | 'typing'
  label     string
  icon?     IconName

Anatomy: 8 px tall pixel dot + space-1 + lowercase Pixelify Sans 14 px.
Color: status palette. Background: status-color at 20% opacity over cream-100.
```

Labels are not the token names — they read from the *user's* side. `blocked` shows
"needs you" (reserved for the god agent waiting on you), `waiting` stays "waiting"
(honest about the worker being stalled on another agent), and `typing` shows
**"your draft"** — it is your text on the prompt, not the agent's, and it is why
that agent's message queue is not draining. See
[`docs/message-queue.md`](./docs/message-queue.md).

### 7.4 `<AgentCard>` (bottom strip)

```
Width: 200 px. Height: 80 px. Panel variant: default.
Top row: sprite portrait (32 × 32) + name (body-md) + status badge.
Mid row: current project name (body-sm, ink-500), current tool/action.
Bottom row: 8-segment progress dots (filled = work units in current step).

Selected state: panel/active variant with agent's accent color.
```

### 7.5 `<CommandBar>`

```
Anatomy: PixelPanel inset variant.
Contains:
  - prompt prefix "> " (mono-md, agent's accent)
  - text input (mono-md, no border)
  - send button (primary, size-md, icon: arrow)
  - mode tabs above: [Free] [/skill] [Quick]

States:
  - typing       — caret = 2px wide block, blinks 500ms
  - busy         — input border tints lemon (agent is working)
  - blocked      — input border tints coral with helper text
```

### 7.6 `<TerminalView>`

```
PixelPanel terminal variant.
xterm.js with theme:
  background = paper-100
  foreground = ink-900
  cursor = coral
  selection = lemon-light
  ansi colors: see §11
Font: VT323 16 px.
Top edge: 2px dashed ink-300 line, label "live · pipe-pane" in mono-sm.
```

### 7.7 `<Toast>` (notification)

```
PixelPanel dialog variant, 320 px wide.
Top: 12 px stripe of agent's accent color.
Body: avatar portrait (24 × 24) + message (body-md, max 3 lines).
Actions row: two buttons max.
Drop shadow (hard 4/4).
Slide in from top-right, snap (no easing past first frame).
Auto-dismiss only for non-blocking. Blocking notifications wait for user.
```

### 7.8 `<SettingsModal>` / `<EditAgentModal>` / `<AddAgentModal>`

```
Configuration is a modal, not a drawer: it is a decision you finish, not a panel you live beside.
PixelPanel dialog variant, centered, hard 4/4 shadow, backdrop ink-900 @ 60% with NO blur.
Sections are labelled and hinted (`<Section label hint>`), rows are label + control (`<Row>`).
Add agent is the only stepped one: Identity → Workspace → Engine → Briefing, with a rail down
the left. A step opens once every step before it is answered — the rail and the Next button
read the same answer (`addAgentGate.ts`), so they can never disagree.
Save lives in the footer, and its confirmation says what happened, not that it was attempted.
```

### 7.9 `<Modal>`

```
PixelPanel dialog variant.
Backdrop: ink-900 @ 60% opacity. NO blur.
Position: centered. Snap-in (200 ms ease-out scale 0.92 → 1.0).
Always has close button top-right and at least one action button bottom-right.
```

---

## 8. Faces

Faces are drawn in code. `scene/office/portraitArt.ts` paints an explicit recipe — skin → clothing
→ face → facial hair → hairstyle → headwear — rather than recolouring someone else's sprite sheet,
which is what gives real control over silhouette.

### 8.1 Two sizes, one recipe

| Use | Canvas | Where |
|---|---|---|
| Portrait (cards, picker, bubbles) | 18 × 28 | `PORTRAIT_W/H` |
| Scene sprite (walking on the floor) | 18 × 32 | `SCENE_W/H` — the portrait plus legs |

The scene sprite reuses the portrait's exact head, face and clothing, so an agent on the floor
matches its card. Characters render at `CHAR_SCALE` 1.08 so heads read clearly at floor zoom.

### 8.2 Where a face comes from

Three sources, resolved in order:

1. Atlas's own recipe.
2. The thirty in `avatarLibrary.ts` — six each from Naruto, One Piece, Attack on Titan, Fairy Tail
   and Slime. A library face belongs to one agent at a time.
3. Anything else: the name is hashed into a generated recipe, so an agent always has a face.

`agent.character` persists the cast key, not the drawing. `michael` is the god agent's key and
stays that way whatever the orchestrator is renamed to — see the note at the top of `cast.ts`.

### 8.3 Animation

`ANIM_FRAMES` in `CharacterSprite.ts`:

| State | Frames |
|---|---|
| `walk` | 0, 1, 2, 1 |
| `type` | 0, 1, 2, 1 |
| `read` | 0, 1, 2, 1 |
| `idle` | 0 |

Four directions; `left` is `right` mirrored on x. Walking speed is 48 px/sec on a 16 px tile grid,
with A* pathfinding (`pathfinding.ts`).

### 8.4 Accent colour

Each agent carries one accent from §3.3 — the strip badge, the chat selection highlight, the
nameplate. There are twelve, so a large crew shares.

---

## 9. The floor

The floor is a **Tiled map**, not a set of hand-placed structures. `TiledMapRenderer.ts` draws it
and `themeRegistry.ts` holds the themes: `office` and `brooklyn99`, each a `.tmj` map in
`assets/maps/` plus its tilesets.

### 9.1 What is on it

| Element | Behaviour |
|---|---|
| **Desk** | One per seated agent, assigned by `SeatPool.ts` |
| **Monitor** | `DeskScreen.ts` overlays the lit variant of the desk PC while its agent is seated, with scrolling lines and a blinking cursor. Hidden, the map's switched-off art shows through |
| **Break spots** | Idle agents walk off and trade one-liners about builds, retries and tokens (`cafeteriaLines.ts`) — solo quips and two-beat pair exchanges |
| **Thought bubble** | `ThoughtBubble.ts` — a cream cloud with what the agent said, prefixed by an icon for the tool it called |

### 9.2 Camera

`Camera.ts` follows the selected agent and clamps to the map bounds. The floor is a real
continuously-animating scene, which is why it is Pixi and the rest of the app is not.
## 10. Iconography

16 × 16 px pixel icons. 2 colors max (ink + accent). All icons hand-crafted.

### 10.1 Required icon set

| Name | Use | Colors |
|---|---|---|
| `gear` | Configure | ink-900 + ink-300 |
| `plus` | Add | ink-900 + mint |
| `x` | Close / cancel | ink-900 + coral |
| `check` | Confirm | ink-900 + mint |
| `arrow-right` | Send / next | ink-900 + sky |
| `pause` | Stop / pause | ink-900 + lemon |
| `play` | Resume | ink-900 + mint |
| `bell` | Notification | ink-900 + peach |
| `folder` | Project | ink-900 + lemon |
| `terminal` | Terminal | ink-900 + mint |
| `code` | File / code | ink-900 + sky |
| `web` | Web tool | ink-900 + lilac |
| `mcp` | MCP server | ink-900 + lilac |
| `sparkle` | Success | ink-900 + lemon |

### 10.2 Implementation

Icons live as inline SVG `<svg viewBox="0 0 16 16">` components, all paths drawn at integer coordinates. `image-rendering: pixelated`. Scale via `transform: scale(N)` integer only.

---

## 11. Terminal (xterm.js) theme

```ts
{
  background: '#FCFAF0',
  foreground: '#1A1320',
  cursor: '#FF6B6B',
  cursorAccent: '#FCFAF0',
  selectionBackground: '#FFEC99',
  selectionForeground: '#1A1320',

  black:        '#1A1320',
  red:          '#FF6B6B',
  green:        '#6BCF7F',
  yellow:       '#FFD93D',
  blue:         '#4ECDC4',  // we use sky as our blue
  magenta:      '#B197FC',
  cyan:         '#4ECDC4',
  white:        '#FFF8E7',
  brightBlack:  '#6B5878',
  brightRed:    '#FFB4B4',
  brightGreen:  '#B4E5BD',
  brightYellow: '#FFEC99',
  brightBlue:   '#A8E6E0',
  brightMagenta:'#D6C5FF',
  brightCyan:   '#A8E6E0',
  brightWhite:  '#FFFDF5',
}
```

Font: `VT323`, 16 px, line-height 1.

---

## 12. Motion

### 12.1 Durations

| Type | ms | Easing |
|---|---|---|
| UI snap-in (modal, drawer) | 200 | cubic-bezier(.2, .8, .2, 1) |
| Hover state | 0 | none — instant |
| Button press | 0 | none — instant translate |
| Toast slide | 200 | cubic-bezier(.2, .8, .2, 1) |
| Sprite walk | continuous | sin-wave bob @ 8 fps |
| Sprite frame | 125 ms each | step (no easing) |
| Avatar teleport (room change) | 400 | step — fade-out, move, fade-in |

### 12.2 Forbidden motion
- No spring physics on UI.
- No bouncing.
- No parallax.
- No ambient idle animations on static UI panels.

Animation belongs to the **game layer** (avatars, stations, particles). The UI layer is largely still.

### 12.3 Particles

Used sparingly:

- **Sparkle** on task complete: 4 pixel stars burst out from desk, 250 ms total
- **Dust** when an avatar lands at a station: 3 pixel dots arc out, gravity-influenced, 300 ms
- **Pulse** on mailbox flag: every 800 ms, 1-frame `+1 px scale` on the flag

---

## 13. Sound (deferred — spec only)

8-bit SFX in this order of priority:

1. `agent-arrives.wav` — bloop on station arrival
2. `task-complete.wav` — 3-note major-third jingle
3. `notification.wav` — single chime
4. `button-press.wav` — soft click
5. `error.wav` — descending buzz
6. `mailbox-flag.wav` — flag-up clack

All sounds capped at 200 ms, mono, 22 kHz. Off by default; user can enable in preferences.

---

## 14. Voice & copy

### Tone
Friendly, brief, factual. Imagine an Animal Crossing villager who happens to be technically literate.

### Examples (do / don't)

| Don't | Do |
|---|---|
| "Agent is currently performing a Read operation on SPEC.md" | "Ada is reading SPEC.md" |
| "An error has occurred" | "Ada hit a snag" |
| "The agent has completed the task" | "Ada is done!" |
| "Permission denied" | "Ada needs your permission" |
| "Confirm operation" | "Sure?" |
| "Loading..." | "One sec..." |

### Always
- Use the avatar's name. Never "the agent."
- Keep system feedback under 12 words.
- Use second person to the user ("Ada needs you to take a look").

### Never
- Emojis in copy. We have icons.
- Exclamation marks except for completions and notifications.
- Apostrophe-free contractions ("dont"). Use proper punctuation.

---

## 15. Layout templates

### 15.1 Main view

```
┌─────────────────────── App title bar (display-md) ──────────────────────┐
├──────────────────────────────────────────┬─────────────────────────────┤
│                                          │                             │
│           Floor canvas (Pixi)            │     Selected agent panel    │
│           — fills remaining width        │     — 360 px wide           │
│                                          │     - portrait + name       │
│                                          │     - terminal view         │
│                                          │     - command bar           │
│                                          │     - status badge          │
│                                          │                             │
├──────────────────────────────────────────┴─────────────────────────────┤
│  Agent strip — horizontal scroll of <AgentCard>s, 80 px tall            │
└─────────────────────────────────────────────────────────────────────────┘
```

Min window: 1280 × 800. Right panel collapses below 1024 to bottom drawer.

### 15.2 Z-index layers

| Layer | z | Contents |
|---|---|---|
| 0 | floor canvas |
| 1 | UI chrome (panels, strip) |
| 2 | drawer / sidebar |
| 3 | toasts |
| 4 | modals |
| 5 | tooltips |

---

## 16. Token files

All tokens live in two synced files:

- `src/renderer/design/tokens.css` — CSS custom properties for use in any styled element.
- `src/renderer/design/tokens.ts` — TypeScript objects for use in Pixi.js and inline styles.

Both files import from a single source-of-truth `tokens.json` at build time (future work). For MVP, hand-keep them in sync.

---

## 17. Accessibility notes

- Pixel fonts are inherently harder to read at small sizes — never go below 14 px for any user-facing text.
- Color contrast: every text/background pair in this doc passes WCAG AA (4.5:1) — verify when adding new pairs.
- Status is communicated via **color + icon + position** (avatar location). Never color alone.
- Keyboard navigation: every interactive UI element reachable via Tab; focus state is the 2 px outline (§7.2).
- Reduced motion: when `prefers-reduced-motion: reduce`, sprite bob disabled and walks become instant teleports. Particles disabled.

---

## 18. Open design decisions (revisit)

1. Whether to commission custom sprite art vs continuing programmatic sprites long-term.
2. Dark mode: not in v1 — pixel art with cream backgrounds is the brand. Revisit if requested.
3. Resizable rooms vs fixed grid — currently spec'd fixed; may want to drag-resize rooms.
4. Whether to add ambient floor decorations (flowers, rugs) — yes, low-priority polish.
5. Custom mouse cursor (pixel-style hand) — defer.
