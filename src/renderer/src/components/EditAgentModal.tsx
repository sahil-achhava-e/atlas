import { useEffect, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { SpritePortrait } from './SpritePortrait';
import { ProviderLogo } from './ProviderLogo';
import { Switch } from './Switch';
import { DeskPicker } from './DeskPicker';
import { composeBrief, splitBrief } from '@shared/agentBrief';
import { useStore, type Agent } from '@/store/store';
import { type AccentColorName, DEFAULT_ACCENT_HEX } from '@/design/tokens';
import {
  type AgentProvider,
  type HarnessConfig,
  buildSpawnCommand,
  modelsForProvider,
  inferAgentProvider,
  providerPreset
} from '@/store/config';

// The same twelve Add agent offers, in hue order, plus a custom swatch. Six
// was not enough to tell a dozen agents apart, and two panels offering
// different palettes meant an agent's colour could not be reproduced.
const ACCENTS: AccentColorName[] = [
  'coral', 'rose', 'peach', 'lemon', 'olive', 'mint',
  'jade', 'sky', 'indigo', 'lilac', 'plum', 'slate',
];

export interface EditAgentModalProps {
  agent: Agent;
  onClose: () => void;
}

/**
 * Compact post-hire editor for Identity / Engine / Briefing. Mirrors the Add
 * Agent fields that matter after spawn; save only patches the durable roster
 * via updateAgent (engine changes apply on the next restart).
 */

export function EditAgentModal({ agent, onClose }: EditAgentModalProps) {
  const { t } = useTranslation();
  /** The orchestrator keeps its name and its face. Every other agent is a hire
   *  you named; this one IS the app on the floor — the mark, the header, the
   *  routes and every string that says "Atlas" follow it. */
  const fixedIdentity = !!agent.isGod;
  const updateAgent = useStore((s) => s.updateAgent);
  const [isLead, setIsLead] = useState(!!agent.isLead);
  const [seat, setSeat] = useState(agent.seat ?? '');
  /** Who already has which desk — everyone but this agent, so its own desk does
   *  not show as taken by itself. */
  const deskOccupants = useStore((s) => {
    const out: Record<string, string> = {};
    for (const a of s.agents) if (a.seat && a.id !== agent.id) out[a.seat] = a.name;
    return out;
  });
  const simpleMode = useStore((s) => s.simpleMode);
  const [config, setConfig] = useState<HarnessConfig | null>(null);

  const [name, setName] = useState(agent.name);
  const [accent, setAccent] = useState<string>(agent.accent);
  const [provider, setProvider] = useState<AgentProvider>(
    inferAgentProvider(agent.command, agent.provider)
  );
  const [model, setModel] = useState<string | undefined>(agent.model);
  const [description, setDescription] = useState(agent.description);
  /** The briefing, taken back apart into the three questions the hire dialog
   *  asked. A briefing that is not in that shape (pasted in whole, or from a
   *  hire manifest) comes back as `raw` and is edited as one box — guessing
   *  where to cut it would lose a paragraph. */
  const [brief, setBrief] = useState(() => splitBrief(agent.goal));
  const [goal, setGoal] = useState(agent.goal ?? '');
  const [jobText, setJobText] = useState(brief.job);
  const [doneText, setDoneText] = useState(brief.done ?? '');
  const structured = !brief.raw;
  /** What will be saved: recomposed from the parts, or the raw box as typed. */
  const nextGoal = structured
    ? composeBrief({ job: jobText, project: brief.project, done: doneText, ask: brief.ask })
    : goal;

  useEffect(() => {
    void window.cth.getConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  // Keep form in sync when the selected agent changes while the modal is open.
  useEffect(() => {
    setName(agent.name);
    setAccent(agent.accent);
    setProvider(inferAgentProvider(agent.command, agent.provider));
    setModel(agent.model);
    setDescription(agent.description);
    const next = splitBrief(agent.goal);
    setBrief(next);
    setGoal(agent.goal ?? '');
    setJobText(next.job);
    setDoneText(next.done ?? '');
  }, [agent.id]);

  const preset = providerPreset(provider);

  /** True once the picker holds a different model from the one this agent is
   *  actually running. That is the only case where restarting buys anything. */
  // Compared against the model the process is RUNNING, not the saved one: after
  // a Save without a restart the two differ, and comparing to the saved model
  // hid "Save and restart" for good (2026-09-24: Naruto saved as Sonnet, still
  // on Opus, and the dialog only offered Save).
  const [runningModel, setRunningModel] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void window.cth.listPtys().then((ptys) => {
      if (alive) setRunningModel(ptys.find((p) => p.id === agent.ptyId)?.model);
    }).catch(() => { /* fall back to the saved model below */ });
    return () => { alive = false; };
  }, [agent.ptyId]);
  const modelChanged = (model ?? '') !== (runningModel ?? agent.model ?? '');
  const canRestart = modelChanged && !!agent.ptyId;

  const saveAndRestart = (): void => {
    save();
    // The store now holds the new model; the panel reads it from there.
    window.dispatchEvent(new CustomEvent('cth:restart-agent', { detail: { id: agent.id } }));
  };

  const save = () => {
    const trimmedName = name.trim() || agent.name;
    const trimmedDescription = description.trim() || 'a fresh harness';
    const trimmedGoal = nextGoal.trim();
    const command = config
      ? buildSpawnCommand(config, model, provider)
      : agent.command;

    updateAgent(agent.id, {
      isLead,
      seat: seat || undefined,
      // Belt and braces: the fields are not rendered for the orchestrator, so
      // these can only hold what it already had — but a save must never be the
      // thing that renames Atlas.
      name: fixedIdentity ? agent.name : trimmedName,
      character: agent.character,
      accent,
      provider,
      model,
      command,
      description: trimmedDescription,
      goal: trimmedGoal || undefined
    });

    // Mirror the durable half into the hive. The renderer's roster can be lost
    // — a crash took one — and an agent that comes back without its briefing is
    // a different agent wearing the same name. Best-effort: a hive that refuses
    // must not fail the save the user just made.
    void window.cth.hivePatchAgentCard?.(agent.id, {
      goal: trimmedGoal,
      character: agent.character,
      accent,
      isLead,
      seat: seat || undefined
    })?.catch(() => { /* the store write already happened */ });
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        // Below the title bar, not over it: a dialog taller than the window was
        // running under the header with its own top edge unreachable.
        position: 'fixed', top: 'var(--cth-titlebar-h)', left: 0, right: 0, bottom: 0,
        background: 'rgba(17, 20, 26, 0.5)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, overflowY: 'auto',
        zIndex: 500
      }}
    >
      {/* Same box as Add Agent (940 / 95vw / 86vh). They are the two halves of
          one job — describe an agent — and a tall narrow dialog next to a wide
          one reads as two unrelated screens. */}
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 940, maxWidth: '100%', margin: 'auto',
        display: 'flex', flexDirection: 'column', maxHeight: '100%', minHeight: 0
      }}>
        <PixelPanel
          variant="dialog"
          title="Edit agent"
          onClose={onClose}
          closeLabel="Close"
          noPadding
          style={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '100%' }}
        >
          <div className="cth-scrollpane" style={{
            display: 'flex', flexDirection: 'column', gap: 16,
            padding: 16, overflowY: 'auto', minHeight: 0
          }}>
            {/* Two columns so the extra width is used rather than padded.
                Identity and Engine are short field lists; Briefing is free
                text and takes the taller side. minHeight keeps the dialog from
                collapsing into a wide thin strip on a small form. */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 16, alignItems: 'start', minHeight: 260
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            <Section label="Identity" hint="Name and face">
              <Row label="Name">
                {fixedIdentity ? (
                  <div style={{
                    ...inputStyle, display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--cth-cream-100)', boxShadow: 'none', color: 'var(--cth-ink-600)'
                  }}>
                    <span style={{ fontWeight: 600, color: 'var(--cth-ink-900)' }}>{agent.name}</span>
                    <span style={{ fontSize: 12 }}>{fixedNote}</span>
                  </div>
                ) : (
                  <input
                    className="cth-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Stanley"
                    style={inputStyle}
                    autoFocus
                  />
                )}
              </Row>

              {/* READ ONLY, for every agent. A face belongs to one agent and
                  cannot move: this dialog used to offer the full picker, which
                  meant an agent could be edited onto a face another was already
                  wearing — two identical agents by a different door than hiring.
                  Name, colour and goal are what this dialog changes. */}
              <Row label="Character">
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: 10,
                  borderRadius: 'var(--cth-radius-card)', background: 'var(--cth-cream-100)'
                }}>
                  <span style={{
                    width: 44, height: 52, display: 'flex', alignItems: 'flex-end',
                    justifyContent: 'center', overflow: 'hidden',
                    borderRadius: 'var(--cth-radius-btn)', background: 'var(--cth-paper-100)'
                  }}>
                    <SpritePortrait character={agent.character} scale={1.5} />
                  </span>
                  <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                    {fixedIdentity ? fixedNote : t('editAgent.faceFixed')}
                  </span>
                </div>
              </Row>


              <Row label="Color">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {ACCENTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAccent(a)}
                      aria-label={a}
                      aria-pressed={accent === a}
                      style={{
                        width: 30, height: 30, padding: 0,
                        display: 'grid', placeItems: 'center',
                        borderRadius: 'var(--cth-radius-btn)',
                        background: `var(--cth-${a})`,
                        // A halo in the swatch's OWN colour, not an ink ring:
                        // ink-900 flips to near-white in dark and vanished.
                        boxShadow: accent === a
                          ? `0 0 0 2px var(--cth-paper-100), 0 0 0 4px var(--cth-${a})`
                          : 'inset 0 0 0 1px var(--cth-ink-300)',
                        color: 'var(--cth-on-accent)',
                        fontSize: 14, lineHeight: 1,
                        cursor: 'pointer', border: 'none'
                      }}
                    >{accent === a ? <Icon name="check" /> : null}</button>
                  ))}
                  <label
                    style={{
                      width: 30, height: 30, display: 'grid', placeItems: 'center',
                      cursor: 'pointer', position: 'relative',
                      borderRadius: 'var(--cth-radius-btn)',
                      background: accent.startsWith('#') ? accent : 'var(--cth-cream-200)',
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
                      onChange={(e) => setAccent(e.target.value as AccentColorName)}
                      style={{
                        position: 'absolute', inset: 0, opacity: 0,
                        width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0
                      }}
                    />
                  </label>
                </div>
              </Row>

              {/* Desk. Hidden for Atlas: his cabin is reserved by the floor
                  (GOD_SEAT) and the arrival, errand and no-wander rules are all
                  written around it, so offering a choice would be offering
                  something nothing else honours. */}
              {!fixedIdentity && (
                <Row label="Desk">
                  <DeskPicker
                    value={seat}
                    occupants={deskOccupants}
                    onChange={setSeat}
                  />
                </Row>
              )}

            </Section>

              </div>
              <div style={{ minWidth: 0 }}>
            <Section label="Briefing" hint="What it does">
              <Row label="Description">
                <input
                  className="cth-input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="what is this agent for"
                  style={inputStyle}
                />
              </Row>

              {/* Team lead. Organisational, not hierarchical: it decides where the
                  agent SITS — the two side rooms are the leaders' offices, filled
                  a room at a time — and nothing about how work is routed. */}
              {!fixedIdentity && (
                <Row label="Team lead">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <Switch on={isLead} label="Team lead" onChange={() => setIsLead((v) => !v)} />
                    <span style={{ fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-500)' }}>
                      Sits in one of the two side offices. Four leads fill both; after that they take the boardroom.
                    </span>
                  </label>
                </Row>
              )}

              {structured ? (
                <>
                  {/* The same two questions the hire dialog asks, so what was
                      written under each is editable where it was written. They
                      used to be concatenated into one "Goal" box, and "When is
                      it finished?" looked like it had been thrown away. */}
                  <Row label="What does it do?">
                    <textarea
                      className="cth-input"
                      value={jobText}
                      onChange={(e) => setJobText(e.target.value)}
                      placeholder="The work it repeats, not one task. Added to every prompt it ever gets."
                      style={{ ...inputStyle, fontFamily: 'var(--cth-font-ui)', resize: 'vertical', minHeight: 200 }}
                    />
                  </Row>
                  <Row label="When is it finished?">
                    <textarea
                      className="cth-input"
                      value={doneText}
                      onChange={(e) => setDoneText(e.target.value)}
                      placeholder="What it hands you before it stops."
                      style={{ ...inputStyle, fontFamily: 'var(--cth-font-ui)', resize: 'vertical', minHeight: 72 }}
                    />
                  </Row>
                </>
              ) : (
                <Row label="Goal (optional)">
                  <textarea
                    className="cth-input"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="long-running directive injected on every prompt"
                    rows={4}
                    style={{ ...inputStyle, fontFamily: 'var(--cth-font-ui)', resize: 'vertical', minHeight: 200 }}
                  />
                </Row>
              )}
            </Section>
              </div>
            </div>

            {/* Engine spans the dialog: nine model pills in a half-width column
                wrapped into four ragged rows.

                Gone in simple mode, like the same step in Add agent: a provider
                and a model id are the workspace's answers, given once at setup.
                The agent keeps whatever it was given — nothing here is cleared,
                it is only not asked about. */}
            {!simpleMode && (
            <Section label="Engine" hint="Model, on next restart">
              {/* One engine per workspace: the row states which, it does not
                  offer a choice. Re-pointing a single agent at a CLI this
                  workspace was never set up for is how you get an agent that
                  cannot start. Change it in Settings, once, and every agent
                  follows. */}
              <Row label="Provider">
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
                    this workspace's engine
                  </span>
                </div>
              </Row>

              {preset.supportsModel && (
                <Row label="Model">
                  <div style={{ display: 'flex', gap: 8, rowGap: 8, flexWrap: 'wrap' }}>
                    {(() => {
                      const known = modelsForProvider(provider);
                      return model && !known.some((m) => m.id === model)
                        ? [...known, { id: model, label: `${model} (current)` }]
                        : known;
                    })().map((m) => {
                      const active = (model ?? '') === (m.id ?? '');
                      return (
                        <button
                          key={m.label}
                          type="button"
                          onClick={() => setModel(m.id)}
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
                </Row>
              )}

              <span style={{ fontSize: 12.5, color: 'var(--cth-ink-500)', lineHeight: 1.45 }}>
                {canRestart
                  ? t('editAgent.engineNoteRestart')
                  : t('editAgent.engineNote', { action: t('commandCenter.restartContinue') })}
                {' '}
                {/* Directions to a tab that shows only an icon are not
                    directions. The note opens it. */}
                <button
                  onClick={() => {
                    useStore.getState().requestCommandCenterTab('floor');
                    onClose();
                  }}
                  style={{
                    border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                    fontFamily: 'var(--cth-font-ui)', fontSize: 12.5, fontWeight: 600,
                    color: 'var(--cth-lilac-text)', textDecoration: 'underline',
                    textUnderlineOffset: 2
                  }}
                >{t('editAgent.openTeam', { tab: t('commandCenter.tabs.floor') })}</button>
              </span>
            </Section>
            )}


            {/* The footer is a floor, not another row: a rule above it and its
                own padding, so Save never floats against the last field. */}
            <div style={{
              display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end',
              marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--cth-ink-100)'
            }}>
              <span style={{ flex: 1, fontSize: 12.5, color: 'var(--cth-ink-500)', lineHeight: 1.45 }}>
                {fixedIdentity
                  ? 'Colour and briefing apply at once. Engine changes wait for the next restart.'
                  : 'Name, face and colour apply at once. Engine changes wait for the next restart.'}
              </span>
              <PixelButton variant="secondary" size="md" onClick={onClose}>Cancel</PixelButton>
              <PixelButton
                variant={canRestart ? 'secondary' : 'primary'}
                size="md"
                onClick={save}
              >{t('editAgent.save')}</PixelButton>
              {canRestart && (
                // A model change is the one edit that does nothing until the
                // agent restarts. Offering it here beats sending someone to
                // another tab to finish the thing they just did.
                <PixelButton variant="primary" size="md" onClick={saveAndRestart}>
                  {t('editAgent.saveAndRestart')}
                </PixelButton>
              )}
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

/** Why the orchestrator's name and face are not fields. */
const fixedNote = 'Atlas keeps its name and face.';

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--cth-paper-100)',
  border: 'none',
  borderRadius: 'var(--cth-radius-btn)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 13.5,
  lineHeight: '20px',
  color: 'var(--cth-ink-900)',
  outline: 'none',
  boxSizing: 'border-box'
};

function Section({
  label,
  hint,
  children
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--cth-font-ui)', fontWeight: 700,
          fontSize: 13, lineHeight: '16px',
          color: 'var(--cth-ink-900)',
        }}>{label}</span>
        {/* ink-600, not ink-400: this rail is a cream-200 surface, and the
            quietest step measured 4.13:1 on it. On a tinted surface the quiet
            text goes one step up. */}
        <span style={{ fontSize: 11.5, color: 'var(--cth-ink-600)' }}>{hint}</span>
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{
        fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
        fontSize: 12, lineHeight: '14px',
        color: 'var(--cth-ink-600)',
      }}>{label}</span>
      {children}
    </label>
  );
}
