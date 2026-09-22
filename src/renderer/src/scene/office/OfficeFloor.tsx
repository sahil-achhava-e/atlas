import { useEffect, useRef, useState } from 'react';
import { shouldPlayArrivals, BOOT_ID_KEY } from '@shared/floorArrival';
import { useTranslation } from 'react-i18next';
import { Application, Container, Graphics, Ticker, Texture } from 'pixi.js';
// PixiJS uses new Function() internally, blocked by Electron CSP — this patches it.
import 'pixi.js/unsafe-eval';
import { resolvePalette, paletteIsNoop, swapTable, applySwap } from './tilePalette';
import { LEAD_SEAT_NAMES, nextLeadSlot } from './leadSeats';
import { useStore, type Agent } from '@/store/store';
import { TiledMapRenderer } from './TiledMapRenderer';
import { nearestReachable } from './pathfinding';
import { Camera } from './Camera';
import { Character, paintCup } from './Character';
import { DeskScreen } from './DeskScreen';
import { MessageEnvelope, type MessageAct } from './MessageEnvelope';
import { hexToNumber, DEFAULT_CHARACTER } from './cast';
import { LIBRARY_BY_ID } from './avatarLibrary';

/** The selection glow's fallback colour, for an agent with no accent set.
 *  A cast member carries a signature `shirt`; a library face carries its
 *  garment colour as `recipe.c1`; anything else gets the default cast shirt. */
function glowFor(charName: string, member?: { shirt: string }): number {
  if (member) return hexToNumber(member.shirt);
  const c1 = LIBRARY_BY_ID[charName]?.recipe?.c1;
  if (Array.isArray(c1) && c1.length >= 3) return (c1[0] << 16) | (c1[1] << 8) | c1[2];
  return hexToNumber(DEFAULT_ACCENT_HEX);
}
import { pickSoloLine, pickExchange, pickAboutPerson, type BreakSpot } from './cafeteriaLines';
import { isLaughBeat } from '@shared/gossipPool';
import { normalizeStatus } from '@shared/taskStatus';
import { colors, accentNumber, DEFAULT_ACCENT_HEX } from '@/design/tokens';
import { loadTheme, resolveThemeMap, themeTilesetUrls } from './themeLoader';
import {
  installContextLossRecovery, planInitFailure, DEFAULT_MAX_INIT_RETRIES
} from './glRecovery';
import type { Tile, Facing, ErrandKind, ErrandSpot } from './themeRegistry';

// The map, tileset atlases, desk-claim order, errand spots, coffee-economy
// tiles, prop anchors, monitor gids and palette all come from the active
// ThemeConfig now (see themeRegistry.ts / themeLoader.ts). Phase 0 ships the
// existing office unchanged as `theme: 'office'`.

/** A cafeteria break in progress for one agent — set by the coffee-break
 *  director, cleared when the agent leaves or gets pulled back to work. */
interface CafeChat {
  lines: readonly string[];        // alternating beats: even = initiator, odd = partner
  partnerId: string;
  idx: number;                     // next beat to speak
  beat: number;                    // seconds until the next beat
}

interface CafeBreak {
  spotIdx: number;                 // index into cafeSpots
  phase: 'walking' | 'lingering';
  timer: number;                   // walking → elapsed watchdog; lingering → countdown
  quipTimer: number;               // until the next solo quip swap
  /** Seconds until the next attempt to start a conversation. People in a break
   *  room together talk; this is what stops four of them muttering alone. */
  chatTry?: number;
  chat?: CafeChat;                 // set on the conversation's initiator
  chattingWith?: string;           // set on the partner: stays put & stays quiet
}

/** An idle errand in progress for one agent. */
interface ErrandRun {
  phase: 'walking' | 'doing';
  timer: number;
  idx: number; // into ERRAND_SPOTS
}

/** A standup in the boardroom: everyone Atlas just briefed, around the table. */
interface Meeting {
  phase: 'walking' | 'seated';
  timer: number;
  tile: Tile;
}

/** One leg of the coffee economy: fetch a clean mug from the sideboard, brew
 *  at the counter machine, (later) wash at the sink and rack the mug again. */
interface CoffeeRun {
  phase: 'toTray' | 'taking' | 'toMachine' | 'brewing' | 'toSink' | 'washing' | 'toTrayBack' | 'placing';
  timer: number;
}


interface Runtime {
  character: Character;
  seatIndex: number | null;
  waitTile: Tile;
  charName: string;
  prevStatus?: string;
  prevAction?: string;
  prevCarrying?: string;
  prevPrompt?: string;
  brk?: CafeBreak;
  /** This desk's monitor overlay — lit while its agent is seated. */
  screen?: DeskScreen;
  /** Walking a fresh coffee from the break room home to the desk. */
  cupCarryHome?: boolean;
  err?: ErrandRun;
  run?: CoffeeRun;
  mtg?: Meeting;
  /** Atlas is mid walk-in, routing via his own door. applyState must not call
   *  sitAtDesk while this is set: that re-paths him straight to the desk, which
   *  is one step shorter THROUGH THE BOARDROOM and undoes the waypoint. */
  walkingIn?: boolean;
  /** Everyone walks in, goes to their own desk and turns the screen on before
   *  they are allowed to do anything else. While this is in the future the idle
   *  directors leave the agent alone — otherwise a newly arrived agent was sent
   *  wandering (or to the café) without ever having sat down. */
  settleUntil?: number;
  /** While this is in the future the arrival greeting owns the bubble — the idle
   *  branch fires within a frame of spawning and used to erase the hello. */
  greetUntil?: number;
  /** Standing at the boss's desk for a quick word. */
  visit?: { timer: number; tile: Tile };
  /** When the current busy stretch (working/thinking/compacting) began. */
  busySince?: number;
}

/** Only a busy stretch at least this long earns a cheer on finishing. Short
 *  turns (an inbox nudge, a heartbeat reply) end quietly — otherwise idle
 *  agents "celebrate" every few minutes over nothing, and the "done!" bubble
 *  reads like real work completed when none did. */
const CHEER_MIN_BUSY_MS = 60_000;

/** What an avatar mutters per errand, picked at random. i18n keys into
 *  `office.errand.*`. */
/** What gets muttered around the boardroom table. i18n keys into `office.meeting.*`. */
const MEETING_LINES: readonly string[] = [
  'office.meeting.0', 'office.meeting.1', 'office.meeting.2', 'office.meeting.3'
];

/** Said by an agent with nothing on. i18n keys into `office.free.*`. */
const FREE_LINES: readonly string[] = [
  'office.free.0', 'office.free.1', 'office.free.2', 'office.free.3'
];

/** Said on walking through the office door. i18n keys into `office.arrive.*`. */
const ARRIVE_LINES: readonly string[] = [
  'office.arrive.0', 'office.arrive.1', 'office.arrive.2', 'office.arrive.3'
];

/** Muttered while standing at the boss's desk. i18n keys into `office.visit.*`. */
const VISIT_LINES: readonly string[] = [
  'office.visit.0', 'office.visit.1', 'office.visit.2', 'office.visit.3'
];

const ERRAND_THOUGHTS: Record<ErrandKind, readonly string[]> = {
  water:     ['office.errand.water.0', 'office.errand.water.1', 'office.errand.water.2'],
  window:    ['office.errand.window.0', 'office.errand.window.1', 'office.errand.window.2'],
  dispenser: ['office.errand.dispenser.0', 'office.errand.dispenser.1', 'office.errand.dispenser.2'],
  fridge:    ['office.errand.fridge.0', 'office.errand.fridge.1', 'office.errand.fridge.2'],
  shelf:     ['office.errand.shelf.0', 'office.errand.shelf.1', 'office.errand.shelf.2'],
  bin:       ['office.errand.bin.0', 'office.errand.bin.1', 'office.errand.bin.2'],
  smoke:     ['office.errand.smoke.0', 'office.errand.smoke.1', 'office.errand.smoke.2', 'office.errand.smoke.3']
};

/** What workers blurt out when the boss walks by — performative excellence.
 *  `{{done}}` interpolates that worker's REAL done-task count. */
const SUCK_UP_KEYS = [
  'office.suckUp.0',
  'office.suckUp.1',
  'office.suckUp.2',
  'office.suckUp.3',
  'office.suckUp.4',
  'office.suckUp.5',
  'office.suckUp.6'
] as const;

/** What they actually say once he's out of earshot. */
const GOSSIP_KEYS = [
  'office.gossip.0',
  'office.gossip.1',
  'office.gossip.2',
  'office.gossip.3',
  'office.gossip.4',
  'office.gossip.5',
  'office.gossip.6'
] as const;

/** Lines an avatar throws over its shoulder right after finishing a task. */
const CHEER_KEYS = [
  'office.cheer.0',
  'office.cheer.1',
  'office.cheer.2',
  'office.cheer.3',
  'office.cheer.4',
  'office.cheer.5',
  'office.cheer.6'
] as const;

/** Load a texture via an <img> element. Unlike Pixi's Assets.load(), this
 *  handles extension-less data: URLs (Vite inlines small assets like the a5
 *  tileset as base64), which the Assets resolver fails to type-detect. */
function loadTexture(url: string, swap?: Map<number, [number, number, number]>): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // No palette: hand Pixi the decoded image as before. The canvas pass below
      // is skipped entirely, so the original art costs exactly what it always did.
      const tex = !swap || swap.size === 0 ? Texture.from(img) : Texture.from(recolour(img, swap));
      tex.source.scaleMode = 'nearest';
      resolve(tex);
    };
    img.onerror = () => reject(new Error('failed to load ' + url.slice(0, 40)));
    img.src = url;
  });
}

/** Repaint a tileset through a canvas. Falls back to the untouched image if the
 *  2D context is unavailable (it is not, in practice) — a floor with the original
 *  colours beats no floor. */
function recolour(img: HTMLImageElement, swap: Map<number, [number, number, number]>): HTMLCanvasElement | HTMLImageElement {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) return img;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applySwap(data.data, swap);
    ctx.putImageData(data, 0, 0);
    return canvas;
  } catch {
    return img;
  }
}

/** What the agent is doing right now, for the thought cloud. Prefer the live
 *  `action` (e.g. "edit App.tsx", "bash npm test"), fall back to the prompt we
 *  gave it, then to a caller-supplied generic. Returns '' for the working state
 *  with nothing concrete yet — the bubble renders an animated "…" for that. */
/** Actions that are bookkeeping, not activity, and must never reach a bubble.
 *  'starting up' is written on every spawn and restore; 'idle' and 'waiting for
 *  work' are written whenever an agent goes quiet. Narrating either one puts a word over an
 *  agent's head that says nothing — the floor already shows idleness by the
 *  agent standing up and wandering off. */
const BOOT_ACTIONS = new Set(['starting up', 'idle', 'waiting for work']);

function liveActivity(agent: Agent, fallback = ''): string {
  const action = (agent.action || '').trim();
  if (action && !BOOT_ACTIONS.has(action.toLowerCase())) return action;
  return firstWords(agent.lastPrompt) || fallback;
}

/** First few words of the last user prompt, for the desk card. */
function firstWords(prompt: string | undefined, maxWords = 6, maxChars = 42): string {
  if (!prompt) return '';
  const words = prompt.trim().split(/\s+/);
  let out = words.slice(0, maxWords).join(' ');
  const truncatedWords = words.length > maxWords;
  if (out.length > maxChars) out = out.slice(0, maxChars).trimEnd();
  else if (truncatedWords) out += '…';
  return out;
}

/** The colour behind the map: the letterboxing you see when the floor does not
 *  fill its box.
 *
 *  The theme bundle names a token for this, but it resolves through the STATIC
 *  JS mirror of the design tokens, so it is frozen at the light theme's value
 *  and stays a near-black slab in every theme. Worse, the token it names is
 *  `ink[900]`, which is the TEXT colour: in dark mode that flips to off-white,
 *  so the "correct" value would have been a white surround.
 *
 *  Read the app's own ground from CSS at call time instead. That follows the
 *  live theme, and falls back to the bundle's value if the variable is missing.
 */
function canvasClearColor(fallback: number): number {
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--cth-cream-50').trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(raw);
    if (m) return parseInt(m[1], 16);
  } catch { /* fall through */ }
  return hexNum(fallback);
}

export function OfficeFloor() {
  const { t, i18n } = useTranslation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const mountIdRef = useRef(0);
  // Bumped when the WebGL context is evicted; a dep of the effect below, so the
  // whole scene is torn down and rebuilt through the existing mount path rather
  // than through a second, parallel recovery routine.
  const [glGeneration, setGlGeneration] = useState(0);
  // Retries spent on an init that could not GET a context (see glRecovery.ts).
  // A ref, not state: the budget has to survive the rebuilds it schedules, which
  // re-run the effect below and would reset anything scoped to it.
  const initRetriesRef = useRef(0);
  // The active office theme (store mirror of config.officeTheme). Changing it
  // tears down and rebuilds the whole scene on the new map/cast (see deps below).
  const officeTheme = useStore((s) => s.officeTheme);
  // Which colours the office is painted in (store mirror of config.tilePalette).
  // 'original' swaps nothing, so it is both the default and the way back.
  const tilePalette = useStore((s) => s.tilePalette);

  // Is the floor actually on screen? A fullscreen terminal or file editor covers
  // it completely, and a hidden window shows nothing at all — but the Pixi ticker
  // went on running the whole scene regardless: every character, thought cloud,
  // coffee run and envelope animating, and the renderer drawing every frame, into
  // pixels nobody can see. On a floor of twenty agents that is the app's single
  // largest continuous cost, and users who live in the fullscreen terminal (the
  // normal way to work with one agent) paid it 100% of the time.
  //
  // Stop the ticker instead of unmounting: the WebGL context, textures and the
  // whole scene graph stay alive, so coming back out of fullscreen is instant
  // rather than a full theme reload.
  //
  // A paused floor resumes where it left off. Two things make that true, and it is
  // worth being precise because the obvious claim — "nothing here reads wall-clock
  // time" — is FALSE: Date.now() is read for the aura/coffee timers and for the
  // busy/cheer thresholds. The first sits inside onTick, so a stopped ticker freezes
  // it along with everything else. The second runs in applyState, a store
  // subscription that keeps firing while paused — but it only mutates sprite state
  // that is redrawn on resume, so the worst case is a cosmetic cheer reflecting
  // genuinely-elapsed busy time, invisible while hidden anyway.
  //
  // The frame delta is safe by construction: Pixi clamps elapsedMS to minFPS on
  // start(), so a floor paused for an hour advances a few frames on resume rather
  // than teleporting every character across the map.
  const fullscreenAgentId = useStore((s) => s.fullscreenAgentId);
  const ideOpen = useStore((s) => s.ideOpen);
  const [docHidden, setDocHidden] = useState(() => document.hidden);
  useEffect(() => {
    const onVis = () => setDocHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const paused = !!fullscreenAgentId || ideOpen || docHidden;
  // Read inside init(), which finishes asynchronously and would otherwise start a
  // ticker the effect below had already been asked to stop.
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
    const ticker = appRef.current?.ticker;
    if (!ticker) return; // app.init() hasn't created it yet — init() applies it
    if (paused) ticker.stop(); else ticker.start();
  }, [paused]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);

    const mountId = ++mountIdRef.current;
    const app = new Application();
    appRef.current = app;

      // A RELOAD IS NOT A MORNING. The agents never left — their processes have
      // been running the whole time — so walking them in again says something
      // untrue, and costs ten seconds before the floor is usable. Same boot id
      // as this browser saw last means the same main process: a reload.
      //
      // Read SYNCHRONOUSLY, before a single character is placed: an async answer
      // arrives after the first avatars are already walking, which is exactly
      // the frame this decides. See shared/floorArrival.ts.
      const playArrivals = ((): boolean => {
        const bootId = window.cth.bootIdSync?.() ?? undefined;
        let seen: string | null = null;
        try { seen = window.localStorage.getItem(BOOT_ID_KEY); } catch { /* private window */ }
        if (bootId) { try { window.localStorage.setItem(BOOT_ID_KEY, bootId); } catch { /* ignore */ } }
        return shouldPlayArrivals(bootId ?? undefined, seen);
      })();

    const runtimes = new Map<string, Runtime>();
    const seatClaims = new Set<number>();
    // In-flight message envelopes (sender desk → recipient desk). Capped so a
    // broadcast doesn't bury the floor in paper.
    const envelopes: MessageEnvelope[] = [];
    const MAX_ENVELOPES = 16;

    const init = async () => {
      // Load the active theme bundle (falls back to 'office' on a bad/absent bundle).
      const theme = await loadTheme(officeTheme);
      const palette = resolvePalette(tilePalette);
      const swap = paletteIsNoop(palette) ? undefined : swapTable(palette);
      await app.init({
        // A repainted room needs its surround repainted too, or the floor reads as
        // a picture pasted onto a cream page.
        background: palette.background ?? canvasClearColor(theme.palette.background),
        antialias: false,
        roundPixels: true,
        // resolution: 1 let the OS/browser upscale the canvas on scaled and
        // HiDPI displays (125–150% is the Windows laptop default), blurring
        // everything — worst of all the bubble text, which is small to begin
        // with. Render at the real device pixel density instead, floored at 2
        // so the half-scale-supersampled bubble text stays legible even at
        // 100% scaling. autoDensity keeps the canvas CSS size in logical px.
        resolution: Math.max(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        width: host.clientWidth || 800,
        height: host.clientHeight || 600,
      });
      if (mountIdRef.current !== mountId) { safeDestroy(app); return; }
      while (host.firstChild) host.removeChild(host.firstChild);
      host.appendChild(app.canvas);

      // This canvas holds the OLDEST WebGL context in the process (it is built at
      // startup), so it is the one Chromium evicts once enough xterm terminals —
      // each of which takes a context via @xterm/addon-webgl — are open. Pixi
      // reports nothing when that happens: the floor just goes blank forever.
      // Rebuild instead. See glRecovery.ts.
      (app as any).__glRecovery = installContextLossRecovery(app.canvas, {
        onRebuild: () => { if (mountIdRef.current === mountId) setGlGeneration((n) => n + 1); },
        onGiveUp: () => {
          if (mountIdRef.current !== mountId) return;
          host.appendChild(floorNote(t('office.gpuError')));
        }
      });

      // Load tilesets in theme order (texture[i] lines up with map tilesets[i]).
      const tilesetTextures = await Promise.all(
        themeTilesetUrls(theme).map((u) => loadTexture(u, swap)),
      );
      if (mountIdRef.current !== mountId) { safeDestroy(app); return; }

      const world = new Container();
      app.stage.addChild(world);

      const mapRenderer = new TiledMapRenderer(resolveThemeMap(theme), tilesetTextures);
      world.addChild(mapRenderer.getContainer());
      const charLayer = mapRenderer.getCharacterContainer();
      const tileCount = mapRenderer.getContainer().children.reduce(
        (n, c) => n + ((c as Container).children?.length ?? 0), 0);
      console.log(`[OfficeFloor] map ${mapRenderer.width}x${mapRenderer.height}, ${tileCount} tile sprites rendered`);

      const camera = new Camera(world);
      camera.setMapSize(mapRenderer.width * mapRenderer.tileSize, mapRenderer.height * mapRenderer.tileSize);
      camera.setViewSize(app.screen.width, app.screen.height);
      camera.fitToScreen();

      // ─── The boss's wall calendar → TRIGGERS ───────────────────────────────
      // A little tear-off month page hangs on the CEO office wall. Clicking it
      // selects Michael (the god) and opens the Command Center's TRIGGERS tab —
      // everything that wakes the hive without you, schedules first among them.
      const calTs = mapRenderer.tileSize;
      const calG = new Graphics();
      calG.eventMode = 'static';
      calG.cursor = 'pointer';
      calG.position.set(theme.anchors.calendar.x * calTs + 8, theme.anchors.calendar.y * calTs + 5);
      calG.zIndex = 3 * calTs;
      calG.on('pointertap', (ev) => {
        ev.stopPropagation();
        const st = useStore.getState();
        const god = st.agents.find((a) => a.isGod);
        if (god) st.select(god.id);
        st.requestCommandCenterTab('triggers');
      });
      // nail + ring binding above a white page with a red month header
      calG.rect(7, -2, 2, 2).fill(0x4a3b52);                  // nail
      calG.rect(0, 0, 16, 20).fill(0x4a3b52);                 // frame/shadow
      calG.rect(1, 1, 14, 18).fill(0xf2ead8);                 // the page
      calG.rect(1, 1, 14, 4).fill(0xc94f4f);                  // month banner
      calG.rect(4, 0, 1, 2).fill(0xd8d3c4);                   // binding rings
      calG.rect(11, 0, 1, 2).fill(0xd8d3c4);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 5; c++) {
          calG.rect(2 + c * 3, 7 + r * 4, 2, 2).fill(0xb8ab90); // day grid
        }
      }
      calG.rect(8, 11, 2, 2).fill(0xc94f4f);                  // today, circled red
      charLayer.addChild(calG);

      // Build the ordered seat list once: PC desks + named desks first, then
      // conference-room chairs as overflow. Each agent claims one and stays there;
      // they never wander off it (except when blocked, or on a coffee break).
      const seatTiles: Tile[] = [];
      const seatSeen = new Set<string>();
      const addSeat = (t?: Tile) => {
        if (!t) return;
        const k = `${t.x},${t.y}`;
        if (seatSeen.has(k)) return;
        seatSeen.add(k);
        seatTiles.push({ x: t.x, y: t.y });
      };
      // Remember which seat index each named spawn point ended up at, so the
      // leaders' offices can be found by name rather than by position.
      const seatNameIndex = new Map<string, number>();
      for (const name of theme.primarySeatNames) {
        const before = seatTiles.length;
        addSeat(mapRenderer.getSpawnPoint(name));
        if (seatTiles.length > before) seatNameIndex.set(name, before);
      }
      const boardroomSeatIdx: number[] = [];
      const addZoneSeats = (zone: string) => {
        const z = mapRenderer.getZone(zone);
        if (!z) return;
        for (let y = z.y; y < z.y + z.height; y++) {
          for (let x = z.x; x < z.x + z.width; x++) {
            if (mapRenderer.isWalkable(x, y)) addSeat({ x, y });
          }
        }
      };
      {
        const before = seatTiles.length;
        addZoneSeats('boardroom');     // conference room overflow
        for (let i = before; i < seatTiles.length; i++) boardroomSeatIdx.push(i);
      }
      // The bottom-right open area is the cafeteria (break room) — see the
      // coffee-break director below. It is deliberately NOT added as overflow
      // desk seating, so the café tables stay free for breaks.

      // Waiting spots near the entrance — where a blocked agent walks to signal
      // it needs the user. Collected as walkable tiles in rings around the door.
      const entrance = mapRenderer.getSpawnPoint('entrance')
        ?? { x: Math.floor(mapRenderer.width / 2), y: mapRenderer.height - 2 };
      const waitTiles: Tile[] = [];
      const waitSeen = new Set<string>();
      for (let radius = 0; radius <= 6 && waitTiles.length < 16; radius++) {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
            const x = entrance.x + dx, y = entrance.y + dy;
            const k = `${x},${y}`;
            if (waitSeen.has(k)) continue;
            if (mapRenderer.isWalkable(x, y)) { waitSeen.add(k); waitTiles.push({ x, y }); }
          }
        }
      }
      if (waitTiles.length === 0) waitTiles.push(entrance);

      // Seat 0 is desk-ceo — "Michael's room" — reserved for the god agent.
      // All other workers claim seats from 1 onward.
      const GOD_SEAT = 0;

      // Atlas's cabin, from the map's own `boss` zone.
      //
      // This used to flood-fill outward from his desk, which quietly did nothing:
      // the room opens east toward the boardroom, so the fill escaped into the
      // whole floor, tripped its guard and returned an empty set — no fence for
      // roamers, no door waypoint for him. A zone drawn in the map cannot leak.
      const godRoomTiles: Set<string> = (() => {
        const out = new Set<string>();
        const z = mapRenderer.getZone('boss');
        if (!z) return out;
        for (let y = z.y; y < z.y + z.height; y++) {
          for (let x = z.x; x < z.x + z.width; x++) {
            if (mapRenderer.isWalkable(x, y)) out.add(`${x},${y}`);
          }
        }
        return out;
      })();

      /** The corridor tile immediately outside Atlas's door — the near approach,
       *  so his walk-in is the short way rather than a tour of the boardroom. */
      const godDoorApproach: Tile | null = (() => {
        if (godRoomTiles.size === 0) return null;
        const inside = [...godRoomTiles].map((k) => {
          const [x, y] = k.split(',').map(Number);
          return { x, y };
        });
        const lowestY = inside.reduce((a, b) => (b.y > a.y ? b : a)).y;
        // Prefer a door onto the MAIN OFFICE (straight down from the room) over
        // the side opening, which is the long way round through the boardroom.
        for (const tl of inside.filter((t) => t.y === lowestY)) {
          const below = { x: tl.x, y: tl.y + 1 };
          if (mapRenderer.isWalkable(below.x, below.y) && !godRoomTiles.has(`${below.x},${below.y}`)) {
            return below;
          }
        }
        return null;
      })();

      // The two side rooms are the leaders' offices: four desks, filled a room at
      // a time (see leadSeats.ts). A leader past the fourth sits at the boardroom
      // table rather than on the open floor — still not a worker's desk.
      const leadSeatIdx: number[] = LEAD_SEAT_NAMES
        .map((name) => seatNameIndex.get(name))
        .filter((i): i is number => typeof i === 'number');
      const leadSlotsTaken = new Set<number>();

      const claimSeat = (agent: Agent): number | null => {
        if (agent.isGod) { seatClaims.add(GOD_SEAT); return GOD_SEAT; }
        // An assigned desk wins — when it is free. Taken (two agents, one desk,
        // or a map that moved) falls through to the normal rules rather than
        // leaving the agent standing in the doorway.
        if (agent.seat) {
          const idx = seatNameIndex.get(agent.seat);
          if (idx !== undefined && idx !== GOD_SEAT && !seatClaims.has(idx)) {
            seatClaims.add(idx);
            if (leadSeatIdx.includes(idx)) leadSlotsTaken.add(leadSeatIdx.indexOf(idx));
            return idx;
          }
        }
        if (agent.isLead) {
          const slot = nextLeadSlot(leadSlotsTaken);
          if (slot !== null && leadSeatIdx[slot] !== undefined && !seatClaims.has(leadSeatIdx[slot])) {
            leadSlotsTaken.add(slot);
            seatClaims.add(leadSeatIdx[slot]);
            return leadSeatIdx[slot];
          }
          // Offices full: the boardroom, which is otherwise standup-only seating.
          for (const i of boardroomSeatIdx) {
            if (!seatClaims.has(i)) { seatClaims.add(i); return i; }
          }
        }
        for (let i = 1; i < seatTiles.length; i++) {
          // A worker never takes a leader's office while it is free.
          if (leadSeatIdx.includes(i) && leadSlotsTaken.size < leadSeatIdx.length) continue;
          if (!seatClaims.has(i)) { seatClaims.add(i); return i; }
        }
        return null;
      };

      // Face a seated agent toward their desk (the adjacent non-walkable
      // furniture). Standard desks put the monitor to the north and the chair to
      // the south, so the agent faces 'up' and we see their back — like a real
      // worker. Only a desk directly to the SOUTH (face 'down') puts furniture in
      // front of them, which is the one case the leg-crop tucks legs under.
      const facingForSeat = (t: Tile): 'up' | 'down' | 'left' | 'right' => {
        if (!mapRenderer.isWalkable(t.x, t.y - 1)) return 'up';
        if (!mapRenderer.isWalkable(t.x, t.y + 1)) return 'down';
        if (!mapRenderer.isWalkable(t.x - 1, t.y)) return 'left';
        if (!mapRenderer.isWalkable(t.x + 1, t.y)) return 'right';
        return 'up'; // open-floor overflow seat — no desk, just face away
      };

      // ─── Cafeteria: purposeful coffee breaks ───────────────────────────────
      // Idle / finished agents occasionally stroll to the break area, sit at a
      // café table (or stand at the coffee machine / vending machine), emit an
      // in-character one-liner, then head back. Two agents at the same table
      // trade a two-beat quip. This is what makes "lingering" feel purposeful.
      interface CafeSpot { tile: Tile; facing: Facing; spot: BreakSpot; seated: boolean; partner: number; }
      const cafeSpots: CafeSpot[] = [];

      // Stand spots face the first adjacent non-walkable tile (the appliance).
      const faceFurniture = (t: Tile): Facing => {
        if (!mapRenderer.isWalkable(t.x + 1, t.y)) return 'right';
        if (!mapRenderer.isWalkable(t.x - 1, t.y)) return 'left';
        if (!mapRenderer.isWalkable(t.x, t.y - 1)) return 'up';
        return 'down';
      };

      // Seats first (so partner indices are stable), then the standing spots.
      for (const name of theme.cafeSeatNames) {
        const p = mapRenderer.getSpawnPoint(name);
        if (p) cafeSpots.push({ tile: p, facing: facingForSeat(p), spot: 'table', seated: true, partner: -1 });
      }
      // Pair the two seats that share a table (same column, two tiles apart).
      for (let i = 0; i < cafeSpots.length; i++) {
        for (let j = i + 1; j < cafeSpots.length; j++) {
          const a = cafeSpots[i].tile, b = cafeSpots[j].tile;
          if (a.x === b.x && Math.abs(a.y - b.y) === 2) { cafeSpots[i].partner = j; cafeSpots[j].partner = i; }
        }
      }
      for (const [name, spot] of theme.cafeStands) {
        const p = mapRenderer.getSpawnPoint(name);
        if (p) cafeSpots.push({ tile: p, facing: faceFurniture(p), spot, seated: false, partner: -1 });
      }
      const cafeTaken: (string | null)[] = new Array(cafeSpots.length).fill(null);

      const agentById = (id: string): Agent | undefined =>
        useStore.getState().agents.find((a) => a.id === id);

      // ─── The coffee economy: sideboard → machine → desk → sink → sideboard ─
      // A finite stock of mugs lives on a sideboard next to the kitchen counter.
      // Brewing requires a mug in hand (a clean one off the rack, or your own
      // brought back from the desk for a lazy refill); washing at the counter
      // sink puts a mug back into the clean stock. If every mug is parked on a
      // desk somewhere, the rack runs dry — and the floor feels it.
      const TRAY_TILE: Tile = theme.coffee.trayTile;        // the sideboard (counter piece)
      const TRAY_STAND: Tile = theme.coffee.trayStand;
      const MACHINE_STAND: Tile = theme.coffee.machineStand; // below the counter machine
      const SINK_TILE: Tile = theme.coffee.sinkTile;        // free counter top, right end
      const SINK_STAND: Tile = theme.coffee.sinkStand;
      const MAX_CUPS = theme.coffee.maxCups;
      let cleanCups = MAX_CUPS;

      const ts0 = mapRenderer.tileSize;
      const trayG = new Graphics();
      trayG.eventMode = 'none';
      trayG.position.set(TRAY_TILE.x * ts0, TRAY_TILE.y * ts0);
      trayG.zIndex = (TRAY_TILE.y + 1) * ts0;
      charLayer.addChild(trayG);
      const drawTray = (): void => {
        trayG.clear();
        const slots: Array<[number, number]> = [[2, 10], [9, 10], [2, 15], [9, 15]];
        for (let i = 0; i < cleanCups && i < slots.length; i++) {
          paintCup(trayG, slots[i][0], slots[i][1]);
        }
      };
      drawTray();

      const sinkG = new Graphics();
      sinkG.eventMode = 'none';
      sinkG.position.set(SINK_TILE.x * ts0, SINK_TILE.y * ts0);
      sinkG.zIndex = (SINK_TILE.y + 1) * ts0;
      charLayer.addChild(sinkG);
      let sinkBusy = 0; // seconds of wash animation left
      const drawSink = (t: number): void => {
        sinkG.clear();
        // steel basin set into the white counter top + a small faucet
        sinkG.rect(2, 6, 12, 8).fill(0xb9c2c9);
        sinkG.rect(3, 7, 10, 6).fill(0x87939d);
        sinkG.rect(7, 9, 2, 2).fill(0x5d676f);          // drain
        sinkG.rect(7, 2, 2, 4).fill(0x6b7680);          // faucet riser
        sinkG.rect(6, 2, 4, 1).fill(0x6b7680);
        if (sinkBusy > 0) {
          // running water + a couple of suds while someone scrubs
          sinkG.rect(7, 6, 2, 4).fill({ color: 0x9fd6f0, alpha: 0.9 });
          for (let i = 0; i < 3; i++) {
            const ph = (t * 1.2 + i / 3) % 1;
            sinkG.circle(4 + i * 4, 7 - ph * 4, 1).fill({ color: 0xffffff, alpha: 0.7 * (1 - ph) });
          }
        }
      };
      drawSink(0);

      const machineG = new Graphics(); // steam over the counter machine while brewing
      machineG.eventMode = 'none';
      machineG.position.set(26 * ts0, 17 * ts0);
      machineG.zIndex = 19 * ts0;
      charLayer.addChild(machineG);
      let machineBusy = 0;
      const drawMachine = (t: number): void => {
        machineG.clear();
        if (machineBusy <= 0) return;
        for (let i = 0; i < 2; i++) {
          const ph = (t * 0.9 + i * 0.5) % 1;
          machineG.rect(6 + i * 3, 2 - Math.round(ph * 5), 1, 1)
            .fill({ color: 0xffffff, alpha: 0.6 * (1 - ph) });
        }
      };

      // One coffee-run leg: walk somewhere, then act. Drives rt.run through its
      // phases; the per-tick engine below advances the timed (acting) phases.
      const finishRun = (rt: Runtime): void => {
        rt.run = undefined;
        const c = rt.character;
        if (c.isCarryingCup()) {
          rt.cupCarryHome = true;   // whatever happened, a held cup goes home
          c.hideThought();
          c.sitAtDesk(false);
        } else {
          c.hideThought();
          c.sitAtDesk(false);   // home, not off into the room
        }
      };

      const startRunLeg = (rt: Runtime, phase: 'toTray' | 'toMachine' | 'toSink' | 'toTrayBack'): void => {
        rt.run = { phase, timer: 0 };
        const c = rt.character;
        const dest = phase === 'toMachine' ? MACHINE_STAND
          : phase === 'toSink' ? SINK_STAND
          : TRAY_STAND;
        c.walkToAndThen(dest, () => {
          if (!rt.run || rt.run.phase !== phase) return;
          c.faceDirection('up'); // every station faces its counter to the north
          if (phase === 'toTray') {
            if (cleanCups <= 0) {
              // Rack ran dry — every mug is parked on someone's desk.
              c.showThought(t('office.mugs.empty'));
              rt.run = { phase: 'placing', timer: -1 }; // brief sulk, then move on
              return;
            }
            cleanCups--;
            drawTray();
            c.setCarryingCup(true);
            rt.run = { phase: 'taking', timer: 0 };
          } else if (phase === 'toMachine') {
            c.showThought(t('office.mugs.brewing'));
            machineBusy = 2.6;
            rt.run = { phase: 'brewing', timer: 0 };
          } else if (phase === 'toSink') {
            c.showThought(t('office.mugs.washing'));
            sinkBusy = 2.4;
            rt.run = { phase: 'washing', timer: 0 };
          } else {
            c.setCarryingCup(false);
            cleanCups = Math.min(MAX_CUPS, cleanCups + 1);
            drawTray();
            rt.run = { phase: 'placing', timer: 0 };
          }
        });
      };

      /** Cancel a coffee run (real work / teardown). A held mug rides along to
       *  the desk via cupCarryHome; the floor fixtures just stop animating. */
      const releaseRun = (rt: Runtime): void => {
        if (!rt.run) return;
        rt.run = undefined;
        if (rt.character.isCarryingCup()) rt.cupCarryHome = true;
      };

      let fxClock = 0;
      const updateCoffeeRuns = (dt: number): void => {
        fxClock += dt;
        if (sinkBusy > 0) { sinkBusy -= dt; drawSink(fxClock); }
        if (machineBusy > 0) { machineBusy -= dt; drawMachine(fxClock); }
        for (const [, rt] of runtimes) {
          const run = rt.run;
          if (!run) continue;
          run.timer += dt;
          const c = rt.character;
          switch (run.phase) {
            case 'toTray':
            case 'toMachine':
            case 'toSink':
            case 'toTrayBack':
              if (run.timer > 20) finishRun(rt); // never arrived — give up
              break;
            case 'taking':
              if (run.timer >= 0.8) startRunLeg(rt, 'toMachine');
              break;
            case 'brewing':
              if (run.timer >= 2.6) finishRun(rt); // cup in hand → heads home
              break;
            case 'washing':
              if (run.timer >= 2.4) startRunLeg(rt, 'toTrayBack');
              break;
            case 'placing':
              if (run.timer >= 0.6) finishRun(rt);
              break;
          }
        }
      };

      /** Distance from the god's avatar in px, or Infinity when he's absent. */
      const godDistance = (px: number, py: number): number => {
        const god = useStore.getState().agents.find((a) => a.isGod);
        const grt = god ? runtimes.get(god.id) : undefined;
        if (!grt) return Infinity;
        const p = grt.character.getPixelPosition();
        return Math.hypot(p.x - px, p.y - py);
      };

      const emitQuip = (id: string, rt: Runtime, spotIdx: number): void => {
        const spot = cafeSpots[spotIdx];
        const character = agentById(id)?.character ?? DEFAULT_CHARACTER;
        const seed = Math.floor(Math.random() * 1e6);
        // Out of the boss's earshot, café talk turns to… the boss. In his
        // presence it's the usual harmless quips (the sucking up happens via
        // the proximity director below).
        const p = rt.character.getPixelPosition();
        if (godDistance(p.x, p.y) > 96 && Math.random() < 0.35) {
          rt.character.showThought(t(GOSSIP_KEYS[Math.floor(Math.random() * GOSSIP_KEYS.length)]));
          return;
        }
        rt.character.showThought(pickSoloLine(character, spot.spot, seed));
      };

      // If the newcomer's table-mate is already lingering (and neither is mid-
      // conversation), start a multi-beat exchange. The newcomer is the
      // initiator and owns the script; the partner just gets marked engaged.
      // Returns true if a chat was started.
      /** Far enough away not to hear it. Roughly the width of the break room,
       *  so someone at the next table counts as present and someone at a desk
       *  across the floor does not. */
      const EARSHOT_PX = 170;

      /** Is this agent out of earshot of a point — or not on the floor at all? */
      const outOfEarshot = (targetId: string, x: number, y: number): boolean => {
        const rt = runtimes.get(targetId);
        if (!rt) return true;                       // not placed: cannot overhear
        const p = rt.character.getPixelPosition();
        return Math.hypot(p.x - x, p.y - y) > EARSHOT_PX;
      };

      /**
       * Somebody to talk about, or nobody.
       *
       * The rule the human asked for, and the only rule a break room needs: you
       * may talk about the orchestrator, your lead, or a colleague — but only
       * while they are not in the room. Everyone within earshot is filtered out
       * before a name is picked, so a conversation cannot start about someone
       * who is standing there.
       *
       * Leans towards the boss and the speaker's own lead, because that is who
       * a break room actually talks about, and falls back to a peer.
       */
      const gossipAbout = (speakerId: string, x: number, y: number): Agent | undefined => {
        const agents = useStore.getState().agents;
        const me = agents.find((a) => a.id === speakerId);
        const away = (a: Agent | undefined): a is Agent =>
          !!a && a.id !== speakerId && outOfEarshot(a.id, x, y);

        const boss = agents.find((a) => a.isGod);
        const lead = me ? agents.find((a) => a.isLead && a.project === me.project && a.id !== me.id) : undefined;
        const seniors = [boss, lead].filter(away);
        // Two in three about the people above you; otherwise a peer.
        if (seniors.length && Math.random() < 0.66) {
          return seniors[Math.floor(Math.random() * seniors.length)];
        }
        const peers = agents.filter((a) => !a.isGod && away(a));
        if (peers.length) return peers[Math.floor(Math.random() * peers.length)];
        return seniors.length ? seniors[0] : undefined;
      };

      /**
       * Exchanges written from the real floor, fetched while people are on a
       * break. Empty until the first batch lands, and empty forever if the
       * model is unavailable — which costs nothing, because the hand-written
       * pool is the fallback on every path below.
       */
      let written: { work: string[][]; about: string[][] } = { work: [], about: [] };
      let gossipAskedAt = 0;
      const refreshWritten = (): void => {
        // Only while somebody is actually out: no floor watcher, no generation.
        if (Date.now() - gossipAskedAt < 60_000) return;
        gossipAskedAt = Date.now();
        void window.cth.gossipPool?.().then((pool) => {
          if (pool && Array.isArray(pool.work) && Array.isArray(pool.about)) written = pool;
        }).catch(() => { /* decoration — never surface this */ });
      };

      const anyOf = <T,>(arr: readonly T[]): T | undefined =>
        arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;

      /** The script two agents will run: work, or somebody who is not there.
       *  Prefers a written exchange when one is available, because it is about
       *  today; falls back to the pool that ships with the app. */
      const chatScript = (speakerId: string, x: number, y: number): readonly string[] => {
        const character = agentById(speakerId)?.character ?? DEFAULT_CHARACTER;
        const seed = Math.floor(Math.random() * 1e6);
        // Work talk is the default; roughly two in five turn to whoever just
        // left the room.
        if (Math.random() < 0.4) {
          const who = gossipAbout(speakerId, x, y);
          if (who) {
            const live = anyOf(written.about);
            if (live) return live.map((line) => line.replace(/\{name\}/g, who.name));
            return pickAboutPerson(who.name, seed);
          }
        }
        return anyOf(written.work) ?? pickExchange(character, seed);
      };

      /** Is a conversation already running in the break room?
       *
       *  FOUR PEOPLE IN A SMALL PANTRY HAVE ONE CONVERSATION, NOT TWO. Two
       *  scripts playing at once put four bubbles in the air over a 2x2 block
       *  of avatars, interleaved beats from two unrelated exchanges, and you
       *  cannot tell who is saying what. One voice at a time, and the room
       *  reads like a comic strip. */
      const roomChatRunning = (): boolean =>
        cafeTaken.some((who) => !!who && !!runtimes.get(who)?.brk?.chat);

      const maybePairChat = (id: string, rt: Runtime, spotIdx: number): boolean => {
        if (!rt.brk) return false;
        if (roomChatRunning()) return false;   // somebody already has the floor
        // ANYONE in the room, not just the other chair at this table. With four
        // spots and two of them standing at machines, the table-mate rule left
        // people drinking coffee in silence next to each other.
        const free = (other: Runtime | undefined): boolean =>
          !!other?.brk && other.brk.phase === 'lingering'
          && !other.brk.chat && !other.brk.chattingWith;
        if (rt.brk.chat || rt.brk.chattingWith) return false;

        const here = cafeTaken
          .map((who, i) => ({ who, i }))
          .filter((x): x is { who: string; i: number } => !!x.who && x.who !== id)
          .filter((x) => free(runtimes.get(x.who)));
        if (!here.length) return false;
        // The nearest one, so the bubbles read as a conversation rather than
        // two people shouting across the room.
        const me = rt.character.getPixelPosition();
        here.sort((a, b) => {
          const pa = runtimes.get(a.who)!.character.getPixelPosition();
          const pb = runtimes.get(b.who)!.character.getPixelPosition();
          return Math.hypot(pa.x - me.x, pa.y - me.y) - Math.hypot(pb.x - me.x, pb.y - me.y);
        });
        const partnerId = here[0].who;
        const prt = runtimes.get(partnerId)!;
        if (!prt.brk) return false;

        rt.brk.chat = { lines: chatScript(id, me.x, me.y), partnerId, idx: 0, beat: 0 };
        prt.brk.chattingWith = id;
        // Everyone else in the room stops muttering and listens: their solo
        // bubbles fade so the only two bubbles left belong to the talkers.
        for (const who of cafeTaken) {
          if (who && who !== id && who !== partnerId) runtimes.get(who)?.character.hideThought();
        }
        void spotIdx;   // the seat no longer decides who you talk to
        return true;
      };

      // Free a café seat and tidy up any conversation links so neither agent is
      // left mid-chat. Called when a break ends OR is interrupted by real work.
      const releaseBreak = (rt: Runtime): void => {
        if (!rt.brk) return;
        if (rt.brk.chat) {
          const p = runtimes.get(rt.brk.chat.partnerId);
          if (p?.brk) p.brk.chattingWith = undefined;
        }
        if (rt.brk.chattingWith) {
          const o = runtimes.get(rt.brk.chattingWith);
          if (o?.brk) o.brk.chat = undefined;
        }
        cafeTaken[rt.brk.spotIdx] = null;
        rt.brk = undefined;
      };

      // End a break gracefully: free the seat, drop the bubble — and settle the
      // coffee question. An agent that brought its used desk mug along either
      // just REFILLS it at the machine (the lazy path) or properly WASHES it at
      // the sink and racks it back on the sideboard. An agent without a mug
      // fetches a clean one off the rack first — no mug, no coffee: if the rack
      // ran dry the run ends in a sulk instead of a brew.
      /** How long an agent stays at its desk after coming back from anything.
       *
       *  The floor is meant to read as people WORKING, with the occasional
       *  errand — and it was reading as a floor where nobody sits down. Each
       *  trip is short (a break lingers 8–16s), so without a dwell afterwards an
       *  agent became eligible again the moment it sat, and the boss in
       *  particular was up every few seconds. This is the pause that makes the
       *  desk the default and the trip the exception. */
      const deskDwellMs = (): number => 60_000 + Math.random() * 90_000;

      const endBreak = (id: string, rt: Runtime): void => {
        const arrived = rt.brk?.phase === 'lingering';
        releaseBreak(rt);
        rt.character.hideThought();
        const agent = agentById(id);
        const c = rt.character;
        rt.settleUntil = Date.now() + deskDwellMs();
        if (agent?.isGod) {
          // Same mug economy as everyone else — he is not exempt from washing up
          // — but he returns to desk-ceo instead of wandering.
          if (c.isCarryingCup()) { rt.cupCarryHome = true; c.sitAtDesk(false); }
          else c.sitAtDesk(true);
          return;
        }
        if (!arrived) {
          // Never made it to the café (watchdog) — a held mug still goes home.
          if (c.isCarryingCup()) { rt.cupCarryHome = true; c.sitAtDesk(false); }
          else c.sitAtDesk(false);
          return;
        }
        if (c.isCarryingCup()) {
          // Brought the used desk mug along: 60% lazy refill, 40% proper wash.
          if (Math.random() < 0.6) startRunLeg(rt, 'toMachine');
          else startRunLeg(rt, 'toSink');
        } else if (!c.hasCupOnDesk() && Math.random() < 0.75) {
          startRunLeg(rt, 'toTray'); // fetch a clean mug, then brew
        } else {
          c.sitAtDesk(false);
        }
      };

      /** The nearest of a set of candidate spots, by walkable steps from where
       *  this agent is standing. Falls back to the first candidate when nothing
       *  is reachable — the walk will fail the same way it would have anyway,
       *  and a trip that does not start is worse than one that cannot finish. */
      const nearestSpot = <T extends { tile: Tile }>(rt: Runtime, candidates: T[]): T | undefined => {
        if (candidates.length <= 1) return candidates[0];
        const from = rt.character.getTilePosition();
        const goals = candidates.map((c, i) => ({ x: c.tile.x, y: c.tile.y, i }));
        const hit = nearestReachable(mapRenderer, from, goals);
        return hit ? candidates[hit.i] : candidates[0];
      };

      const startBreak = (id: string, rt: Runtime): void => {
        refreshWritten();
        // Prefer (≈half the time) a seat whose table-mate is already there, so
        // pairs form and chat; otherwise any free spot.
        const free: number[] = [];
        const social: number[] = [];
        for (let i = 0; i < cafeSpots.length; i++) {
          if (cafeTaken[i]) continue;
          free.push(i);
          const p = cafeSpots[i].partner;
          if (p >= 0 && cafeTaken[p]) social.push(i);
        }
        if (free.length === 0) return;
        // A table-mate still beats proximity — that is what makes pairs chat —
        // but WITHIN the pool it is now the nearest seat rather than a random
        // one. Picking at random sent agents past three empty chairs.
        const pool = (social.length && Math.random() < 0.55) ? social : free;
        const picked = nearestSpot(rt, pool.map((i) => ({ i, tile: cafeSpots[i].tile })));
        if (!picked) return;
        const idx = picked.i;
        const spot = cafeSpots[idx];
        cafeTaken[idx] = id;
        rt.brk = { spotIdx: idx, phase: 'walking', timer: 0, quipTimer: 0 };
        const c = rt.character;
        // A mug still parked on the desk comes along to the break — it stays
        // in hand through the lingering (sipping at the table) and gets either
        // refilled or washed when the break ends (see endBreak).
        if (c.hasCupOnDesk()) {
          c.setCupOnDesk(false);
          c.setCarryingCup(true);
        }
        c.walkToAndThen(spot.tile, () => {
          // Bail if the break was cancelled or reassigned while walking.
          if (!rt.brk || rt.brk.spotIdx !== idx) return;
          if (spot.seated) c.sitInPlace(spot.facing);
          else { c.setIdle(); c.faceDirection(spot.facing); }
          rt.brk.phase = 'lingering';
          // Long enough to actually have the conversation. A three-beat
          // exchange is 7s on its own, so at 8–16s people were walking out
          // mid-sentence — and two agents almost never overlapped.
          rt.brk.timer = 18 + Math.random() * 14;  // 18–32s of lingering
          rt.brk.quipTimer = 4 + Math.random() * 4;
          // Start a conversation if the table-mate is here; otherwise a solo quip.
          if (!maybePairChat(id, rt, idx)) emitQuip(id, rt, idx);
        });
      };

      const breakEligible = (agent: Agent, rt: Runtime): boolean => {
        if (rt.brk || rt.err || rt.run || rt.mtg || rt.visit || rt.cupCarryHome) return false;
        // Nobody wanders off during the morning: not while Atlas is still walking
        // to his desk, and not while the rest of the floor is still filing in.
        // The boss going for coffee before he had sat down was the first thing
        // you saw on every load.
        if (rt.walkingIn || !floorSettled()) return false;
        if (rt.settleUntil && Date.now() < rt.settleUntil) return false;
        if (agent.status !== 'idle' && agent.status !== 'success') return false;
        // The boss goes for coffee too, from his desk — and the floor notices:
        // gossip only runs out of his earshot (emitQuip), so a table stops
        // talking about him the moment he sits down. Rarer than a worker's
        // break, and the sitting check does not apply because he is seated
        // whenever he is idle.
        if (agent.isGod) return Math.random() < 0.06;
        // Seated is the NORMAL state now, so it cannot be a reason to skip
        // someone. It used to be: an agent had to be standing to qualify, which
        // meant the floor stood everyone up after they arrived and left them
        // wandering as a waiting room for coffee. The desk is where you are;
        // the trip is what interrupts it, the way it does for the boss.
        return true;
      };

      /**
       * How often the floor considers sending someone for coffee.
       *
       * Three numbers decide the rate, and they are here together rather than
       * buried in the loop because "more coffee" is a thing the human asks for
       * and it should be one edit.
       *
       *   window   how often the question is asked at all
       *   CHANCE   how often asking leads to a trip
       *   SEATS    how many may be out at once
       *
       * At 25–60s and 55%, a trip starts roughly every 75 seconds on a floor
       * with idle agents — about two and a half times the old 45–90s at 35%,
       * which worked out at one every three minutes and read as an office where
       * nobody ever took a break.
       *
       * The per-agent desk dwell (60–150s after ANY trip) is deliberately NOT
       * shortened. It is what keeps one person from pacing back and forth: the
       * floor gets busier, an individual still mostly sits.
       */
      const CAFE_WINDOW_MIN_S = 25;
      const CAFE_WINDOW_SPREAD_S = 35;
      const CAFE_CHANCE = 0.55;
      const CAFE_SEATS_AT_ONCE = 4;

      let cafeCooldown = 5;
      const updateCafeteria = (dt: number): void => {
        // Advance every in-progress break.
        for (const [id, rt] of runtimes) {
          const b = rt.brk;
          if (!b) continue;
          if (b.phase === 'walking') {
            b.timer += dt;
            if (b.timer > 20) endBreak(id, rt);   // never arrived — give up
            continue;
          }
          // lingering
          if (b.chat) {
            // Play the conversation one beat at a time, alternating speakers.
            b.chat.beat -= dt;
            if (b.chat.beat <= 0) {
              if (b.chat.idx < b.chat.lines.length) {
                const speaker = (b.chat.idx % 2 === 0) ? rt : runtimes.get(b.chat.partnerId);
                const listener = (b.chat.idx % 2 === 0) ? runtimes.get(b.chat.partnerId) : rt;
                const line = b.chat.lines[b.chat.idx];
                // ONE BUBBLE ON THE FLOOR AT A TIME. The reply drops the line it
                // is replying to, so the only cloud in the room belongs to
                // whoever is speaking right now and there is never a question
                // about who said what.
                listener?.character.hideThought();
                speaker?.character.showThought(line);
                // A laugh is a laugh: the speaker bobs, and their partner joins
                // in half the time — laughing alone at your own joke is a
                // different kind of office.
                if (isLaughBeat(line)) {
                  speaker?.character.laugh();
                  if (Math.random() < 0.5) {
                    const other = (b.chat.idx % 2 === 0) ? runtimes.get(b.chat.partnerId) : rt;
                    other?.character.laugh();
                  }
                }
                b.chat.idx++;
                // Timed by length, not a flat 2.4s. A one-word reaction that
                // sits on screen as long as a sentence is what made these read
                // as a slideshow rather than a conversation.
                b.chat.beat = line.length <= 12 ? 1.1 : line.length <= 28 ? 1.8 : 2.6;
                b.timer = Math.max(b.timer, 3.5); // keep both around to finish
                const prt = runtimes.get(b.chat.partnerId);
                if (prt?.brk) prt.brk.timer = Math.max(prt.brk.timer, 3.5);
              } else {
                // Conversation over — release the partner and resume solo quips.
                const prt = runtimes.get(b.chat.partnerId);
                if (prt?.brk) prt.brk.chattingWith = undefined;
                rt.character.hideThought();
                prt?.character.hideThought();
                b.chat = undefined;
              }
            }
          } else if (!b.chattingWith) {
            // Not in a conversation and not being spoken to. Try to START one
            // first: people in a break room together talk, and four of them
            // standing around muttering to themselves was the old behaviour —
            // a table-mate had to arrive at the one paired seat for anything to
            // happen. Every 1.5s is quick enough that silence never sets in and
            // slow enough that it does not fire the instant someone sits.
            b.chatTry = (b.chatTry ?? 0) - dt;
            if (b.chatTry <= 0) {
              b.chatTry = 1.5;
              if (maybePairChat(id, rt, b.spotIdx)) continue;
            }
            // Nobody free to talk to — mutter to yourself instead, unless two
            // others are mid-conversation, in which case you are listening.
            if (!roomChatRunning()) {
              b.quipTimer -= dt;
              if (b.quipTimer <= 0) {
                b.quipTimer = 4 + Math.random() * 4;
                emitQuip(id, rt, b.spotIdx);
              }
            }
          }
          b.timer -= dt;
          if (b.timer <= 0) endBreak(id, rt);
        }

        // Time to send people for coffee.
        cafeCooldown -= dt;
        if (cafeCooldown > 0) return;
        cafeCooldown = CAFE_WINDOW_MIN_S + Math.random() * CAFE_WINDOW_SPREAD_S;
        const alreadyOut = cafeTaken.filter(Boolean).length;
        // A cap, not a queue: a break room with half the floor in it means the
        // desks behind it are empty, which is the opposite of what this shows.
        if (alreadyOut >= CAFE_SEATS_AT_ONCE) return;
        if (Math.random() >= CAFE_CHANCE) return;
        const candidates: Array<[Agent, Runtime]> = [];
        for (const agent of useStore.getState().agents) {
          const rt = runtimes.get(agent.id);
          if (rt && breakEligible(agent, rt)) candidates.push([agent, rt]);
        }
        if (candidates.length === 0) return;

        // THEY GO TOGETHER. One at a time never overlapped: a break lasts under
        // half a minute and the next one is a minute away, so the first was
        // back at their desk before the second stood up — the room was never
        // shared and nobody ever had anyone to talk to. People fetch coffee in
        // twos and threes anyway.
        const room = CAFE_SEATS_AT_ONCE - alreadyOut;
        const wanted = Math.min(room, candidates.length, Math.random() < 0.6 ? 2 : 3);
        for (let i = candidates.length - 1; i > 0; i--) {   // shuffle, so it is not always the same desk
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        candidates.slice(0, Math.max(1, wanted)).forEach(([agent, rt], i) => {
          // A short stagger so they leave their desks a beat apart instead of
          // marching off in lockstep.
          if (i === 0) startBreak(agent.id, rt);
          else window.setTimeout(() => {
            // Still idle, still free, still room — a lot can change in a second.
            if (runtimes.get(agent.id) === rt && breakEligible(agent, rt)
              && cafeTaken.filter(Boolean).length < CAFE_SEATS_AT_ONCE) {
              startBreak(agent.id, rt);
            }
          }, 700 + i * 600);
        });
      };

      // ─── Idle errands: small purposeful busywork for a quiet floor ─────────
      // Plants get watered, windows opened for a breeze, the dispenser poured,
      // the fridge inspected, the shelf browsed, scrap paper binned. Every spot
      // has a stand tile + facing; `fx` anchors a little ambient animation.
      const ERRAND_SPOTS: ErrandSpot[] = theme.errandSpots;
      const errandTaken: (string | null)[] = new Array(ERRAND_SPOTS.length).fill(null);
      // Lazily-created ambient fx layer per active errand spot.
      const errandFx = new Map<number, Graphics>();

      const fxFor = (idx: number): Graphics => {
        let g = errandFx.get(idx);
        if (!g) {
          const spot = ERRAND_SPOTS[idx];
          g = new Graphics();
          g.eventMode = 'none';
          g.position.set(spot.fx.x * ts0, spot.fx.y * ts0);
          g.zIndex = (spot.fx.y + 1) * ts0;
          charLayer.addChild(g);
          errandFx.set(idx, g);
        }
        return g;
      };

      /** Draw one errand's ambient animation frame (local coords on its fx tile). */
      const drawErrandFx = (kind: ErrandKind, g: Graphics, t: number): void => {
        g.clear();
        if (kind === 'window' || kind === 'smoke') {
          // wind streaks slipping in under the sash and drifting down-room —
          // for 'smoke' the boss cracked HIS window open for the cigar.
          for (let i = 0; i < 3; i++) {
            const ph = (t * 0.7 + i / 3) % 1;
            g.rect(2 + i * 9 - ph * 5, 26 + ph * 16, 7, 1)
              .fill({ color: 0xd8f1f7, alpha: 0.55 * (1 - ph) });
          }
        } else if (kind === 'dispenser') {
          // glugging bottle: a drip line + a bubble rising in the tank
          const ph = (t * 1.6) % 1;
          g.rect(7, 18 + ph * 6, 1, 3).fill({ color: 0x9fd6f0, alpha: 0.9 * (1 - ph) });
          const bp = (t * 0.9) % 1;
          g.circle(8, 12 - bp * 6, 1).fill({ color: 0xffffff, alpha: 0.6 * (1 - bp) });
        } else if (kind === 'fridge') {
          // the open-door light cone spilling onto the floor, gently flickering
          const a = 0.16 + 0.05 * Math.sin(t * 5);
          g.poly([3, 12, 13, 12, 16, 30, 0, 30]).fill({ color: 0xfff2b8, alpha: a });
        } else if (kind === 'shelf') {
          // a little glint wandering across the shelves
          const ph = (t * 0.5) % 1;
          g.rect(2 + ph * 24, 4 + (Math.floor(t * 0.5) % 3) * 9, 2, 2)
            .fill({ color: 0xfff7c8, alpha: 0.8 * Math.sin(ph * Math.PI) });
        } else if (kind === 'bin') {
          // a paper ball arcing in from the agent's side, once per second
          const ph = (t * 1.0) % 1;
          if (ph < 0.45) {
            const p = ph / 0.45;
            const fromX = 18, toX = 8;
            const x = fromX + (toX - fromX) * p;
            const y = 2 - Math.sin(p * Math.PI) * 9;
            g.rect(Math.round(x), Math.round(y), 2, 2).fill({ color: 0xf5f1e6, alpha: 0.95 });
          }
        }
        // 'water' draws nothing here — droplets ride on the character itself
      };

      const releaseErrand = (rt: Runtime): void => {
        if (!rt.err) return;
        errandTaken[rt.err.idx] = null;
        errandFx.get(rt.err.idx)?.clear();
        rt.err = undefined;
        // Same dwell as a café break: every way back to the desk has to set it,
        // or the one that does not becomes the loop that keeps the floor up.
        rt.settleUntil = Date.now() + deskDwellMs();
        rt.character.stopWatering();
        rt.character.stopSmoking();
      };

      let errCooldown = 18;
      const updateErrands = (dt: number): void => {
        for (const [, rt] of runtimes) {
          const err = rt.err;
          if (!err) continue;
          err.timer += dt;
          const spot = ERRAND_SPOTS[err.idx];
          if (err.phase === 'walking') {
            if (err.timer > 20) { releaseErrand(rt); rt.character.sitAtDesk(false); }
            continue;
          }
          // doing: animate the spot; watering + smoking complete via their
          // own Character callbacks, the rest by this timer
          drawErrandFx(spot.kind, fxFor(err.idx), err.timer);
          if (spot.kind !== 'water' && spot.kind !== 'smoke' && err.timer >= spot.duration) {
            releaseErrand(rt);
            rt.character.hideThought();
            rt.character.sitAtDesk(false);
          }
        }
        errCooldown -= dt;
        if (errCooldown > 0) return;
        errCooldown = 70 + Math.random() * 70;
        if (Math.random() >= 0.35) return;          // keep it occasional
        const free = ERRAND_SPOTS.map((_, i) => i).filter((i) => !errandTaken[i]);
        if (free.length === 0) return;
        // A random spot decided which KIND of errand this is (and whether it is
        // the boss's), so it is still drawn at random here. Once the performer
        // is known, the choice is re-made as the nearest free spot they are
        // allowed — see below. Picking purely at random walked an agent past
        // the plant it was going to water.
        let idx = free[Math.floor(Math.random() * free.length)];
        const spot = ERRAND_SPOTS[idx];
        // Pick the performer. The CEO office's spots belong to Michael alone —
        // and unlike workers he runs his errands FROM his desk (he's seated
        // while idle, so the sitting check doesn't apply to him).
        let agent: Agent | undefined;
        let rt: Runtime | undefined;
        if (spot.godOnly) {
          const god = useStore.getState().agents.find((a) => a.isGod);
          const grt = god ? runtimes.get(god.id) : undefined;
          if (!god || !grt || grt.err || grt.brk
            || (god.status !== 'idle' && god.status !== 'success')
            || (grt.settleUntil !== undefined && Date.now() < grt.settleUntil)
            || Math.random() >= 0.15) return;       // the boss is unhurried
          agent = god; rt = grt;
        } else {
          const candidates: Array<[Agent, Runtime]> = [];
          for (const a of useStore.getState().agents) {
            const r = runtimes.get(a.id);
            if (r && breakEligible(a, r)) candidates.push([a, r]);
          }
          if (candidates.length === 0) return;
          [agent, rt] = candidates[Math.floor(Math.random() * candidates.length)];
        }
        // Now that we know who is going, go to the CLOSEST one they may use.
        const allowed = free.filter((i) => !!ERRAND_SPOTS[i].godOnly === !!spot.godOnly);
        const closest = nearestSpot(rt, allowed.map((i) => ({ i, tile: ERRAND_SPOTS[i].stand })));
        if (closest) idx = closest.i;
        const chosen = ERRAND_SPOTS[idx];
        const c = rt.character;
        errandTaken[idx] = agent.id;
        rt.err = { phase: 'walking', timer: 0, idx };
        c.walkToAndThen(chosen.stand, () => {
          if (!rt!.err || rt!.err.idx !== idx) return;
          rt!.err.phase = 'doing';
          rt!.err.timer = 0;
          c.faceDirection(chosen.facing);
          const lines = ERRAND_THOUGHTS[chosen.kind];
          c.showThought(t(lines[Math.floor(Math.random() * lines.length)]));
          const finish = (): void => {
            const wasGod = !!agent!.isGod;
            releaseErrand(rt!);
            c.hideThought();
            // Everyone returns to their own desk, boss included.
            c.sitAtDesk(!wasGod ? false : true);
          };
          if (spot.kind === 'water') c.startWatering(spot.duration, finish);
          else if (spot.kind === 'smoke') c.startSmoking(spot.duration, finish);
        });
      };

      // ─── The boss aura: performative excellence in Michael's presence ──────
      // When the god's avatar wanders close to a worker, the worker bursts
      // into suck-up mode — including REAL stats ("already shipped N tasks,
      // Michael. raise?" with N from the actual ledger). What they say once
      // he's out of earshot is a different story (see emitQuip's gossip).
      const lastSuckUp = new Map<string, number>();
      let doneByAssignee = new Map<string, number>();
      let statsAge = 999;
      let auraCooldown = 1.5;
      const updateBossAura = (dt: number): void => {
        // refresh the done-counts from the ledger at a relaxed cadence
        statsAge += dt;
        if (statsAge > 30) {
          statsAge = 0;
          void window.cth.hiveTasks().then((raw) => {
            const arr = (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown }).tasks))
              ? (raw as { tasks: Array<{ status?: string; assignee?: string }> }).tasks
              : [];
            const m = new Map<string, number>();
            for (const t of arr) {
              if (t?.status === 'done' && typeof t.assignee === 'string' && t.assignee) {
                m.set(t.assignee, (m.get(t.assignee) ?? 0) + 1);
              }
            }
            doneByAssignee = m;
          }).catch(() => { /* keep last counts */ });
        }
        auraCooldown -= dt;
        if (auraCooldown > 0) return;
        auraCooldown = 1.5;
        const god = useStore.getState().agents.find((a) => a.isGod);
        const grt = god ? runtimes.get(god.id) : undefined;
        if (!grt) return;
        const gp = grt.character.getPixelPosition();
        const now = Date.now();
        for (const [id, rt] of runtimes) {
          if (id === god!.id) continue;
          const a = agentById(id);
          if (!a) continue;
          // only relaxed workers perform — not someone mid-thought of real work
          if (a.status !== 'idle' && a.status !== 'success') continue;
          if (rt.brk?.chat || rt.brk?.chattingWith) continue;
          const p = rt.character.getPixelPosition();
          if (Math.hypot(p.x - gp.x, p.y - gp.y) > 44) continue;
          if (now - (lastSuckUp.get(id) ?? 0) < 25_000) continue;
          if (Math.random() >= 0.6) continue;
          lastSuckUp.set(id, now);
          const done = doneByAssignee.get(id) ?? 0;
          const pool = done > 0 ? SUCK_UP_KEYS : SUCK_UP_KEYS.slice(2);
          const line = pool[Math.floor(Math.random() * pool.length)];
          rt.character.showThought(t(line, { done: String(done) }));
          rt.character.hideThought(); // linger briefly, then fade
        }
      };

      // ─── Coffee delivery + desk screens, every frame ───────────────────────
      const updateDeskLife = (dt: number): void => {
        for (const [id, rt] of runtimes) {
          // Park the carried coffee the moment its courier is seated at home —
          // then, if there's still nothing to do, get up and wander off (the
          // cup stays, steaming, beside the monitor).
          if (rt.cupCarryHome && rt.character.isSittingAtDesk()) {
            rt.cupCarryHome = false;
            rt.character.setCarryingCup(false);
            rt.character.setCupOnDesk(true);
            // Stays in the chair with the coffee. It used to stand up and
            // wander off the moment the mug was parked.
          }
          // The monitor lights up whenever its owner is in the chair.
          if (rt.screen) {
            rt.screen.setOn(rt.character.isSittingAtDesk());
            rt.screen.update(dt);
          }
        }
      };
      // ─── The office task boards: hive/tasks.json pinned to the wall ────────
      // TWO cork boards hang side by side on the wall band above the open-plan
      // desks: BLOCKERS (red) on the left, TODO (yellow) on the right — each
      // with a colored header strip. A worker who picks a task up (doing +
      // assignee) literally TAKES THE NOTE ALONG: it leaves the boards and
      // sticks to that worker's desk instead. Finished tasks archive as a green
      // stack on the little table at the end. Clicking any of it selects
      // Michael and opens the Command Center's tasks tab.
      const BOARD_TILE: Tile = theme.anchors.boards;
      // The ensemble (two boards + archive table) is 82px wide; the wall run
      // between the two doorways spans tiles 6..12 (112px) — center it.
      const BOARD_CENTER_PAD = 15;
      const NOTE_COLORS: Record<string, number> = theme.palette.noteColors;
      interface BoardTask { status: string; assignee?: string; reviewer?: string }
      const tsB = mapRenderer.tileSize;
      const boardG = new Graphics();
      boardG.eventMode = 'static';
      boardG.cursor = 'pointer';
      boardG.position.set(BOARD_TILE.x * tsB + BOARD_CENTER_PAD, BOARD_TILE.y * tsB);
      boardG.zIndex = (BOARD_TILE.y + 1) * tsB;
      boardG.on('pointertap', (ev) => {
        ev.stopPropagation();
        const st = useStore.getState();
        const god = st.agents.find((a) => a.isGod);
        if (god) st.select(god.id);
        st.requestCommandCenterTab('tasks');
      });
      charLayer.addChild(boardG);
      // One small Graphics per desk currently holding a taken note.
      const deskNoteG = new Map<string, Graphics>();
      const clearDeskNotes = (): void => {
        for (const g of deskNoteG.values()) { g.parent?.removeChild(g); g.destroy(); }
        deskNoteG.clear();
      };

      /** One cork board with a colored header at local x `ox`; draws up to 12
       *  of `notes`, overflow as a corner pile. */
      const drawCork = (ox: number, header: number, notes: string[]): void => {
        boardG.rect(ox, -8, 30, 22).fill(0x6e5639);        // frame
        boardG.rect(ox + 1, -7, 28, 3).fill(header);       // header strip
        boardG.rect(ox + 1, -4, 28, 17).fill(0xc9b083);    // cork
        const n = Math.min(notes.length, 12);
        for (let i = 0; i < n; i++) {
          const x = ox + 3 + (i % 4) * 7;
          const y = -2 + Math.floor(i / 4) * 5;
          boardG.rect(x, y, 5, 4).fill(NOTE_COLORS[notes[i]] ?? 0xf2eddc);
          boardG.rect(x + 2, y, 1, 1).fill(0x4a3b52);      // pin
        }
        if (notes.length > 12) {
          boardG.rect(ox + 22, 8, 5, 4).fill(0xe8e0c8);
          boardG.rect(ox + 23, 7, 5, 4).fill(0xf2eddc);
        }
      };

      const drawTaskBoard = (tasks: BoardTask[]): void => {
        boardG.clear();
        clearDeskNotes();
        const blocked = tasks.filter((t) => t.status === 'blocked').map(() => 'blocked');
        const todoNotes: string[] = tasks.filter((t) => t.status === 'todo').map(() => 'todo');
        let done = 0;
        // in-progress → taken off the wall: pin it to the desk of whoever is
        // holding it. For a card in review that is the REVIEWER, because the
        // engineer's part ended when the PR went up — a review note sitting on
        // the engineer's desk reads as work they still owe. Without a resolvable
        // desk (nobody named / not on the floor) it falls back onto the TODO
        // board, so nothing ever silently disappears.
        for (const t of tasks) {
          if (t.status === 'done') { done++; continue; }
          if (t.status !== 'in-progress' && t.status !== 'in-review') continue;
          const holder = t.status === 'in-review' ? (t.reviewer ?? t.assignee) : t.assignee;
          const rt = holder ? runtimes.get(holder) : undefined;
          if (!rt) { todoNotes.push(t.status); continue; }
          const desk = rt.character.getDeskTile();
          let g = deskNoteG.get(holder!);
          if (!g) {
            g = new Graphics();
            g.eventMode = 'none';
            g.position.set((desk.x - 1) * tsB + 3, (desk.y - 1) * tsB + 8);
            g.zIndex = desk.y * tsB - 1;
            charLayer.addChild(g);
            deskNoteG.set(holder!, g);
          }
          // stack multiple taken notes side by side on the same desk
          const idx = (g as any).__count ?? 0;
          (g as any).__count = idx + 1;
          g.rect(idx * 7, -(idx % 2), 5, 4).fill(NOTE_COLORS[t.status] ?? NOTE_COLORS['in-progress']);
          g.rect(idx * 7 + 2, -(idx % 2), 1, 1).fill(0x4a3b52);
        }
        drawCork(0, NOTE_COLORS.blocked, blocked);   // left: what's burning
        drawCork(34, NOTE_COLORS.todo, todoNotes);   // right: what's queued
        // The archive table: every finished task adds a green sheet to the
        // pile (visible stack capped at 6 — beyond that it just sits proud).
        boardG.rect(68, 6, 14, 4).fill(0xb08d5e);    // table top
        boardG.rect(68, 10, 14, 4).fill(0x8a6f4d);   // table front
        boardG.rect(69, 14, 2, 2).fill(0x6e5639);    // legs
        boardG.rect(79, 14, 2, 2).fill(0x6e5639);
        const stack = Math.min(done, 6);
        for (let i = 0; i < stack; i++) {
          boardG.rect(71 + (i % 2), 4 - i * 2, 8, 2)
            .fill({ color: NOTE_COLORS.done, alpha: 1 })
            .stroke({ color: 0x6e8f6e, width: 0.5 });
        }
      };
      drawTaskBoard([]);

      // ─── The office clock: clicking it is CLOCKING OUT ─────────────────────
      // The wall clock beside Michael's window doubles as the quit entry:
      // a click runs the real close flow (window.close() → the main process
      // intercepts while agents run → the "Quitting now?" dialog with its
      // closing-time option). The office clock literally opens quitting time.
      const clockG = new Graphics();
      clockG.eventMode = 'static';
      clockG.cursor = 'pointer';
      clockG.position.set(theme.anchors.clock.x * ts0, theme.anchors.clock.y * ts0);
      clockG.hitArea = { contains: (x: number, y: number) => x >= 0 && x <= 16 && y >= 0 && y <= 32 };
      clockG.zIndex = 3 * ts0;
      clockG.on('pointertap', (ev) => {
        ev.stopPropagation();
        window.close(); // intercepted by the main process while PTYs are alive
      });
      charLayer.addChild(clockG);

      // ─── The ASK ME board: tasks waiting on the HUMAN, first class ─────────
      // Hangs on the right wall run (between the second doorway and the war
      // room): one lilac note per open question the god parked for the human.
      // It pulses while anything waits — clicking it opens the Command Center's
      // ASK ME tab, where the human reads the questions, answers, and the
      // answers flow back to the god (documented on the card itself).
      const askG = new Graphics();
      askG.eventMode = 'static';
      askG.cursor = 'pointer';
      askG.position.set(14 * tsB + 25, 10 * tsB);
      askG.zIndex = 11 * tsB;
      askG.on('pointertap', (ev) => {
        ev.stopPropagation();
        const st = useStore.getState();
        const god = st.agents.find((a) => a.isGod);
        if (god) st.select(god.id);
        st.requestCommandCenterTab('human');
      });
      charLayer.addChild(askG);
      let askCount = 0;
      let askPulse = 0;
      const drawAskBoard = (pulse: number): void => {
        askG.clear();
        // lilac-framed board with a big "?" identity
        askG.rect(0, -8, 30, 22).fill(0x5b4a6b);
        askG.rect(1, -7, 28, 3).fill(0xcdb4e8);
        askG.rect(1, -4, 28, 17).fill(0xc9b083);
        if (askCount === 0) {
          // quiet: a faint "?" watermark
          askG.rect(13, -1, 4, 2).fill({ color: 0x8a755f, alpha: 0.8 });
          askG.rect(15, 1, 2, 4).fill({ color: 0x8a755f, alpha: 0.8 });
          askG.rect(15, 7, 2, 2).fill({ color: 0x8a755f, alpha: 0.8 });
        } else {
          const n = Math.min(askCount, 8);
          for (let i = 0; i < n; i++) {
            const x = 3 + (i % 4) * 7;
            const y = -2 + Math.floor(i / 4) * 6;
            askG.rect(x, y, 5, 4).fill(0xcdb4e8);
            askG.rect(x + 2, y, 1, 1).fill(0x4a3b52);
          }
          // attention pulse around the frame while questions wait
          const a = 0.35 + 0.3 * Math.sin(pulse * 4);
          askG.rect(-2, -10, 34, 26).stroke({ color: 0xcdb4e8, width: 2, alpha: a });
        }
      };
      drawAskBoard(0);

      // ─── Board choreography: every ledger move is ACTED on the floor ───────
      // Michael walks over and pins fresh cards; an assigned worker walks to
      // the TODO board, takes its note and carries it home; finishing carries
      // the note to the archive table; a card going blocked gets walked to the
      // red board. While a move is in flight, the boards keep showing the OLD
      // state for that card — the redraw lands exactly when the actor acts.
      // Un-choreographable diffs (no actor on the floor, bulk edits, restarts)
      // simply redraw — animation is sugar, the ledger stays the truth.
      interface LedgerTask extends BoardTask { id: string }
      interface BoardMove {
        kind: 'pin' | 'take' | 'archive' | 'handover';
        taskId: string;
        actorId: string;
        /** What this card should look like in visualTasks once the move lands. */
        after: BoardTask;
        carryColor: number;
        stand: Tile;
        thought: string;
      }
      const PIN_STAND: Tile = { x: 8, y: 11 };      // under the blockers board
      const TAKE_STAND: Tile = { x: 9, y: 11 };     // under the todo board
      const ARCHIVE_STAND: Tile = { x: 12, y: 11 }; // beside the archive table
      /** What the boards currently SHOW (lags the ledger while moves play). */
      let visualTasks = new Map<string, BoardTask>();
      const moveQueue: BoardMove[] = [];
      const busyActors = new Set<string>();
      // The note riding in an actor's hand, floor-side so it needs no Character
      // support: one tiny Graphics per active move, repositioned every tick.
      const carriedNotes = new Map<string, Graphics>();

      const redrawVisual = (): void => drawTaskBoard([...visualTasks.values()]);

      const finishMove = (mv: BoardMove, rt: Runtime | undefined): void => {
        visualTasks.set(mv.taskId, mv.after);
        redrawVisual();
        busyActors.delete(mv.actorId);
        const g = carriedNotes.get(mv.actorId);
        if (g) { g.parent?.removeChild(g); g.destroy(); carriedNotes.delete(mv.actorId); }
        if (rt) {
          rt.character.hideThought();
          const agent = agentById(mv.actorId);
          if (agent) applyState(agent, rt, true); // land in the right pose
        }
      };

      const attachCarriedNote = (actorId: string, color: number): void => {
        if (carriedNotes.has(actorId)) return;
        const g = new Graphics();
        g.eventMode = 'none';
        g.rect(0, 0, 5, 4).fill(color);
        g.rect(2, 0, 1, 1).fill(0x4a3b52);
        charLayer.addChild(g);
        carriedNotes.set(actorId, g);
      };

      const startMove = (mv: BoardMove): void => {
        const rt = runtimes.get(mv.actorId);
        if (!rt) { finishMove(mv, undefined); return; }
        busyActors.add(mv.actorId);
        const c = rt.character;
        if (mv.kind === 'archive' || mv.kind === 'handover') {
          // picks the note up at its desk before walking — in hand, off the desk
          attachCarriedNote(mv.actorId, mv.carryColor);
          visualTasks.set(mv.taskId, { status: '__carried__' });
          redrawVisual();
        }
        c.showThought(mv.thought);
        c.walkToAndThen(mv.stand, () => {
          c.faceDirection('up');
          if (mv.kind === 'take') attachCarriedNote(mv.actorId, mv.carryColor);
          // brief acting beat, then the boards update under their hands
          setTimeout(() => {
            if (mv.kind === 'handover') {
              // The note is now on the reviewer's desk; walk home empty-handed.
              const rt2 = runtimes.get(mv.actorId);
              const g = carriedNotes.get(mv.actorId);
              if (g) { g.parent?.removeChild(g); g.destroy(); carriedNotes.delete(mv.actorId); }
              visualTasks.set(mv.taskId, mv.after);
              redrawVisual();
              if (!rt2) { finishMove(mv, undefined); return; }
              rt2.character.walkToAndThen(rt2.character.getDeskTile(), () => finishMove(mv, rt2));
            } else if (mv.kind === 'take') {
              // carry it home: the desk note appears on arrival via finishMove
              const rt2 = runtimes.get(mv.actorId);
              if (!rt2) { finishMove(mv, undefined); return; }
              visualTasks.set(mv.taskId, { ...mv.after, status: '__carried__' });
              redrawVisual();
              rt2.character.walkToAndThen(rt2.character.getDeskTile(), () => finishMove(mv, rt2));
              // watchdog below also covers this leg
            } else {
              finishMove(mv, runtimes.get(mv.actorId));
            }
          }, 900);
        });
      };

      let moveWatchdog = 0;
      const updateBoardMoves = (dt: number): void => {
        // carried notes ride at the actor's hand
        for (const [id, g] of carriedNotes) {
          const rt = runtimes.get(id);
          if (!rt) continue;
          const p = rt.character.getPixelPosition();
          g.position.set(p.x + 5, p.y - 10);
          g.zIndex = p.y + 1;
        }
        // start queued moves whose actor is free
        for (let i = moveQueue.length - 1; i >= 0; i--) {
          if (!busyActors.has(moveQueue[i].actorId)) {
            const mv = moveQueue.splice(i, 1)[0];
            startMove(mv);
          }
        }
        // the ASK ME board pulses for attention while questions wait
        askPulse += dt;
        if (askCount > 0) drawAskBoard(askPulse);
        // global watchdog: if anything has been in flight too long, hard-sync
        moveWatchdog += dt;
        if (moveWatchdog > 30 && busyActors.size > 0) {
          moveWatchdog = 0;
          for (const id of [...busyActors]) {
            busyActors.delete(id);
            const g = carriedNotes.get(id);
            if (g) { g.parent?.removeChild(g); g.destroy(); carriedNotes.delete(id); }
          }
          visualTasks = new Map(lastLedger.map((t) => [t.id, { status: t.status, assignee: t.assignee, reviewer: t.reviewer }]));
          redrawVisual();
        }
      };

      /** Pick who performs a ledger change: the assignee if on the floor, the
       *  god for fresh pins / orphan cards. Returns undefined → instant redraw. */
      const actorFor = (assignee: string | undefined, preferGod: boolean): string | undefined => {
        if (!preferGod && assignee && runtimes.has(assignee)) return assignee;
        const god = useStore.getState().agents.find((a) => a.isGod);
        return god && runtimes.has(god.id) ? god.id : undefined;
      };

      let lastLedger: LedgerTask[] = [];
      let firstPoll = true;
      const pollTaskBoard = async (): Promise<void> => {
        try {
          const raw = await window.cth.hiveTasks() as { tasks?: Array<{ id?: string; status?: string; assignee?: string; reviewer?: string; humanQA?: Array<{ q?: string; a?: string }> }> } | null;
          const arr = (raw && Array.isArray(raw.tasks)) ? raw.tasks : [];
          const ledger: LedgerTask[] = arr.map((t, i) => ({
            id: typeof t?.id === 'string' && t.id ? t.id : `idx-${i}`,
            status: normalizeStatus(t?.status),
            assignee: typeof t?.assignee === 'string' && t.assignee ? t.assignee : undefined,
            reviewer: typeof t?.reviewer === 'string' && t.reviewer ? t.reviewer : undefined
          }));
          // tasks waiting on the HUMAN feed the ASK ME board's note count
          const newAsk = arr.filter((t) =>
            String(t?.status) === 'blocked'
            && Array.isArray(t?.humanQA)
            && t!.humanQA!.some((e) => e && typeof e.q === 'string' && !e.a)
          ).length;
          if (newAsk !== askCount) {
            askCount = newAsk;
            drawAskBoard(askPulse);
          }
          if (firstPoll) {
            // cold start: no theatre, just show the truth
            firstPoll = false;
            visualTasks = new Map(ledger.map((t) => [t.id, { status: t.status, assignee: t.assignee, reviewer: t.reviewer }]));
            redrawVisual();
            lastLedger = ledger;
            return;
          }
          const prev = new Map(lastLedger.map((t) => [t.id, t]));
          let instant = false;
          for (const t of ledger) {
            const old = prev.get(t.id);
            const oldS = old?.status;
            if (oldS === t.status && old?.assignee === t.assignee && old?.reviewer === t.reviewer) continue;
            const after: BoardTask = { status: t.status, assignee: t.assignee, reviewer: t.reviewer };
            let mv: BoardMove | null = null;
            if (!old && (t.status === 'todo' || t.status === 'blocked')) {
              const actor = actorFor(undefined, true);
              if (actor) mv = { kind: 'pin', taskId: t.id, actorId: actor, after, carryColor: NOTE_COLORS[t.status], stand: t.status === 'blocked' ? PIN_STAND : TAKE_STAND, thought: 'pinning a new task 📌' };
            } else if (oldS !== 'in-progress' && t.status === 'in-progress') {
              const actor = actorFor(t.assignee, false);
              if (actor && actor === t.assignee) mv = { kind: 'take', taskId: t.id, actorId: actor, after, carryColor: NOTE_COLORS['in-progress'], stand: TAKE_STAND, thought: 'grabbing my task' };
            } else if (t.status === 'in-review' && t.reviewer && t.reviewer !== old?.reviewer
                       && t.assignee && t.assignee !== t.reviewer
                       && runtimes.has(t.assignee) && runtimes.has(t.reviewer)) {
              // The lead named a reviewer: the engineer walks the note over to
              // their desk. Until one is named the card just turns lilac on the
              // engineer's own desk, which is exactly what it means.
              const desk = runtimes.get(t.reviewer)!.character.getDeskTile();
              mv = { kind: 'handover', taskId: t.id, actorId: t.assignee, after, carryColor: NOTE_COLORS['in-review'], stand: desk, thought: 'over to you 🔍' };
            } else if (t.status === 'done' && oldS !== 'done') {
              const actor = actorFor(old?.assignee ?? t.assignee, false);
              if (actor) mv = { kind: 'archive', taskId: t.id, actorId: actor, after, carryColor: NOTE_COLORS.done, stand: ARCHIVE_STAND, thought: 'filing it as done ✔' };
            } else if (t.status === 'blocked' && oldS !== 'blocked') {
              const actor = actorFor(old?.assignee ?? t.assignee, false);
              if (actor) mv = { kind: 'pin', taskId: t.id, actorId: actor, after, carryColor: NOTE_COLORS.blocked, stand: PIN_STAND, thought: 'this one is stuck 😤' };
            }
            if (mv && !busyActors.has(mv.actorId) && !moveQueue.some((q) => q.actorId === mv!.actorId)) {
              if (!visualTasks.has(t.id) && mv.kind !== 'pin') visualTasks.set(t.id, { status: oldS ?? 'todo', assignee: old?.assignee });
              moveQueue.push(mv);
            } else {
              visualTasks.set(t.id, after);
              instant = true;
            }
          }
          // removed cards vanish without theatre
          for (const id of [...visualTasks.keys()]) {
            if (!ledger.some((t) => t.id === id)) { visualTasks.delete(id); instant = true; }
          }
          if (instant) redrawVisual();
          lastLedger = ledger;
        } catch { /* keep the last drawing */ }
      };
      void pollTaskBoard();
      const taskBoardPoll = setInterval(() => { void pollTaskBoard(); }, 5000);
      (app as any).__taskBoardPoll = taskBoardPoll;

      const addCharacter = async (agent: Agent) => {
        /* EVERY HIRED AGENT LOOKED LIKE ATLAS.
         *
         * `theme.cast.byName` is the fifteen-strong Office cast. The Add agent
         * picker offers those PLUS the thirty faces in the avatar library, and
         * a library id (`lib-neo`) is not a key in `byName` — so this gate sent
         * every one of them to `defaultCharacter`, which is 'michael': the
         * boss's own face. Pick Neo, hire, and Atlas walked to the desk.
         *
         * The art layer never had this limit. portraitArt resolves a cast
         * recipe, then a library recipe, then generates a face from whatever
         * string it was given — which is why the picker and the agent card,
         * both of which call it directly, showed the right face all along. Only
         * the floor gated on the cast map, and the floor is the main view.
         *
         * So: any non-empty character draws itself. Only a missing one falls
         * back. */
        const charName = agent.character?.trim() || theme.cast.defaultCharacter;
        const member = theme.cast.byName[charName];
        const seatIndex = claimSeat(agent);
        const seatTile: Tile = (seatIndex != null ? seatTiles[seatIndex] : undefined)
          ?? mapRenderer.getSpawnPoint('entrance')
          ?? { x: 2, y: 2 };
        const waitTile = waitTiles[(seatIndex ?? 0) % waitTiles.length];
        const frames = await theme.cast.getFrames(charName);
        // Bail if the agent was removed (or scene torn down) while loading.
        if (mountIdRef.current !== mountId) return;
        if (!useStore.getState().agents.some((a) => a.id === agent.id)) {
          if (seatIndex != null) seatClaims.delete(seatIndex);
          return;
        }
        const character = new Character({
          agentId: agent.id,
          mapRenderer,
          frames,
          seatTile,
          seatDirection: facingForSeat(seatTile),
          // Reload: appear at the desk, because that is where they have been.
          // Fresh start: walk in from the office door.
          spawnTile: playArrivals ? entrance : seatTile,
          // `member` is undefined for a library or generated face, so the
          // selection glow takes that face's own garment colour rather than
          // crashing on `.shirt` (which is what made the cast gate load-bearing).
          glowColor: accentNumber(agent.accent) ?? glowFor(charName, member),
          onClick: (id) => useStore.getState().select(id),
        });
        character.show(charLayer);
        // A hello on the way in. Deliberately not tied to the clock: the floor
        // does not know what time your agents think it is, and "good morning" at
        // 9pm is worse than no greeting at all. Not on a reload: nobody just
        // arrived, and being greeted by your whole team for pressing R is odd.
        if (playArrivals) {
          character.showThought(t(ARRIVE_LINES[Math.floor(Math.random() * ARRIVE_LINES.length)]));
        }
        // Kept although nothing wanders any more: the sprite library still owns
        // idle drift, and the boss's office is not a place to drift into.
        if (!agent.isGod) character.setNoWanderTiles(godRoomTiles);
        const rt: Runtime = {
          character, seatIndex, waitTile, charName,
          greetUntil: Date.now() + 4000,
          // Long enough to cross the floor and be seen at the desk. Idle
          // behaviour resumes after it; work interrupts it immediately.
          // The settle window is the arrival's tail — time to be SEEN sitting
          // down. On a reload there was no arrival, so normal life resumes at
          // once.
          settleUntil: playArrivals ? Date.now() + 12_000 : undefined
        };
        // Straight to your desk, screen on. Everyone, every time.
        if (!agent.isGod) character.sitAtDesk(false);
        if (agent.isGod && godDoorApproach && playArrivals) {
          // Walk to the corridor outside his own door, THEN to the desk. Both
          // routes are 31 steps — the difference is that the shortest-path tie
          // goes through the boardroom, and his room has a door of its own.
          rt.walkingIn = true;
          character.walkToAndThen(godDoorApproach, () => {
            rt.walkingIn = false;
            character.sitAtDesk(false);
          });
        }
        // Standard desks paint the 2×2 PC monitor two rows above the seat —
        // give those a DeskScreen (lights up while seated) and a cup spot
        // beside the monitor, exactly where the tileset's baked-in mug used
        // to sit before we cleared it (desks start clean now; cups only exist
        // where an agent actually carried one).
        if (mapRenderer.gidAt('furniture-above', seatTile.x, seatTile.y - 2) === theme.monitor.offTopLeftGid) {
          const top = { x: seatTile.x, y: seatTile.y - 2 };
          rt.screen = new DeskScreen(mapRenderer, top, theme.monitor);
          charLayer.addChild(rt.screen.container);
          const ts2 = mapRenderer.tileSize;
          character.setCupSpot({ x: top.x * ts2 + 18, y: top.y * ts2 + 23 });
        }
        runtimes.set(agent.id, rt);
        applyState(agent, rt, true);
      };

      const removeCharacter = (id: string) => {
        const rt = runtimes.get(id);
        if (!rt) return;
        releaseBreak(rt);                // free any café seat it was holding
        releaseErrand(rt);               // and any idle errand it was running
        releaseRun(rt);                  // and any coffee run in progress
        // Facilities collects an abandoned mug (carried or parked on the desk)
        // back onto the sideboard, so the finite cup stock can never leak away.
        if (rt.character.isCarryingCup() || rt.character.hasCupOnDesk()) {
          // The clamp guarantees "never leak", but a clamp that actually FIRES
          // means the accounting double-counted somewhere — surface it instead
          // of silently pinning the stock at the cap.
          if (cleanCups >= MAX_CUPS) console.warn('[office] mug reclaim over cap — cup accounting drifted');
          cleanCups = Math.min(MAX_CUPS, cleanCups + 1);
          drawTray();
        }
        if (rt.seatIndex != null) seatClaims.delete(rt.seatIndex);
        rt.screen?.destroy();
        rt.character.hide(0);
        // give the fade-out a moment, then destroy
        setTimeout(() => rt.character.destroy(), 700);
        runtimes.delete(id);
      };

      // Map an agent's store state onto its on-floor character.
      const applyState = (agent: Agent, rt: Runtime, force = false) => {
        const changed = force
          || rt.prevStatus !== agent.status
          || rt.prevAction !== agent.action
          || rt.prevCarrying !== agent.carrying
          || rt.prevPrompt !== agent.lastPrompt;
        if (!changed) return;
        // Finishing real work (working/thinking/compacting → done) earns a
        // little celebration before the avatar goes back to roaming — but only
        // after a SUBSTANTIAL busy stretch (see CHEER_MIN_BUSY_MS): an inbox
        // nudge or heartbeat reply that flips busy for a few seconds ends
        // quietly instead of "celebrating" every few minutes over nothing.
        const wasBusy = rt.prevStatus === 'working' || rt.prevStatus === 'thinking' || rt.prevStatus === 'compacting';
        const isBusy = agent.status === 'working' || agent.status === 'thinking' || agent.status === 'compacting';
        if (isBusy && !wasBusy) rt.busySince = Date.now();
        const finishedWork = !force && !agent.isGod
          && wasBusy && (agent.status === 'idle' || agent.status === 'success')
          && rt.busySince !== undefined && Date.now() - rt.busySince >= CHEER_MIN_BUSY_MS;
        if (!isBusy) rt.busySince = undefined;
        rt.prevStatus = agent.status;
        rt.prevAction = agent.action;
        rt.prevCarrying = agent.carrying;
        rt.prevPrompt = agent.lastPrompt;

        const c = rt.character;
        c.setBaseAlpha(agent.status === 'ghost' ? 0.5 : 1);

        // While an agent is on a coffee break the director owns its avatar — a
        // mere idle/success refresh must not yank it back to wandering. Any
        // other live status (work, blocked, …) cancels the break and falls
        // through to normal handling, sending it back to its desk / the door.
        if (rt.brk) {
          if (agent.status === 'idle' || agent.status === 'success') {
            c.setStatusGlyph(agent.status === 'success' ? 'success' : 'none');
            return;
          }
          releaseBreak(rt);
        }
        // Same for an idle errand (watering, window, fridge…): idle refreshes
        // leave it alone, real work cancels it and the agent heads to its desk.
        if (rt.err) {
          if (agent.status === 'idle' || agent.status === 'success') {
            c.setStatusGlyph(agent.status === 'success' ? 'success' : 'none');
            return;
          }
          releaseErrand(rt);
        }
        // And for a coffee run: real work cancels it mid-stride — a mug already
        // in hand simply rides along to the desk (cupCarryHome parks it there).
        if (rt.run) {
          if (agent.status === 'idle' || agent.status === 'success') {
            c.setStatusGlyph(agent.status === 'success' ? 'success' : 'none');
            return;
          }
          releaseRun(rt);
        }

        // A thought cloud above the head shows what the agent is doing RIGHT NOW
        // (its live `action`, e.g. "edit App.tsx"). Working → sit at the desk;
        // blocked → walk to the door and flash "!"; done/idle → wander.
        switch (agent.status) {
          case 'working':
          case 'thinking':
            c.setStatusGlyph('none');
            c.sitAtDesk(true);
            c.showThought(liveActivity(agent), agent.carrying);
            break;
          case 'waiting':
            // Parked at the desk awaiting god / another agent — not actively
            // working (no focus glow) and NOT at the door (that's reserved for
            // agents that need the human).
            c.setStatusGlyph('none');
            c.sitAtDesk(false);
            c.showThought(liveActivity(agent, t('office.activity.waiting')), agent.carrying);
            break;
          case 'blocked':
            c.setStatusGlyph('blocked');
            c.showThought(liveActivity(agent, t('office.activity.needsYou')));
            c.walkToTile(rt.waitTile);
            break;
          case 'compacting':
            // #5C — mid-/compact: stay put at the desk, "boxing up" glyph + thought,
            // so an agent compacting context reads as busy rather than frozen.
            c.setStatusGlyph('compacting');
            c.sitAtDesk(true);
            c.showThought(liveActivity(agent, t('office.activity.compacting')));
            break;
          case 'looping':
            // #5C — circuit-breaker armed (#6): hold position with the spinning
            // warning glyph so a runaway agent is visible on the floor.
            c.setStatusGlyph('looping');
            c.sitAtDesk(false);
            c.showThought(liveActivity(agent, t('office.activity.looping')));
            break;
          case 'success':
            c.setStatusGlyph('success');
            if (agent.isGod) { c.hideThought(); if (!rt.walkingIn) c.sitAtDesk(true); break; }
            c.sitAtDesk(false);
            if (finishedWork) {
              c.cheer();
              c.showThought(t(CHEER_KEYS[Math.floor(Math.random() * CHEER_KEYS.length)]));
            } else {
              c.hideThought();
            }
            break;
          case 'ghost':
            c.setStatusGlyph('none');
            c.hideThought();
            c.setIdle();
            break;
          case 'idle':
          default:
            c.setStatusGlyph('none');
            // The god runs the floor from its desk; everyone else wanders when idle.
            if (agent.isGod) {
              if (!rt.walkingIn) c.sitAtDesk(true);
              c.showThought(liveActivity(agent, t('office.activity.runningFloor')));
            }
            else if (finishedWork) {
              // Task done → a cheer in the chair, then back to work.
              c.sitAtDesk(false);
              c.cheer();
              c.showThought(t(CHEER_KEYS[Math.floor(Math.random() * CHEER_KEYS.length)]));
            }
            else {
              // Idle means AT YOUR DESK. The floor used to stand everyone up
              // and let the sprite library walk them around, which is what made
              // an idle office look like an aimless one. Leaving the desk is
              // now something with a reason: coffee, an errand, a meeting.
              c.sitAtDesk(false);
              // An idle agent used to say "idle", which is the floor telling you
              // what you can already see — it is standing up and wandering off.
              // Say something a person would say instead, and never in the first
              // seconds: that is the hello it just gave walking through the door.
              if (Date.now() >= (rt.greetUntil ?? 0)) {
                c.showThought(liveActivity(agent, t(FREE_LINES[Math.floor(Math.random() * FREE_LINES.length)])));
              }
            }
            break;
        }
      };

      // ─── Arrivals: the boss opens the office, then everyone comes in ──────
      // Atlas walks in first. Three seconds later the doors open and the rest
      // of the floor arrives TOGETHER — leads first in the ordering, but in one
      // go, not one every couple of seconds. A queue at the door was a long
      // wait to look at on every refresh, and it got worse with each hire.
      // Nothing about the agents' PROCESSES changes; this is the arrival on the
      // floor only, so an agent is working long before its avatar sits down.
      /** From Atlas ARRIVING, not from him sitting down. */
      const DOORS_OPEN_AFTER_S = 3;
      const arriving = new Set<string>();      // addCharacter in flight
      /** Seconds since Atlas walked in, or -1 before he has. The door opens on
       *  a clock from his ARRIVAL, not from him reaching his chair: his walk is
       *  long (out of his own door, down the corridor, across the floor) and
       *  waiting it out left the office empty for the best part of a minute
       *  before anyone else appeared. Three seconds is enough that he is
       *  unmistakably first through the door, and the rest follow while he is
       *  still crossing the room, which is what an office looks like. */
      let sinceGodArrived = playArrivals ? -1 : 99;
      // Already here: the doors are open, so breaks, errands and meetings are
      // not held behind an arrival that is not coming.
      let doorsOpen = !playArrivals;


      /** True once the office has opened AND everyone expected has walked in.
       *  Breaks, errands and visits all wait for it. */
      const floorSettled = (): boolean => {
        if (!doorsOpen) return false;
        if (arriving.size > 0) return false;
        return !useStore.getState().agents.some((a) => !runtimes.has(a.id));
      };

      /** Leads first, then everyone else; stable within each group so the order
       *  does not shuffle between frames. */
      const arrivalOrder = (agents: Agent[]): Agent[] => [
        ...agents.filter((a) => a.isLead),
        ...agents.filter((a) => !a.isLead)
      ];

      /**
       * Let a settled agent get up.
       *
       * `applyState` only fires when an agent's state CHANGES, so the sit-down on
       * arrival was the last thing that ever happened to an idle one: it stayed
       * at its desk forever, and since `breakEligible` skips anyone already
       * sitting, it was never picked for coffee or an errand either. Atlas was
       * the only avatar moving because his own sitting check does not apply.
       *
       * So this is the other half of the arrival: once the settle window passes,
       * an idle agent stands up and rejoins the floor's normal life.
       */
      const releaseSettled = (): void => {
        const now = Date.now();
        for (const [, rt] of runtimes) {
          if (!rt.settleUntil || now < rt.settleUntil) continue;
          // Just clears the dwell. It used to stand the agent UP — that was the
          // only way to qualify for coffee back when eligibility required
          // standing, and it is why an idle floor was a floor of people milling
          // about. They stay in their chairs; the café picks them from there.
          rt.settleUntil = undefined;
        }
      };

      const updateArrivals = (dt: number): void => {
        releaseSettled();
        const agents = useStore.getState().agents;
        const god = agents.find((a) => a.isGod);
        const grt = god ? runtimes.get(god.id) : undefined;

        // No boss yet: nobody else comes in — he opens the office. Once the
        // clock has run the latch stays open, so him going for coffee later
        // cannot turn the queue back at the door.
        if (!doorsOpen) {
          if (!grt) { sinceGodArrived = -1; return; }
          sinceGodArrived = sinceGodArrived < 0 ? 0 : sinceGodArrived + dt;
          if (sinceGodArrived < DOORS_OPEN_AFTER_S) return;
          doorsOpen = true;
        }

        // Everyone who is not already here, in one pass. Leads first, so the
        // seating claim order still gives them their offices.
        for (const a of arrivalOrder(agents)) {
          if (a.isGod || runtimes.has(a.id) || arriving.has(a.id)) continue;
          arriving.add(a.id);
          void addCharacter(a).finally(() => arriving.delete(a.id));
        }
      };

      const syncAgents = () => {
        const { agents } = useStore.getState();
        const present = new Set(agents.map((a) => a.id));
        for (const id of Array.from(runtimes.keys())) {
          if (!present.has(id)) removeCharacter(id);
        }
        for (const agent of agents) {
          const rt = runtimes.get(agent.id);
          // Atlas is not queued — he IS the gate. Everyone else waits for
          // updateArrivals to let them through the door.
          if (!rt) { if (agent.isGod) void addCharacter(agent); }
          else applyState(agent, rt);
        }
      };

      syncAgents();

      let lastSelected: string | null = useStore.getState().selectedId;
      const unsubscribe = useStore.subscribe((s, prev) => {
        if (s.agents !== prev.agents) syncAgents();
        if (s.selectedId !== lastSelected) {
          lastSelected = s.selectedId;
          const rt = s.selectedId ? runtimes.get(s.selectedId) : undefined;
          if (rt) {
            const p = rt.character.getPixelPosition();
            camera.nudgeToward(p.x, p.y);
          }
        }
      });
      (app as any).__unsub = unsubscribe;

      // Fly an envelope from a sender's desk to each recipient when the hive
      // routes a message. Endpoints are snapshotted at spawn, so the paper flies
      // a clean arc even if the avatars wander mid-flight. 'human' recipients
      // (escalations) fly to the office door.
      const ts = mapRenderer.tileSize;
      const humanPos = { x: entrance.x * ts + ts / 2, y: entrance.y * ts + ts };
      const posFor = (id: string): { x: number; y: number } | null => {
        if (id === 'human') return humanPos;
        const rt = runtimes.get(id);
        return rt ? rt.character.getPixelPosition() : null;
      };
      const spawnHandoff = (fromId: string, toId: string, act: MessageAct, needsHuman: boolean) => {
        if (envelopes.length >= MAX_ENVELOPES) return;
        if (toId === fromId) return; // never mail yourself
        const from = posFor(fromId);
        const to = posFor(toId);
        if (!from || !to) return; // sender or recipient not on the floor
        const env = new MessageEnvelope(from, to, act, needsHuman);
        charLayer.addChild(env.container);
        envelopes.push(env);
      };

      // ─── Desk visits: an agent walks over to Atlas rather than just mailing ─
      // A worker sending god a message is someone with a question about a task.
      // On the floor that reads better as walking to the boss's cabin and
      // standing there for a moment than as an envelope sailing across the room
      // (the envelope still flies — this is the sender's half of it). Standing,
      // never seated: it is a quick word, not a meeting.
      let visitCooldown = 0;
      const VISIT_HOLD_S = 8;
      const startDeskVisit = (fromId: string): void => {
        if (visitCooldown > 0 || !floorSettled()) return;
        const god = useStore.getState().agents.find((a) => a.isGod);
        const grt = god ? runtimes.get(god.id) : undefined;
        const rt = runtimes.get(fromId);
        const agent = agentById(fromId);
        if (!god || !grt || !rt || !agent || agent.isGod) return;
        // Only an agent with nothing in flight, and only while the boss is at his
        // desk — walking to an empty cabin is just walking.
        if (rt.brk || rt.err || rt.run || rt.mtg || rt.visit || rt.cupCarryHome) return;
        if (agent.status !== 'idle' && agent.status !== 'success') return;
        if (grt.brk || grt.err || grt.run || grt.mtg || !grt.character.isSitting()) return;

        const godSeat = seatTiles[GOD_SEAT];
        // Three places to stand at the boss's desk. `find` took whichever came
        // first in the list, which could be the far side of his desk.
        const openStands = [
          { x: godSeat.x + 1, y: godSeat.y + 1 },
          { x: godSeat.x - 1, y: godSeat.y + 1 },
          { x: godSeat.x, y: godSeat.y + 2 }
        ].filter((tl) => mapRenderer.isWalkable(tl.x, tl.y) && !visitSpots.has(`${tl.x},${tl.y}`));
        const nearestStand = nearestSpot(rt, openStands.map((tl) => ({ tile: tl })));
        const spot = nearestStand?.tile;
        if (!spot) return;

        visitCooldown = 25;
        visitSpots.add(`${spot.x},${spot.y}`);
        rt.visit = { timer: 0, tile: spot };
        rt.character.walkToAndThen(spot, () => {
          if (!rt.visit) return;
          rt.character.faceDirection('up');
          rt.character.showThought(t(VISIT_LINES[Math.floor(Math.random() * VISIT_LINES.length)]));
        });
      };

      const endDeskVisit = (id: string, rt: Runtime): void => {
        if (!rt.visit) return;
        visitSpots.delete(`${rt.visit.tile.x},${rt.visit.tile.y}`);
        rt.visit = undefined;
        rt.settleUntil = Date.now() + deskDwellMs();
        rt.character.hideThought();
        rt.character.sitAtDesk(true);
      };

      const updateVisits = (dt: number): void => {
        if (visitCooldown > 0) visitCooldown -= dt;
        for (const [id, rt] of runtimes) {
          if (!rt.visit) continue;
          const agent = agentById(id);
          if (agent && agent.status !== 'idle' && agent.status !== 'success') { endDeskVisit(id, rt); continue; }
          rt.visit.timer += dt;
          if (rt.visit.timer > VISIT_HOLD_S + 20) endDeskVisit(id, rt);
        }
      };

      // ─── Standups: when Atlas briefs the floor, the floor meets ────────────
      // The boardroom was overflow desk seating and nothing else — a table with
      // chairs nobody used. It has an obvious trigger already: god sending ONE
      // message to several agents at once is a briefing, so the people briefed
      // walk in, sit for a bit, and go back to work. No new event, no timer
      // inventing meetings that did not happen.
      const meetingTiles: Tile[] = (() => {
        const z = mapRenderer.getZone('boardroom');
        const out: Tile[] = [];
        if (!z) return out;
        for (let y = z.y; y < z.y + z.height; y++) {
          for (let x = z.x; x < z.x + z.width; x++) {
            if (mapRenderer.isWalkable(x, y)) out.push({ x, y });
          }
        }
        return out;
      })();
      const meetingTaken: (string | null)[] = new Array(meetingTiles.length).fill(null);
      const visitSpots = new Set<string>();
      /** Seconds before another briefing can pull the floor in again — a god that
       *  dispatches five cards in a row is one standup, not five. */
      let meetingCooldown = 0;
      const MEETING_HOLD_S = 20;

      const endMeeting = (id: string, rt: Runtime): void => {
        const m = rt.mtg;
        if (!m) return;
        const idx = meetingTiles.findIndex((tl) => tl.x === m.tile.x && tl.y === m.tile.y);
        if (idx >= 0 && meetingTaken[idx] === id) meetingTaken[idx] = null;
        rt.mtg = undefined;
        rt.settleUntil = Date.now() + deskDwellMs();
        rt.character.hideThought();
        // Back to work, not back to wandering: a standup that ends with everyone
        // milling about is the floor's busiest-looking moment and its least
        // truthful — the meeting is over, so they are at their desks.
        rt.character.sitAtDesk(true);
      };

      /**
       * Whoever was just addressed together goes to the table.
       *
       * Two ways in, and the room does not care which: Atlas briefing several
       * agents (a standup), or a worker addressing two or more peers (three
       * people talking, which is a meeting whether or not the boss called it).
       * The caller always attends — a meeting without whoever called it is just
       * agents standing around — and everyone else has to be free.
       */
      const startMeeting = (callerId: string, attendees: string[]): void => {
        if (meetingCooldown > 0 || meetingTiles.length === 0 || !floorSettled()) return;
        const caller = agentById(callerId);
        const crt = runtimes.get(callerId);
        if (!caller || !crt || crt.brk || crt.err || crt.run || crt.mtg) return;
        // A worker calling the meeting must itself be free; the boss is seated
        // whenever he is idle, so his own status is checked the same way.
        if (caller.status !== 'idle' && caller.status !== 'success') return;

        const free = meetingTiles
          .map((tl, i) => [tl, i] as const)
          .filter(([, i]) => !meetingTaken[i]);
        if (free.length < 2) return;

        const going: Array<[string, Runtime]> = [[callerId, crt]];
        for (const id of attendees) {
          if (going.length >= free.length) break;
          const rt = runtimes.get(id);
          const agent = agentById(id);
          // Only agents with nothing in flight. A briefing is not worth
          // interrupting the work the briefing is about.
          if (!rt || !agent || id === callerId) continue;
          if (rt.brk || rt.err || rt.run || rt.mtg || rt.cupCarryHome) continue;
          if (agent.status !== 'idle' && agent.status !== 'success') continue;
          going.push([id, rt]);
        }
        // Three or it does not happen. The boss walking to the table for a
        // one-on-one — or, worse, arriving to an empty room because everyone he
        // addressed turned out to be busy — is why this floor had a boardroom
        // nobody used and a boss who kept leaving his desk for nothing.
        if (going.length < 3) return;

        meetingCooldown = 90;
        // Chairs used to be handed out by list position, so the agent nearest
        // the door could be sent to the far side of the table and cross the
        // room past an empty seat. Each attendee takes the closest chair still
        // going, in the order they were gathered.
        const openSeats = [...free];
        going.forEach(([id, rt]) => {
          const pick = nearestSpot(rt, openSeats.map(([tl, i], k) => ({ tile: tl, i, k })));
          const seatAt = pick ? pick.k : 0;
          const [tile, idx] = openSeats[seatAt];
          openSeats.splice(seatAt, 1);
          meetingTaken[idx] = id;
          rt.mtg = { phase: 'walking', timer: 0, tile };
          rt.character.walkToAndThen(tile, () => {
            if (!rt.mtg) return;
            rt.mtg.phase = 'seated';
            rt.mtg.timer = 0;
            rt.character.showThought(t(MEETING_LINES[Math.floor(Math.random() * MEETING_LINES.length)]));
          });
        });
      };

      const updateMeetings = (dt: number): void => {
        if (meetingCooldown > 0) meetingCooldown -= dt;
        for (const [id, rt] of runtimes) {
          const m = rt.mtg;
          if (!m) continue;
          const agent = agentById(id);
          // Real work outranks the standup, always.
          if (agent && agent.status !== 'idle' && agent.status !== 'success') { endMeeting(id, rt); continue; }
          m.timer += dt;
          if (m.phase === 'walking' && m.timer > 20) { endMeeting(id, rt); continue; }  // never arrived
          if (m.phase === 'seated' && m.timer > MEETING_HOLD_S) { endMeeting(id, rt); continue; }
          // Work pulled the others away: nobody sits at that table alone.
          let others = 0;
          for (const [otherId, ort] of runtimes) if (otherId !== id && ort.mtg) others++;
          if (others === 0) endMeeting(id, rt);
        }
      };

      // Real path: the main-process router emits one event per routed message.
      // Guarded so a stale preload bridge (e.g. before a dev-server restart adds
      // this method) degrades to "no envelopes" rather than crashing the floor.
      const offMessage = window.cth.onHiveMessage
        ? window.cth.onHiveMessage((e) => {
            for (const target of e.targets) spawnHandoff(e.from, target, e.act, e.needsHuman);
            // One message to several agents is a briefing (from Atlas) or a
            // three-way (from a worker). Either fills the boardroom.
            if (e.targets.length >= 2) startMeeting(e.from, e.targets);
            // One agent → the boss: a question about a task. Walk it over.
            const boss = useStore.getState().agents.find((a) => a.isGod);
            if (boss && e.targets.length === 1 && e.targets[0] === boss.id) startDeskVisit(e.from);
          })
        : () => { /* onHiveMessage unavailable — real handoffs disabled this session */ };
      // Demo path: with no live hive, the mock loop dispatches synthetic handoffs
      // so the animation is still visible. Clearly demo-only, fed by mockEvents.ts.
      const onDemoHandoff = (ev: Event) => {
        const d = (ev as CustomEvent<{ from: string; to: string; act: MessageAct }>).detail;
        if (d) spawnHandoff(d.from, d.to, d.act, false);
      };
      window.addEventListener('cth:demo-handoff', onDemoHandoff);
      (app as any).__offMessage = () => {
        offMessage();
        window.removeEventListener('cth:demo-handoff', onDemoHandoff);
      };

      // Keep two nearby thought clouds from covering each other: stack the
      // overlapping ones upward. Computed from each bubble's BASE rect (ignoring
      // the lift already applied) so the result is stable frame-to-frame.
      const resolveBubbleOverlaps = () => {
        const items: Array<{ rt: Runtime; x: number; y: number; w: number; h: number }> = [];
        for (const rt of runtimes.values()) {
          const lay = rt.character.getThoughtLayout();
          if (lay) items.push({ rt, ...lay });
        }
        if (items.length < 2) {
          for (const it of items) it.rt.character.setThoughtLift(0);
          return;
        }
        // Lower bubbles (greater bottom edge) and left-most ones hold their spot;
        // the rest get pushed above them. Deterministic ordering → no flicker.
        items.sort((a, b) => (b.y + b.h) - (a.y + a.h) || a.x - b.x);
        const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
        const pad = 2;
        for (const it of items) {
          let y = it.y;
          let moved = true, guard = 0;
          while (moved && guard++ < 12) {
            moved = false;
            for (const p of placed) {
              const overlapX = it.x < p.x + p.w + pad && it.x + it.w + pad > p.x;
              const overlapY = y < p.y + p.h + pad && y + it.h + pad > p.y;
              if (overlapX && overlapY) { y = p.y - it.h - pad; moved = true; }
            }
          }
          placed.push({ x: it.x, y, w: it.w, h: it.h });
          it.rt.character.setThoughtLift(it.y - y);   // positive → shift up
        }
      };

      const onTick = (ticker: Ticker) => {
        const dt = ticker.deltaMS / 1000;
        camera.update(dt);
        // Thought clouds counter-scale against the camera so their text never
        // renders below 1:1 screen size when the window/world shrinks.
        const zoom = world.scale.x;
        for (const rt of runtimes.values()) {
          rt.character.setBubbleZoom(zoom);
          rt.character.update(dt);
        }
        updateCafeteria(dt);
        updateMeetings(dt);
        updateVisits(dt);
        updateArrivals(dt);
        updateCoffeeRuns(dt);
        updateErrands(dt);
        updateBossAura(dt);
        updateDeskLife(dt);
        updateBoardMoves(dt);
        resolveBubbleOverlaps();
        for (let i = envelopes.length - 1; i >= 0; i--) {
          if (envelopes[i].update(dt)) {
            envelopes[i].destroy();
            envelopes.splice(i, 1);
          }
        }
      };
      app.ticker.add(onTick);
      // init() is async: the floor may already be behind a fullscreen terminal by
      // the time we get here, and app.init() starts the ticker itself.
      if (pausedRef.current) app.ticker.stop();

      const resize = new ResizeObserver((entries) => {
        for (const e of entries) {
          const { width, height } = e.contentRect;
          if (width === 0 || height === 0) continue;
          app.renderer?.resize(width, height);
          camera.setViewSize(width, height);
        }
      });
      resize.observe(host);
      (app as any).__resize = resize;
      // The floor is up: give the next crowded start-up a full budget again.
      initRetriesRef.current = 0;
    };

    init().catch((err) => {
      if (mountIdRef.current !== mountId) return;
      const plan = planInitFailure(err, initRetriesRef.current);

      // Pixi could not get a context — usually the GPU process restarting under
      // us — and reports that as "this browser does not support WebGL". Retry
      // through the same rebuild path an eviction uses; the half-built app is
      // torn down by this effect's cleanup when the generation bump re-runs it.
      if (plan.action === 'retry') {
        initRetriesRef.current = plan.attempt;
        console.warn(`[OfficeFloor] could not get a WebGL context (the GPU process may be restarting) — retrying, attempt ${plan.attempt}/${DEFAULT_MAX_INIT_RETRIES}`);
        setTimeout(() => {
          if (mountIdRef.current === mountId) setGlGeneration((n) => n + 1);
        }, plan.delayMs);
        return;
      }

      // Out of budget. The stack would say "does not support WebGL", which is
      // both untrue and unactionable; say what actually helps instead.
      if (plan.action === 'give-up') {
        console.error(`[OfficeFloor] still no WebGL context after ${DEFAULT_MAX_INIT_RETRIES} retries:`, err);
        host.appendChild(floorNote(
          'The office floor could not get a GPU context.\n\n' +
          'The GPU may still be restarting, or too many terminals are\n' +
          'using it at once. Close a few agent terminals, or restart\n' +
          'the app, to bring the floor back.'));
        return;
      }

      console.error('[OfficeFloor] init failed:', err);
      host.appendChild(floorNote(
        'OfficeFloor failed to start:\n' + (err?.stack || err?.message || String(err))));
    });

    return () => {
      mountIdRef.current++;
      const a = appRef.current;
      if (a) {
        (a as any).__glRecovery?.();
        (a as any).__resize?.disconnect?.();
        try { (a as any).__unsub?.(); } catch { /* noop */ }
        try { (a as any).__offMessage?.(); } catch { /* noop */ }
        try { clearInterval((a as any).__taskBoardPoll); } catch { /* noop */ }
        safeDestroy(a);
      }
      appRef.current = null;
      while (host.firstChild) host.removeChild(host.firstChild);
    };
  }, [officeTheme, tilePalette, glGeneration, i18n.language]);

  return (
    <div
      ref={hostRef}
      style={{
        width: '100%', height: '100%',
        boxShadow: 'var(--cth-panel-border)',
        overflow: 'hidden',
        imageRendering: 'pixelated',
        background: hex(colors.ink[900]),
      }}
    />
  );
}

/** A message where the floor should be — the only thing the user sees when the
 *  scene cannot run, so all three failure paths share one look. */
function floorNote(text: string): HTMLDivElement {
  const note = document.createElement('div');
  note.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
    'padding:24px;color:var(--cth-ink-700);font-family:monospace;font-size:13px;text-align:center;white-space:pre-wrap;';
  note.textContent = text;
  return note;
}
function hexNum(n: number): number { return n; }
function hex(n: number): string { return '#' + n.toString(16).padStart(6, '0'); }
function safeDestroy(app: Application) {
  try { app.ticker?.stop(); } catch { /* noop */ }
  try { app.destroy(true, { children: true }); } catch { /* noop */ }
}
