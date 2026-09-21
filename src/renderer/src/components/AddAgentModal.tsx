import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { SpritePortrait } from './SpritePortrait';
import { Icon } from './Icon';
import { canOpenSection, sectionsFor, type SectionKey } from './addAgentGate';
import { DeskPicker } from './DeskPicker';
import { composeBrief, DEFAULT_DONE } from '@shared/agentBrief';

/** Mirrors main's projects.ts — a folder an agent can work in. */
interface ProjectEntry { path: string; name: string; isRepo: boolean; parent?: string }
import { Switch } from './Switch';
import { DESK_MAP } from '@/scene/office/deskDirectory';
import { ProviderLogo } from './ProviderLogo';
import { useStore, type Agent } from '@/store/store';
import { AVATAR_LIBRARY, LIBRARY_BY_ID } from '@/scene/office/avatarLibrary';
import { MAX_AGENTS } from '@/scene/office/portraitArt';
import { OFFICE_CAST, DEFAULT_CHARACTER, type OfficeCharacterName } from '@/scene/office/cast';
import { type AccentColorName, DEFAULT_ACCENT_HEX } from '@/design/tokens';
import type { HireManifest } from '@shared/hire';
import { hireQueueProgress } from '@shared/hireQueue';
import { MCP_CATALOG } from '@shared/mcpCatalog';
import {
  OSS_LOCAL_PICKS,
  OSS_PROVIDER_PICKS,
  localSlugFor,
  hasOssQuickPicks
} from '@shared/ossModels';
import {
  type AgentProvider,
  type HarnessConfig,
  AGENT_PROVIDER_PRESETS,
  buildSpawnCommand,
  tokenizeCommand,
  modelsForProvider,
  inferAgentProvider,
  providerPreset,
  isClaudeProvider
} from '@/store/config';
import { useRtl } from '@/i18n/useDirection';
import { useNativeDialog } from '@/hooks/useNativeDialog';

// Twelve, in hue order, so the row reads as a spectrum rather than a bag of
// colours. Six was not enough to tell a dozen agents apart on the floor.
const ACCENTS: AccentColorName[] = [
  'coral', 'rose', 'peach', 'lemon', 'olive', 'mint',
  'jade', 'sky', 'indigo', 'lilac', 'plum', 'slate',
];
/** Red leads the row and is what a fresh dialog opens on. */
const DEFAULT_ACCENT: AccentColorName = 'coral';

/** Sensible answers already filled in, because most agents want these and a
 *  first-time user has no idea they are the right answers. Both are editable. */

// OSS quick-pick chip styling (ondev-c) — mirrors the model-picker chips.
const ossChip = (active: boolean): CSSProperties => ({
  height: 30, padding: '0 12px',
  display: 'inline-flex', alignItems: 'center',
  borderRadius: 'var(--cth-radius-btn)',
  background: active ? 'var(--cth-lilac-light)' : 'var(--cth-cream-100)',
  boxShadow: active ? 'inset 0 0 0 1.5px var(--cth-lilac)' : 'none',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, fontWeight: active ? 600 : 500,
  color: active ? 'var(--cth-lilac-text)' : 'var(--cth-ink-700)',
  cursor: 'pointer', border: 'none'
});
const ossGroupHead: CSSProperties = {
  fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11.5, lineHeight: '14px',
  color: 'var(--cth-ink-500)', marginBottom: 6
};

// One-click briefing templates — fill Description + Goal with a sharp, ready-to-run
// role so a user isn't staring at a blank field (item 7). The template BRIEFINGS
// stay English (they become agent prompts — see the i18n report); only the
// picker labels are translated.
// Copy-paste prompt the user hands to any AI to generate a hire manifest. It pins
// the exact JSON shape the importer accepts and ends with a fill-in section so the
// user adds their own details (item 7). Kept in sync with the HireManifest schema
// (src/shared/hire.ts) — provider allowlist is claude | codex | antigravity | cursor.

// The Add Agent form has 11+ fields, so it's grouped into sections the user jumps
// between via a left sidebar index (one section shown at a time). Engine carries
// Command (it's the spawn command assembled from provider+model+flags); Workspace
// clusters Folder + Git isolation + Resume (all "where/how it runs"). Capabilities
// isn't a field here — it rides an imported hire manifest (the pinned banner).
const SECTIONS: { key: SectionKey; labelKey: string; hintKey: string }[] = [
  { key: 'identity',  labelKey: 'addAgent.sections.identity.label',  hintKey: 'addAgent.sections.identity.hint' },
  { key: 'workspace', labelKey: 'addAgent.sections.workspace.label', hintKey: 'addAgent.sections.workspace.hint' },
  { key: 'engine',    labelKey: 'addAgent.sections.engine.label',    hintKey: 'addAgent.sections.engine.hint' },
  { key: 'briefing',  labelKey: 'addAgent.sections.briefing.label',  hintKey: 'addAgent.sections.briefing.hint' },
  { key: 'desk',      labelKey: 'addAgent.sections.desk.label',      hintKey: 'addAgent.sections.desk.hint' }
];

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

function uniqueId(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
}

export interface AddAgentModalProps {
  onClose: () => void;
  config: HarnessConfig;
  /** Lift config changes (e.g. a project registered from this modal) back up to
   *  App so the rest of the UI — and the next time this modal opens — sees them. */
  onConfigChange?: (config: HarnessConfig) => void;
}

export function AddAgentModal({ onClose, config, onConfigChange }: AddAgentModalProps) {
  const { t: tr } = useTranslation();
  const rtl = useRtl();
  const addAgent = useStore(s => s.addAgent);
  // Faces already on the floor. A character is one agent's identity, so
  // offering a face that is already working reads as "add a second Zoro" and
  // gives you two agents nothing on screen can tell apart.
  const takenCharacters = useStore(s => new Set(s.agents.map(a => a.character)));
  // Deep links and file batches share one FIFO. The head alone seeds the form;
  // every item still requires an explicit spawn or skip.
  const hireQueue = useStore(s => s.hireQueue);
  const enqueuePendingHires = useStore(s => s.enqueuePendingHires);
  const finishPendingHire = useStore(s => s.finishPendingHire);
  const pendingHire = hireQueue.pending[0];
  const reviewProgress = hireQueueProgress(hireQueue);

  // Any non-empty string is a valid character now: a cast key draws that cast
  // member, anything else draws a face generated from the string.
  const knownCharacter = (c?: string): string => (c && c.trim() ? c : DEFAULT_CHARACTER);
  // A named token, a custom '#rrggbb', or the default.
  const knownAccent = (a?: string): string =>
    (a && (a.startsWith('#') || ACCENTS.includes(a as AccentColorName)) ? a : DEFAULT_ACCENT);
  /** The cast member a typed name refers to, if any.
   *
   *  The character tiles already set the name (clicking Nami names the agent
   *  Nami), but the coupling ran ONE WAY, so typing "Nami" left the
   *  avatar on whatever was selected, in practice the Jim default. Same missing
   *  default as issue #191 from the other direction, where a manifest that omits
   *  `character` always lands on Jim.
   *
   *  Returns null on no match, and the caller leaves the avatar alone, so a
   *  deliberate pick is never overwritten by continuing to type. */
  const characterForName = (n: string): OfficeCharacterName | null => {
    const q = n.trim().toLowerCase();
    if (!q) return null;
    const hit = OFFICE_CAST.find(c => c.displayName.toLowerCase() === q || c.name === q);
    return hit ? hit.name : null;
  };
  /** The locally-built spawn command for a manifest: provider preset + model
   *  from the LOCAL config builder, with the manifest's validated flags
   *  appended. A manifest can never name the binary itself. */
  const hireCommand = (m: HireManifest): string => {
    const prov: AgentProvider = m.provider ?? inferAgentProvider(config.defaultCommand);
    const base = buildSpawnCommand(config, m.model, prov);
    return m.commandFlags?.length ? `${base} ${m.commandFlags.join(' ')}` : base;
  };

  // Default provider follows whatever the global default command is (claude
  // unless the user reconfigured it); the model only carries over for Claude.
  // The engine chosen for this workspace during setup. `godProvider` is what
  // that step writes; the default command is the fallback for a config that
  // predates it.
  const initialProvider = config.godProvider ?? inferAgentProvider(config.defaultCommand);
  // Opus 4.8 · 1M unless the workspace says otherwise: the long-context model is
  // the one worth defaulting to for an agent that will run unattended.
  const initialModel = isClaudeProvider(initialProvider)
    ? (config.defaultModel
        ?? providerPreset(initialProvider).recommendedWorkerModel
        ?? providerPreset(initialProvider).recommendedOrchestratorModel)
    : undefined;

  // Empty, not a suggested name: the name is the one thing only you know.
  const [name, setName] = useState(pendingHire?.name ?? '');
  // '' means nothing picked yet. The default is DERIVED rather than seeded into
  // state: the roster hydrates after mount, so a useState initialiser reads an
  // empty floor and would offer Atlas even when an agent already wears it.
  const atlasFree = !useStore(s => s.agents.some(a => a.character === 'michael'));
  const [character, setCharacter] = useState<string>(pendingHire?.character ?? '');
  // A face you clicked wins; otherwise the name draws itself; and with neither,
  // an empty dialog shows Atlas while no agent wears it. Atlas last, not first:
  // it was overriding the typed name, so the face never followed what you were
  // typing.
  // NO FALLBACK. Choosing a face is a step, not a default: anything automatic
  // here has to pick for you, and every version of that has gone wrong — the
  // typed name became a character id that named no face, then a hash landed on
  // faces already on the floor. Empty until you choose, and the dialog will not
  // move on. (Atlas is the one exception, and only while nothing is wearing it.)
  const effectiveCharacter = character || (atlasFree ? 'michael' : '');
  /** Typed name first, else the persona of the face that is showing. Removing
   *  the name field would otherwise make it possible to reach Hire with nothing
   *  to call the agent, and no field on screen to fix it. */
  const effectiveName = name.trim()
    || LIBRARY_BY_ID[effectiveCharacter]?.name
    || OFFICE_CAST.find(c => c.name === effectiveCharacter)?.displayName
    || '';
  /** Atlas, then the whole library. Step 1 IS the picker now, so the roster
   *  view (crew only) went with the popup that needed it. */
  const faceChoices: { id: string; name: string; note?: string; locked?: boolean }[] = [
    // Locked: it is the orchestrator's own face. Shown rather than hidden, so
    // "where is Atlas" has a visible answer.
    { id: 'michael', name: 'Atlas', note: tr('addAgent.faceReserved'), locked: true },
    ...AVATAR_LIBRARY.map((f) => ({ id: f.id, name: f.name })),
  ];
  const faceId = effectiveCharacter;
  /** Step 1 is done when a face has been PICKED and a name typed. `character`
   *  rather than `effectiveCharacter`: the latter falls back to Atlas or to the
   *  name, so it is never empty and would wave you through with nothing chosen. */
  const identityReady = character.length > 0 && name.trim().length > 0;
  const [accent, setAccent] = useState<string>(knownAccent(pendingHire?.accent));
  const [cwd, setCwd] = useState<string>(config.registeredRepos[0] ?? '');
  // Local mirror of the registered projects so one added from here shows as a
  // quick-pick immediately (the `config` prop is a snapshot taken at open time).
  const [repos, setRepos] = useState<string[]>(config.registeredRepos);
  /** Each registered project AND the repos inside it. A container folder like
   *  Ethara-VMS holds three, and offering only the container meant an agent for
   *  vms-backend could not be pointed at vms-backend. */
  const [tree, setTree] = useState<ProjectEntry[]>([]);
  useEffect(() => {
    void window.cth.projectTree?.().then(setTree).catch(() => setTree([]));
  }, [repos]);
  /** The list to render: the scan when we have it, the flat registered list
   *  until then, so the picker is never empty while it loads. */
  const choices: ProjectEntry[] = tree.length
    ? tree
    : repos.map((r) => ({ path: r, name: r.split('/').filter(Boolean).pop() ?? r, isRepo: true }));
  /** Does the chosen folder have git in it? A folder that is not a repository
   *  has no branch to work on, and main already degrades `isolate` to "work in
   *  place" for one (spawnAgentCore gates the worktree on isRepo). So the
   *  checkbox below was promising an own copy and an own branch that the spawn
   *  quietly dropped — the ordinary case for a folder of documents. null while
   *  unknown (nothing picked, or the probe has not answered), which reads as
   *  "allowed" so the control never flickers shut on a slow answer. */
  const [cwdIsRepo, setCwdIsRepo] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const path = cwd.trim();
    if (!path) { setCwdIsRepo(null); return; }
    void window.cth.gitIsRepo(path).then(
      (ok) => { if (!cancelled) setCwdIsRepo(ok); },
      () => { if (!cancelled) setCwdIsRepo(null); }
    );
    return () => { cancelled = true; };
  }, [cwd]);
  /** Isolation is only a real offer when there is a repo to branch from. */
  const canIsolate = cwdIsRepo !== false;

  /** Step 2 is done when a folder is chosen. Without this the Next button waved
   *  you past an empty picker — on a workspace with no projects registered, the
   *  step showed "No projects yet", let you walk all the way to Hire, and only
   *  then bounced you back here with "Pick a folder first". The gate belongs on
   *  the step that owns the answer. */
  const workspaceReady = cwd.trim().length > 0;
  const [provider, setProvider] = useState<AgentProvider>(pendingHire?.provider ?? initialProvider);
  const [model, setModel] = useState<string | undefined>(
    pendingHire ? pendingHire.model : initialModel
  );
  const [command, setCommand] = useState(
    pendingHire ? hireCommand(pendingHire) : buildSpawnCommand(config, initialModel, initialProvider)
  );
  /** Auto mode per agent, starting from the workspace's answer. The command is
   *  built from it, so the flag never has to be typed. */
  const [auto, setAuto] = useState<boolean>(config.autoMode !== false);
  const setAutoMode = (next: boolean) => {
    setAuto(next);
    setCommand(buildSpawnCommand({ ...config, autoMode: next }, model, provider));
  };
  const [description, setDescription] = useState(pendingHire?.description ?? '');
  /** Who already has which desk, so the picker can grey them and the default can
   *  skip them. */
  const deskOccupants = useStore((s) => {
    const out: Record<string, string> = {};
    for (const a of s.agents) if (a.seat) out[a.seat] = a.name;
    return out;
  });
  /** Pre-selected: the first desk nobody is sitting at. The step still lets you
   *  change it, but "wherever there is room" is what most agents want and this
   *  shows WHERE that is instead of leaving it a surprise. */
  // A lead sits in a side office rather than the open floor, and the hive tells
  // it to run a sub-team instead of doing the work itself. It was only settable
  // by hiring first and editing afterwards — two steps for a decision you have
  // already made by the time you are naming the agent.
  const [isLead, setIsLead] = useState(false);
  const [seat, setSeat] = useState(
    () => DESK_MAP.desks.find((d) => !deskOccupants[d.name])?.name ?? ''
  );
  const [hireMeta, setHireMeta] = useState<HireManifest | null>(pendingHire);

  // Picking a model rebuilds the command; the command field stays editable for
  // power users (it's the source of truth for the actual spawn).
  const pickModel = (id?: string) => {
    setModel(id);
    setCommand(buildSpawnCommand({ ...config, autoMode: auto }, id, provider));
  };
  // Switching provider resets the model to that CLI's default and rebuilds the
  // command from the provider's preset binary (so Antigravity spawns `agy` and
  // Codex spawns `codex`, not the configured `claude`). For 'custom' we keep the
  // user's typed command rather than blanking it.
  const preset = providerPreset(provider);
  // The goal is assembled from three questions rather than typed into a blank
  // box. "Goal (optional)" told a first-time user nothing, so goals came out
  // empty or one vague line; these ask for the parts that actually make an
  // agent behave: its loop, what finished means, and when to interrupt you.
  const [jobText, setJobText] = useState('');
  const [doneText, setDoneText] = useState(DEFAULT_DONE);
  /** A hire manifest arrives with a goal already written; keep it verbatim
   *  rather than trying to take it apart. */
  const [rawGoal, setRawGoal] = useState(pendingHire?.goal ?? '');
  // Composed in shared/agentBrief so Edit Agent can take it apart again and
  // show the same three questions. Two copies of this format would drift, and
  // the drift would silently cost the human a section of their briefing.
  const composedGoal = rawGoal.trim() || composeBrief({
    job: jobText,
    project: cwd ? basename(cwd) : undefined,
    done: doneText
  });
  const [isolate, setIsolate] = useState(pendingHire?.isolate ?? false);
  // #2 — optional Claude session id to continue. When set, the spawn seeds that
  // session's transcript into the cwd's project dir and launches `--resume`.
  const [resumeSessionId, setResumeSessionId] = useState('');
  const resuming = resumeSessionId.trim().length > 0;
  // Note shown when the folder was auto-filled from the pasted session id.
  const [folderNote, setFolderNote] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  // Which config section the left sidebar index is showing.
  const [section, setSection] = useState<SectionKey>('identity');
  // SIMPLE MODE — the Engine step (provider, model id, spawn command, auto flag)
  // is four answers the workspace already gave at setup. Its state is still
  // seeded from those, so what actually spawns is unchanged.
  const simpleMode = useStore((s) => s.simpleMode);
  const visibleSections = SECTIONS.filter((x) => sectionsFor(simpleMode).includes(x.key));
  /** What each section must have before the one after it opens. Engine and
   *  briefing ask for nothing: the command is prefilled from the provider and
   *  validated on submit, and a briefing is optional. */
  const sectionReady: Record<SectionKey, boolean> = {
    identity: identityReady,
    workspace: workspaceReady,
    engine: true,
    // An agent with no description is a face; one with no job waits to be told
    // everything. Both, or Next refuses — this is the step that decides whether
    // the agent can work unattended.
    //
    // The job is read from whichever field is on screen: an imported hire edits
    // its goal verbatim (`rawGoal`), everyone else answers "what is its job"
    // (`jobText`) and the goal is composed from it. Checking rawGoal alone —
    // which is what this did first — blocked Next for every agent added by hand.
    briefing: description.trim().length > 0
      && (pendingHire ? rawGoal.trim().length > 0 : jobText.trim().length > 0),
    desk: true
  };
  /** May this section be opened? Only once every section before it is answered.
   *  The rail used to be a way around the Next button's gate; now both read this. */
  const canOpen = (key: SectionKey): boolean => canOpenSection(sectionReady, key, visibleSections.map((x) => x.key));
  /** Why Next is refusing, in the words of the step that is refusing. */
  const blockedReason = (key: SectionKey): string | undefined =>
    sectionReady[key] ? undefined
      : key === 'identity' ? tr('addAgent.pickFirst')
      : key === 'workspace' ? tr('addAgent.errFolder')
      : key === 'briefing' ? tr('addAgent.errBriefing')
      : undefined;
  const sectionIndex = Math.max(0, visibleSections.findIndex((x) => x.key === section));
  // "Generate a hire with AI" helper — reveals a copy-paste prompt (item 7).

  // Close only the modal on Esc. Capture prevents the fullscreen terminal's
  // window-level handler from also closing the view underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Zero-step resume: when a session id is entered, look up the cwd it originally
  // ran in (from the transcript) and pre-fill the Folder so the user doesn't have
  // to find the worktree. They can still override the folder afterwards. Runs on
  // blur so we don't hit the resolver on every keystroke.
  const resolveFolderFromSession = async () => {
    const sid = resumeSessionId.trim();
    if (!sid) { setFolderNote(undefined); return; }
    const resolved = await window.cth.resolveSessionCwd(sid);
    if (resolved) { setCwd(resolved); setFolderNote(tr('addAgent.folderFromSession', { path: resolved })); }
    else setFolderNote(undefined);
  };


  /** Register `path` as a project (folder quick-pick) right now: dedupe-prepend,
   *  select it, persist to config, and lift the change up so it sticks. */
  const registerProject = async (path: string) => {
    const p = path.trim();
    if (!p) return;
    const next = [p, ...repos.filter((r) => r !== p)];
    setRepos(next);
    setCwd(p);
    try {
      const updated = await window.cth.updateConfig({ registeredRepos: next });
      // Main expands `~` when it persists registeredRepos, so adopt the stored
      // (absolute) list — otherwise a typed "~/dev/foo" stays literal in this
      // modal's state and rides along into the spawn.
      const stored = updated.registeredRepos ?? next;
      setRepos(stored);
      if (stored[0]) setCwd(stored[0]);
      onConfigChange?.(updated);
    } catch { /* best-effort persist */ }
  };

  /** Pick a brand-new folder and register it as a project in one step. */
  const [addingProject, addProject] = useNativeDialog(async () => {
    setError(undefined);
    const res = await window.cth.chooseFolder();
    if (res.ok) await registerProject(res.path);
    else if (res.error !== 'cancelled') setError(res.error);
  });

  /** Apply an imported manifest to every form field (file import path). The
   *  command is rebuilt locally from the provider preset + validated flags — a
   *  manifest can never inject the spawn binary. Import never spawns. */
  const applyManifest = (m: HireManifest) => {
    setHireMeta(m);
    setName(m.name);
    // A manifest that names an agent but omits `character` should get the
    // matching avatar rather than the Jim default (issue #191).
    setCharacter(m.character ? knownCharacter(m.character) : (characterForName(m.name ?? '') ?? ''));
    setAccent(knownAccent(m.accent));
    setProvider(m.provider ?? initialProvider);
    setModel(m.model);
    setCommand(hireCommand(m));
    setDescription(m.description ?? '');
    setRawGoal(m.goal ?? '');
    setIsolate(m.isolate ?? false);
    setResumeSessionId('');
    setFolderNote(undefined);
    setSection('identity');
  };

  // Advancing a batch keeps this modal mounted. Re-seed every form field when
  // the queue head changes so edits made while reviewing one hire cannot leak
  // into the next.
  useLayoutEffect(() => {
    if (pendingHire) applyManifest(pendingHire);
  // applyManifest intentionally closes over the config snapshot used by this
  // open modal; queue advances do not replace that snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHire]);

  const advanceHireReview = () => {
    const next = hireQueue.pending[1];
    // The pendingHire effect re-seeds every form field from the new queue head.
    finishPendingHire();
    if (!next) onClose();
  };


  const skipHire = () => {
    if (!pendingHire) return;
    setError(undefined);
    advanceHireReview();
  };

  const submit = async () => {
    setError(undefined);
    // One face per agent, so the library IS the headcount. Checked here as well
    // as on the tiles: a face can be taken between opening this dialog and
    // pressing Hire, and the auto-assigned one would then silently duplicate.
    if (takenCharacters.size >= MAX_AGENTS) { setError(tr('addAgent.floorFull', { max: MAX_AGENTS })); return; }
    if (!effectiveCharacter) { setError(tr('addAgent.pickFirst')); setSection('identity'); return; }
    if (takenCharacters.has(effectiveCharacter)) {
      setError(tr('addAgent.faceTaken')); setSection('identity'); return;
    }
    // A required field can live in a section the user hasn't opened, so jump to
    // the offending section as we surface the error — the field is never hidden.
    if (!effectiveName) { setError(tr('addAgent.errName')); setSection('identity'); return; }
    if (!cwd) { setError(tr('addAgent.errFolder')); setSection('workspace'); return; }
    if (!command.trim()) { setError(tr('addAgent.errCommand')); setSection('engine'); return; }

    setBusy(true);
    const id = uniqueId(name);
    const ptyId = `pty-${id}`;
    // Split the editable command field into argv-style pieces for node-pty.
    // Quote-aware so an agy model label like "Gemini 3.1 Pro (High)" — or any
    // auto-mode flags appended to the command — stays one argument.
    const [exe, ...args] = tokenizeCommand(command.trim());
    const spawnRes = await window.cth.spawnPty({
      id: ptyId,
      cwd,
      command: exe,
      provider,
      args,
      cols: 100,
      rows: 30,
      // When set, the main process spawns this agent in its own git worktree.
      // Forced OFF when resuming a session — `--resume` needs the real cwd's
      // transcript, not a fresh worktree with a different (empty) project dir.
      // Never ask for a worktree main cannot make: a non-repo folder gets
      // "work in place", which is what the checkbox above now says too.
      isolate: resuming || !canIsolate || simpleMode ? false : isolate,
      // #2 — continue an existing Claude session in this agent's cwd.
      resumeSessionId: resuming ? resumeSessionId.trim() : undefined,
      // Provision this agent in the hive (memory + mailbox + identity/protocol).
      hive: {
        id,
        name: name.trim(),
        provider,
        cwd,
        role: description.trim() || undefined,
        isLead,
        // The hive keeps its own copy of these — see AgentMeta. A crash that
        // takes the renderer's roster must not take the agent's briefing.
        goal: composedGoal.trim() || undefined,
        character: effectiveCharacter,
        accent,
        seat: seat || undefined,
        // A hire manifest may carry validated capability tags (routing hints).
        capabilities: hireMeta?.capabilities
      }
    });
    if (!spawnRes.ok) {
      setBusy(false);
      setError(spawnRes.error ?? 'spawn failed');
      return;
    }
    // #2 — the requested resume session id wasn't found anywhere; main fell back
    // to a fresh session. Don't block the spawn, but make it visible.
    if (resuming && spawnRes.resumeNotFound) {
      console.warn(`[add-agent] resume session "${resumeSessionId.trim()}" not found — started a fresh session`);
    }

    // Main expands `~` at ingestion and echoes back the absolute path it actually
    // spawned into — record THAT, so this agent's cwd matches the hive registry
    // (and survives a restart, where nothing re-expands it).
    const spawnedCwd = spawnRes.cwd || cwd;
    // With git isolation the agent RUNS in its own worktree, but its PROJECT is
    // still the folder the user picked. Labelling the agent with the worktree's
    // name was the visible half; the damaging half was promoting that worktree
    // into registeredRepos below, which turned the project quick-picks into a
    // list of throwaway worktrees. Mirrors the `isolate` sent to main, which is
    // forced off while resuming.
    const projectCwd = (!resuming && isolate) ? cwd.trim() : spawnedCwd;
    const agent: Agent = {
      id,
      name: effectiveName,
      // Whatever the dialog has been showing, and always a real face id.
      character: effectiveCharacter,
      accent,
      // The desk chosen on the last step. Free-seating (an empty value) keeps the
      // old behaviour, and a desk taken since this dialog opened falls back the
      // same way rather than double-seating.
      seat: seat || undefined,
      description: description.trim() || 'a fresh harness',
      isLead,
      project: basename(projectCwd),
      tmuxTarget: '',
      cwd: spawnedCwd,
      goal: composedGoal.trim() || undefined,
      status: 'idle',
      action: resuming && spawnRes.resumeNotFound ? 'session not found — fresh start' : 'starting up',
      progress: 0,
      currentStation: 'desk',
      ptyId,
      command: command.trim(),
      provider,
      model,
      // Persist the resolved worktree path (set only when isolation provisioned
      // one) so a restart can re-enter this exact worktree — see restoreTeam.
      worktreePath: spawnRes.worktreePath,
      // Crush (seedDelivery:'type-into-tui') hands its hive protocol back here
      // instead of on argv; useHive types it into the TUI after boot. (ondev-b)
      seedPrompt: spawnRes.seedPrompt,
      recentTextTs: Date.now()
    };
    addAgent(agent);
    // Remember the folder for the next hire: promote it to the front of the
    // registeredRepos quick-picks (the modal's default cwd) so back-to-back
    // hires land in the same project without re-picking.
    if (projectCwd && repos[0] !== projectCwd) {
      const nextRepos = [projectCwd, ...repos.filter((r) => r !== projectCwd && r !== cwd)];
      try {
        const updated = await window.cth.updateConfig({ registeredRepos: nextRepos });
        onConfigChange?.(updated);
      } catch { /* best-effort */ }
    }
    // A hire manifest may carry a per-agent token budget — apply it to the
    // latest agentTokenCaps map in main. Await it before advancing a batch: the
    // next hire reuses this mounted modal and must not race a stale config write.
    if (hireMeta?.tokenCap) {
      try {
        const updated = await window.cth.setAgentTokenCap(id, hireMeta.tokenCap);
        onConfigChange?.(updated);
      } catch { /* best-effort */ }
    }
    setBusy(false);
    if (pendingHire) {
      advanceHireReview();
    } else {
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(17, 20, 26, 0.5)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // Must sit above fullscreen terminal/file overlays (250/280) and their
        // hover popovers. The fullscreen Add Agent button uses this same modal.
        zIndex: 500
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 1040, maxWidth: '96vw' }}>
        <PixelPanel
          variant="dialog"
          title={tr('addAgent.title')}
          onClose={onClose}
          closeLabel={tr('common.cancel')}
          style={{ padding: 16 }}
          noPadding
        >
          {/* Sectioned config with a left sidebar index. The form has 11+ fields,
              so they're grouped into 4 sections (Identity / Workspace / Engine /
              Briefing) shown one at a time; the sidebar jumps between them. The
              hire-import review banner, the error, and the footer stay pinned
              around the section pane. maxHeight keeps the dialog within the
              viewport (title bar stays pinned). */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, maxHeight: '90vh', overflowY: 'auto' }}>
            {hireMeta && (
              <div style={{
                padding: '10px 16px',
                background: 'var(--cth-lemon-light)',
                borderRadius: 'var(--cth-radius-card)',
                fontSize: 13,
                color: 'var(--cth-ink-900)',
                display: 'flex', flexDirection: 'column', gap: 2
              }}>
                <span>
                  {tr('addAgent.hireImported')} <strong>{hireMeta.name}</strong>
                  {hireMeta.author ? <> · {tr('addAgent.byAuthor', { author: hireMeta.author })}</> : null}
                  {reviewProgress ? <> · {tr('addAgent.hireProgress', { current: reviewProgress.current, total: reviewProgress.total })}</> : null}
                </span>
                <span>{tr('addAgent.reviewFields')}</span>
                {hireMeta.commandFlags && hireMeta.commandFlags.length > 0 && (
                  <span style={{ display: 'flex', gap: 4, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 2 }}>
                    <span style={{ fontSize: 13 }}>{tr('addAgent.hireFlags')}</span>
                    {hireMeta.commandFlags.map((f, i) => (
                      <code
                        key={`${f}-${i}`}
                        style={{
                          fontFamily: 'var(--cth-font-mono)',
                          fontSize: 13,
                          padding: '0 4px',
                          background: 'var(--cth-coral-light)',
                          boxShadow: 'inset 0 0 0 1px var(--cth-coral)', borderRadius: 'var(--cth-radius-input)',
                          color: 'var(--cth-ink-900)'
                        }}
                      >
                        {f}
                      </code>
                    ))}
                  </span>
                )}
                {hireMeta.skills && hireMeta.skills.length > 0 && (
                  <span style={{ display: 'flex', gap: 4, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 2 }}>
                    <span style={{ fontSize: 13 }}>{tr('addAgent.hireSkills')}</span>
                    {hireMeta.skills.map((s) => (
                      <code
                        key={s}
                        style={{
                          fontFamily: 'var(--cth-font-mono)',
                          fontSize: 13,
                          padding: '0 4px',
                          background: 'var(--cth-mint-light)',
                          boxShadow: 'inset 0 0 0 1px var(--cth-mint)', borderRadius: 'var(--cth-radius-input)',
                          color: 'var(--cth-ink-900)'
                        }}
                      >
                        {s}
                      </code>
                    ))}
                  </span>
                )}
                {hireMeta.mcpServers && hireMeta.mcpServers.length > 0 && (() => {
                  const safe = hireMeta.mcpServers!.filter(
                    (id) => MCP_CATALOG.find((e) => e.id === id)?.tier === 'safe-readonly'
                  );
                  const consent = hireMeta.mcpServers!.filter(
                    (id) => MCP_CATALOG.find((e) => e.id === id)?.tier !== 'safe-readonly'
                  );
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                      {safe.length > 0 && (
                        <span style={{ display: 'flex', gap: 4, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13 }}>{tr('addAgent.mcpSafe')}:</span>
                          {safe.map((id) => (
                            <code key={id} style={{
                              fontFamily: 'var(--cth-font-mono)', fontSize: 13, padding: '0 4px',
                              background: 'var(--cth-sky-light)',
                              boxShadow: 'inset 0 0 0 1px var(--cth-sky)', borderRadius: 'var(--cth-radius-input)',
                              color: 'var(--cth-ink-900)'
                            }}>{id}</code>
                          ))}
                        </span>
                      )}
                      {consent.length > 0 && (
                        <span style={{ display: 'flex', gap: 4, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13 }}>{tr('addAgent.mcpConsent')}:</span>
                          {consent.map((id) => (
                            <code key={id} style={{
                              fontFamily: 'var(--cth-font-mono)', fontSize: 13, padding: '0 4px',
                              background: 'var(--cth-coral-light)',
                              boxShadow: 'inset 0 0 0 1px var(--cth-coral)', borderRadius: 'var(--cth-radius-input)',
                              color: 'var(--cth-ink-900)'
                            }}>{id}</code>
                          ))}
                          <span style={{ fontSize: 11, color: 'var(--cth-ink-700)' }}>
                            {tr('addAgent.mcpEnableInSettings')}
                          </span>
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* sidebar index + the active section's fields */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {/* LEFT — section index. Capabilities isn't a nav item: it isn't a
                  user field, it rides the imported hire manifest (banner above). */}
              <nav style={{ width: 186, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {visibleSections.map((s, i) => {
                  const active = section === s.key;
                  return (
                    <button
                      key={s.key}
                      // The rail was a way around the Next button's gate: jump
                      // straight to Briefing and Hire was reachable with no face
                      // chosen at all. Both now read one readiness table.
                      disabled={!canOpen(s.key)}
                      onClick={() => setSection(s.key)}
                      style={{
                        textAlign: 'left', padding: '10px 12px', border: 'none',
                        cursor: canOpen(s.key) ? 'pointer' : 'not-allowed',
                        opacity: canOpen(s.key) ? 1 : 0.45,
                        borderRadius: 'var(--cth-radius-btn)',
                        background: active ? 'var(--cth-lilac-light)' : 'var(--cth-cream-100)',
                        boxShadow: active ? 'inset 0 0 0 1.5px var(--cth-lilac)' : 'none',
                        display: 'flex', flexDirection: 'column', gap: 3,
                        transition: 'background 120ms ease, box-shadow 120ms ease, opacity 120ms ease'
                      }}
                    >
                      <span style={{
                        fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13, lineHeight: '16px',
                        color: active ? 'var(--cth-lilac-text)' : 'var(--cth-ink-900)',
                        display: 'flex', alignItems: 'center', gap: 8
                      }}>
                        <span style={{
                          width: 18, height: 18, flexShrink: 0, borderRadius: '50%',
                          display: 'grid', placeItems: 'center',
                          fontSize: 11, fontWeight: 700,
                          color: active ? '#fff' : 'var(--cth-ink-500)',
                          background: active ? 'var(--cth-lilac)' : 'var(--cth-paper-100)'
                        }}>{i + 1}</span>
                        {tr(s.labelKey)}
                      </span>
                      <span style={{
                        fontFamily: 'var(--cth-font-ui)', fontSize: 11.5, lineHeight: '15px',
                        // Same rule as the Edit dialog: this rail is a tinted
                        // surface, where ink-400 measured 4.13:1.
                        color: 'var(--cth-ink-600)', paddingInlineStart: 26
                      }}>{tr(s.hintKey)}</span>
                    </button>
                  );
                })}
              </nav>

              {/* RIGHT — the active section's fields. A FIXED height, not a
                  minimum: the four sections hold very different amounts of
                  field, so a pane that sized to its content made the dialog
                  jump every time you moved between steps. One box, same size
                  on all four; a section taller than the box scrolls inside it. */}
              <div className="cth-scrollpane" style={{ flex: 1, minWidth: 0, height: 440, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {section === 'identity' && (
                  <>
                    {/* Always editable. Picking a face fills it, and you can
                        type over that: the face suggests a name, it does not
                        own one. */}
                    <Row label={tr('addAgent.name')}>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={tr('addAgent.namePlaceholder')}
                        style={inputStyle}
                      />
                    </Row>

                    <Row label={tr('addAgent.character')}>
                      {/* Every face, side by side, rather than one box that
                          opens a picker: you are choosing between them, so they
                          belong next to each other. Taken ones stay visible and
                          dimmed, since a missing tile only looks like a shorter
                          list. */}
                      <div className="cth-scrollpane" style={{
                        display: 'flex', gap: 8, flexWrap: 'wrap',
                        maxHeight: 344, overflowY: 'auto',
                        padding: 8, background: 'var(--cth-cream-100)',
                        borderRadius: 'var(--cth-radius-card)'
                      }}>
                        {faceChoices.map((f) => {
                          const active = effectiveCharacter === f.id;
                          const used = f.locked || (takenCharacters.has(f.id) && !active);
                          return (
                            <button
                              key={f.id}
                              disabled={used}
                              // Picking names it too, overwriting what was
                              // there, so the field always matches the face.
                              onClick={() => { setCharacter(f.id); setName(f.name); }}
                              aria-pressed={active}
                              style={{
                                width: 66, padding: '5px 4px 6px', border: 'none',
                                cursor: used ? 'not-allowed' : 'pointer',
                                borderRadius: 'var(--cth-radius-btn)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                background: active ? 'var(--cth-lilac-light)' : 'var(--cth-paper-100)',
                                boxShadow: active
                                  ? 'inset 0 0 0 2px var(--cth-lilac)'
                                  : 'inset 0 0 0 1px var(--cth-ink-100)',
                                opacity: used ? 0.45 : 1,
                                transition: 'background 120ms ease, box-shadow 120ms ease'
                              }}
                            >
                              <span style={{
                                width: 54, height: 66, display: 'flex', alignItems: 'flex-end',
                                justifyContent: 'center', overflow: 'hidden',
                                borderRadius: 'calc(var(--cth-radius-btn) - 3px)',
                                background: 'var(--cth-cream-100)'
                              }}>
                                <SpritePortrait character={f.id} scale={3} />
                              </span>
                              <span style={{
                                fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11.5, lineHeight: '14px',
                                color: active ? 'var(--cth-lilac-text)' : 'var(--cth-ink-900)'
                              }}>{f.name}</span>
                              <span style={{
                                fontSize: 11, lineHeight: '12px',
                                color: used ? 'var(--cth-coral-text)' : 'var(--cth-ink-500)'
                              }}>{f.note ?? (used ? tr('addAgent.faceInUse') : '')}</span>
                            </button>
                          );
                        })}
                      </div>
                    </Row>

                    {!identityReady && (
                      <div style={{ fontSize: 13, color: 'var(--cth-ink-500)' }}>
                        {!character ? tr('addAgent.pickFace') : tr('addAgent.pickName')}
                      </div>
                    )}

                    <Row label={tr('addAgent.color')}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {ACCENTS.map(a => (
                          <button
                            key={a}
                            onClick={() => setAccent(a)}
                            aria-label={a}
                            aria-pressed={accent === a}
                            style={{
                              width: 34, height: 34, padding: 0,
                              display: 'grid', placeItems: 'center',
                              borderRadius: 'var(--cth-radius-btn)',
                              background: `var(--cth-${a})`,
                              boxShadow: accent === a
                                ? `0 0 0 2px var(--cth-paper-100), 0 0 0 4px var(--cth-${a})`
                                : 'inset 0 0 0 1px var(--cth-ink-300)',
                              color: 'var(--cth-on-accent)',
                              fontSize: 15, lineHeight: 1,
                              cursor: 'pointer', border: 'none'
                            }}
                          >{accent === a ? <Icon name="check" /> : null}</button>
                        ))}

                        {/* Anything outside the twelve. The native colour input
                            is the whole feature: a hand-rolled picker would be
                            worse and bigger. A custom accent is stored as the
                            hex itself, which every accent consumer now accepts. */}
                        <label
                          style={{
                            width: 34, height: 34, display: 'grid', placeItems: 'center',
                            cursor: 'pointer', position: 'relative',
                            borderRadius: 'var(--cth-radius-btn)',
                            background: accent.startsWith('#') ? accent : 'var(--cth-cream-100)',
                            boxShadow: accent.startsWith('#')
                              ? `0 0 0 2px var(--cth-paper-100), 0 0 0 4px ${accent}`
                              : 'inset 0 0 0 1px var(--cth-ink-300)',
                            color: accent.startsWith('#') ? 'var(--cth-on-accent)' : 'var(--cth-ink-700)',
                            fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13
                          }}
                        >
                          <Icon name={accent.startsWith('#') ? 'check' : 'plus'} />
                          <input
                            type="color"
                            value={accent.startsWith('#') ? accent : DEFAULT_ACCENT_HEX}
                            onChange={(e) => setAccent(e.target.value)}
                            style={{
                              position: 'absolute', inset: 0, opacity: 0,
                              width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0
                            }}
                          />
                        </label>
                      </div>
                    </Row>

                  </>
                )}

                {section === 'workspace' && (
                  <>
                    <Row
                      label={tr('addAgent.project')}
                      action={(
                        <PixelButton
                          variant="secondary"
                          size="sm"
                          onClick={() => { void addProject(); }}
                          disabled={addingProject}
                          title={tr('addAgent.addProjectTitle')}
                        >
                          <Icon name="folder" /> {tr('addAgent.addProject')}
                        </PixelButton>
                      )}
                    >
                      {/* The projects registered to this workspace, listed by
                          name, plus one button to add a folder that is not on
                          the list yet. The free-text path box is still gone: a
                          folder is CHOSEN from the OS picker and registered, so
                          a typo cannot become an agent's working directory. */}
                      {repos.length === 0 ? (
                        <div style={{
                          padding: '16px 12px', fontSize: 13, textAlign: 'center',
                          color: 'var(--cth-ink-500)', borderRadius: 'var(--cth-radius-card)',
                          border: '1px dashed var(--cth-ink-300)'
                        }}>
                          {tr('addAgent.noProjects')}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {choices.map((entry) => {
                            const r = entry.path;
                            const active = cwd === r;
                            return (
                              <button
                                key={r}
                                onClick={() => setCwd(r)}
                                aria-pressed={active}
                                className="cth-choice"
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 12,
                                  // A repo found inside a registered folder is
                                  // indented under it, so the list reads as a
                                  // tree rather than five unrelated folders.
                                  padding: '12px 14px', marginLeft: entry.parent ? 20 : 0,
                                  border: 'none', cursor: 'pointer',
                                  textAlign: 'left', borderRadius: 'var(--cth-radius-card)',
                                  background: active ? 'var(--cth-lilac-light)' : 'var(--cth-paper-100)',
                                  boxShadow: active
                                    ? 'inset 0 0 0 2px var(--cth-lilac)'
                                    : 'inset 0 0 0 1px var(--cth-ink-100)',
                                  transition: 'background 120ms ease, box-shadow 120ms ease'
                                }}
                              >
                                <span style={{
                                  width: 30, height: 30, flexShrink: 0, display: 'grid', placeItems: 'center',
                                  borderRadius: 'var(--cth-radius-btn)',
                                  background: active ? 'var(--cth-paper-100)' : 'var(--cth-cream-100)',
                                  color: active ? 'var(--cth-lilac-text)' : 'var(--cth-ink-500)'
                                }}>
                                  <Icon name="folder" />
                                </span>
                                <span style={{
                                  flex: 1, minWidth: 0,
                                  fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13.5, lineHeight: '18px',
                                  color: active ? 'var(--cth-lilac-text)' : 'var(--cth-ink-900)'
                                }}>
                                  {entry.name}
                                  {/* A repo inside a registered folder. Saying
                                      which folder it came from is what stops
                                      three same-named repos reading as three
                                      unrelated projects. */}
                                  {entry.parent && (
                                    <span style={{
                                      marginLeft: 8, fontWeight: 500, fontSize: 11.5,
                                      color: 'var(--cth-ink-500)'
                                    }}>in {entry.parent.split('/').filter(Boolean).pop()}</span>
                                  )}
                                  {!entry.isRepo && (
                                    <span style={{
                                      marginLeft: 8, fontWeight: 500, fontSize: 11.5,
                                      color: 'var(--cth-ink-500)'
                                    }}>{tr('addAgent.notARepo')}</span>
                                  )}
                                </span>
                                {active && (
                                  <span style={{
                                    fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
                                    color: 'var(--cth-lilac-text)', background: 'var(--cth-paper-100)'
                                  }}>{tr('addAgent.assigned')}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </Row>

                    {/* Not a checkbox in a row of checkboxes. This is the
                        setting that decides whether you can run four agents at
                        once, so it gets the room to say so.

                        Gone in simple mode: a worktree and a branch cannot be
                        explained to someone who does not use git, and the
                        folders that mode is built for — documents, not repos —
                        cannot have one anyway. `isolate` stays false there. */}
                    {!simpleMode && (
                    <label style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14,
                      cursor: resuming || !canIsolate ? 'not-allowed' : 'pointer',
                      opacity: resuming || !canIsolate ? 0.5 : 1,
                      borderRadius: 'var(--cth-radius-card)',
                      background: isolate && !resuming && canIsolate ? 'var(--cth-mint-light)' : 'var(--cth-cream-100)',
                      boxShadow: isolate && !resuming && canIsolate ? 'inset 0 0 0 2px var(--cth-mint)' : 'none',
                      transition: 'background 120ms ease, box-shadow 120ms ease'
                    }}>
                      <input
                        type="checkbox"
                        checked={resuming || !canIsolate ? false : isolate}
                        disabled={resuming || !canIsolate}
                        onChange={(e) => setIsolate(e.target.checked)}
                        style={{
                          width: 17, height: 17, marginTop: 2, flexShrink: 0,
                          accentColor: 'var(--cth-mint)',
                          cursor: resuming || !canIsolate ? 'not-allowed' : 'pointer'
                        }}
                      />
                      <span style={{ minWidth: 0 }}>
                        <span style={{
                          display: 'block', fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
                          fontSize: 13.5, lineHeight: '19px', marginBottom: 4
                        }}>{tr('addAgent.gitIsolation')}</span>
                        <span style={{
                          display: 'block', fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink-700)'
                        }}>{tr('addAgent.gitIsolationDesc')}</span>
                        <span style={{
                          display: 'block', fontSize: 13, lineHeight: '18px', marginTop: 6,
                          color: 'var(--cth-ink-500)'
                        }}>{!canIsolate
                          ? tr('addAgent.gitIsolationNoRepo')
                          : isolate ? tr('addAgent.gitIsolationOn') : tr('addAgent.gitIsolationOff')}</span>
                      </span>
                    </label>
                    )}
                  </>
                )}

                {section === 'engine' && (
                  <>
                    {/* The workspace picked its engine during setup, so this is
                        a statement rather than a choice: twelve options here
                        invited an agent that runs on something the workspace is
                        not set up for. Change it in Settings, once, and every
                        agent follows. */}
                    <Row label={tr('addAgent.provider')}>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
                        padding: '8px 12px',
                        background: 'var(--cth-cream-100)',
                        borderRadius: 'var(--cth-radius-btn)'
                      }}>
                        <ProviderLogo provider={provider} size={16} />
                        <span style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 13, color: 'var(--cth-ink-900)' }}>
                          {providerPreset(provider).label}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--cth-ink-500)' }}>
                          {tr('addAgent.providerFixed')}
                        </span>
                      </div>
                    </Row>

                    {preset.supportsModel && <Row label={tr('addAgent.model')}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(() => {
                          // An imported hire may name a model newer than this picker's
                          // hardcoded list (e.g. claude-fable-5). Surface it as a real,
                          // selected card instead of leaving the picker looking unset —
                          // the command field already carries it either way.
                          const known = modelsForProvider(provider);
                          return model && !known.some((m) => m.id === model)
                            ? [...known, { id: model, label: tr('addAgent.fromHire', { model }) }]
                            : known;
                        })().map((m) => {
                          const active = (model ?? '') === (m.id ?? '');
                          return (
                            <button
                              key={m.label}
                              onClick={() => pickModel(m.id)}
                              style={{
                                height: 32, padding: '0 14px',
                                display: 'inline-flex', alignItems: 'center',
                                borderRadius: 'var(--cth-radius-btn)',
                                background: active ? 'var(--cth-lilac-light)' : 'var(--cth-cream-100)',
                                boxShadow: active ? 'inset 0 0 0 1.5px var(--cth-lilac)' : 'none',
                                fontFamily: 'var(--cth-font-ui)', fontSize: 12.5,
                                fontWeight: active ? 600 : 500,
                                color: active ? 'var(--cth-lilac-text)' : 'var(--cth-ink-700)',
                                cursor: 'pointer', border: 'none',
                                transition: 'background 120ms ease, color 120ms ease'
                              }}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </Row>}

                    {/* OSS-model quick-picks (ondev-c) — local + third-party-provider
                        shortlists from the verified catalog. Clicking sets the
                        engine-correct slug (OpenCode `local/<tag>`, Crush/pi
                        `ollama/<tag>`; provider slugs are identical across engines)
                        and rebuilds the command. */}
                    {hasOssQuickPicks(provider) && (
                      <Row label={tr('addAgent.ossModels')}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div>
                            <div style={ossGroupHead}>{tr('addAgent.ossLocal')}</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {OSS_LOCAL_PICKS.map((p) => {
                                const slug = localSlugFor(provider, p.tag);
                                const active = (model ?? '') === slug;
                                return (
                                  <button
                                    key={p.tag}
                                    onClick={() => pickModel(slug)}
                                    style={ossChip(active)}
                                  >
                                    {p.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <div style={ossGroupHead}>{tr('addAgent.ossByok')}</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {OSS_PROVIDER_PICKS.map((p) => {
                                const active = (model ?? '') === p.slug;
                                return (
                                  <button
                                    key={p.slug}
                                    onClick={() => pickModel(p.slug)}
                                    style={ossChip(active)}
                                  >
                                    {p.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </Row>
                    )}

                    {(provider === 'opencode' || provider === 'crush' || provider === 'pi' || provider === 'qwen') && (
                      <div style={{ fontSize: 13, color: 'var(--cth-ink-500)', lineHeight: '16px', margin: '2px 0 6px' }}>
                        {tr('addAgent.byokNote')}
                      </div>
                    )}

                    {/* The spawn command used to be a text field here, which
                        asked a first-time user to know what
                        `--permission-mode bypassPermissions` means. The one
                        decision inside it is this checkbox; the rest is built. */}
                    <label style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14,
                      cursor: preset.autoFlag ? 'pointer' : 'not-allowed',
                      opacity: preset.autoFlag ? 1 : 0.55,
                      borderRadius: 'var(--cth-radius-card)',
                      background: auto && preset.autoFlag ? 'var(--cth-mint-light)' : 'var(--cth-cream-100)',
                      boxShadow: auto && preset.autoFlag ? 'inset 0 0 0 2px var(--cth-mint)' : 'none',
                      transition: 'background 120ms ease, box-shadow 120ms ease'
                    }}>
                      <input
                        type="checkbox"
                        checked={preset.autoFlag ? auto : false}
                        disabled={!preset.autoFlag}
                        onChange={(e) => setAutoMode(e.target.checked)}
                        style={{
                          width: 17, height: 17, marginTop: 2, flexShrink: 0,
                          accentColor: 'var(--cth-mint)',
                          cursor: preset.autoFlag ? 'pointer' : 'not-allowed'
                        }}
                      />
                      <span style={{ minWidth: 0 }}>
                        <span style={{
                          display: 'block', fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
                          fontSize: 13.5, lineHeight: '19px', marginBottom: 4
                        }}>{tr('addAgent.autoTitle')}</span>
                        <span style={{
                          display: 'block', fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink-700)'
                        }}>{tr(preset.autoFlag ? 'addAgent.autoDesc' : 'addAgent.autoNotSupported')}</span>
                      </span>
                    </label>

                    {/* Still typed in the two cases where the app cannot build
                        it: your own CLI, and an import carrying its own flags. */}
                    {(provider === 'custom' || pendingHire) && (
                      <Row label={tr(pendingHire ? 'addAgent.commandHire' : 'addAgent.commandShown')}>
                        <input
                          value={command}
                          onChange={(e) => setCommand(e.target.value)}
                          placeholder={provider === 'custom' ? 'your-agent-cli' : 'claude'}
                          style={{ ...inputStyle, fontFamily: 'var(--cth-font-mono)' }}
                        />
                      </Row>
                    )}
                  </>
                )}

                {section === 'briefing' && (
                  <>
                    <Question q={tr('addAgent.description')} hint={tr('addAgent.descriptionHint')}>
                      <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={tr('addAgent.descriptionPlaceholder')}
                        style={{ ...inputStyle, height: 40, fontSize: 14 }}
                      />
                    </Question>

                    {rawGoal.trim() ? (
                      <Question q={tr('addAgent.jobLabel')} hint={tr('addAgent.jobHint')}>
                        <textarea
                          dir={rtl ? 'auto' : undefined}
                          value={rawGoal}
                          onChange={(e) => setRawGoal(e.target.value)}
                          rows={8}
                          style={{
                            ...inputStyle, height: 'auto', minHeight: 170, padding: 12,
                            fontFamily: 'var(--cth-font-ui)', fontSize: 14, lineHeight: '20px',
                            resize: 'vertical'
                          }}
                        />
                      </Question>
                    ) : (
                      <>
                        <Question q={tr('addAgent.jobLabel')} hint={tr('addAgent.jobHint')}>
                          <textarea
                            dir={rtl ? 'auto' : undefined}
                            value={jobText}
                            onChange={(e) => setJobText(e.target.value)}
                            placeholder={tr('addAgent.jobPlaceholder')}
                            rows={6}
                            style={{
                              ...inputStyle, height: 'auto', minHeight: 128, padding: 12,
                              fontFamily: 'var(--cth-font-ui)', fontSize: 14, lineHeight: '20px',
                              resize: 'vertical'
                            }}
                          />
                        </Question>

                        <Question q={tr('addAgent.doneLabel')} hint={tr('addAgent.doneHint')}>
                          <input
                            value={doneText}
                            onChange={(e) => setDoneText(e.target.value)}
                            style={{ ...inputStyle, height: 40, fontSize: 14 }}
                          />
                        </Question>
                      </>
                    )}

                  </>
                )}

                {section === 'desk' && (
                  <>
                  <Question q={tr('addAgent.deskQ')} hint={tr('addAgent.deskHint')}>
                    <DeskPicker value={seat} occupants={deskOccupants} onChange={setSeat} scale={14} />
                  </Question>
                  {/* Asked here because it IS a seating question as much as a
                      role one: a lead takes a side office. It also changes what
                      the hive tells the agent — run a sub-team, do not do the
                      work yourself — which is why it cannot wait for a later
                      edit: the prompt is built at spawn. */}
                  <Question q={tr('addAgent.leadQ')} hint={tr('addAgent.leadHint')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Switch on={isLead} label={tr('addAgent.leadQ')} onChange={() => setIsLead((v) => !v)} />
                      <span style={{ fontSize: 13, color: 'var(--cth-ink-500)' }}>
                        {isLead ? tr('addAgent.leadOn') : tr('addAgent.leadOff')}
                      </span>
                    </div>
                  </Question>
                  </>
                )}
              </div>
            </div>

            {error && (
              <div style={{
                padding: '10px 16px',
                background: 'var(--cth-coral-light)',
                borderRadius: 'var(--cth-radius-card)',
                boxShadow: 'inset 0 0 0 1px var(--cth-coral)',
                fontSize: 13,
                color: 'var(--cth-ink-900)'
              }}>
                {error}
              </div>
            )}

            {/* The sections are a sequence, so the footer walks it: Back and Next
                until the last one — the desk — and Hire only there. The rail stays clickable, so
                an imported hire (every field already filled) can still be sent
                straight from section 1 by jumping to Briefing. */}
            <div style={{
              display: 'flex', gap: 10, justifyContent: 'flex-end',
              marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--cth-ink-100)'
            }}>
              {pendingHire && (
                <PixelButton variant="secondary" size="md" onClick={skipHire} disabled={busy}>{tr('addAgent.skipHire')}</PixelButton>
              )}
              <PixelButton variant="secondary" size="md" onClick={onClose} disabled={busy}>{tr('common.cancel')}</PixelButton>
              {sectionIndex > 0 && (
                <PixelButton variant="secondary" size="md" onClick={() => setSection(visibleSections[sectionIndex - 1].key)} disabled={busy}>
                  {tr('common.back')}
                </PixelButton>
              )}
              {sectionIndex < visibleSections.length - 1 ? (
                <PixelButton
                  variant="primary"
                  size="md"
                  style={{ minWidth: 110 }}
                  onClick={() => setSection(visibleSections[sectionIndex + 1].key)}
                  disabled={busy || !sectionReady[section]}
                  title={blockedReason(section)}
                >
                  {tr('addAgent.next')}
                </PixelButton>
              ) : (
                <PixelButton variant="primary" size="md" style={{ minWidth: 110 }} onClick={submit} disabled={busy}>
                  {busy ? tr('addAgent.spawning') : tr('addAgent.spawn')}
                </PixelButton>
              )}
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--cth-paper-100)',
  border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
  borderRadius: 'var(--cth-radius-btn)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 13.5,
  lineHeight: '20px',
  color: 'var(--cth-ink-900)',
  outline: 'none',
  boxSizing: 'border-box'
};

/** A briefing question. The 8px display caps the rest of the form uses are a
 *  field NAME; these are sentences you have to read, so they get the UI font at
 *  a readable size and the hint sits directly under them at one step down. */
function Question({ q, hint, children }: { q: string; hint: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontFamily: 'var(--cth-font-ui)', fontSize: 14, fontWeight: 700,
        lineHeight: '19px', color: 'var(--cth-ink-900)'
      }}>{q}</span>
      <span style={{
        fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, lineHeight: '17px',
        color: 'var(--cth-ink-500)', marginBottom: 4
      }}>{hint}</span>
      {children}
    </label>
  );
}

/** A labelled field. `action` puts one control on the label's own line, right
 *  side — for the row whose action is about the list rather than about any one
 *  item in it. A row with an action is a <div>, not a <label>: a button inside a
 *  label is activated by every click on the label, which is not what a control
 *  sitting beside the title should do. */
function Row({ label, action, children }: {
  label: string; action?: React.ReactNode; children: React.ReactNode
}) {
  const head = (
    <span style={{
      fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
      fontSize: 12, lineHeight: '14px',
      color: 'var(--cth-ink-600)',
    }}>{label}</span>
  );
  if (!action) {
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {head}
        {children}
      </label>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 26 }}>
        {head}
        <span style={{ flex: 1 }} />
        {action}
      </div>
      {children}
    </div>
  );
}
