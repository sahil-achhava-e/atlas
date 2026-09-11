import { useEffect, useState, type CSSProperties } from 'react';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { AVATAR_LIBRARY } from '@/scene/office/avatarLibrary';
import { SpritePortrait } from './SpritePortrait';
import { ProviderLogo } from './ProviderLogo';
import { useStore, type Agent } from '@/store/store';
import { type AccentColorName } from '@/design/tokens';
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
/** Atlas first, then the library — the same order Add agent shows. */
const FACES: { id: string; name: string }[] = [
  { id: 'michael', name: 'Atlas' },
  ...AVATAR_LIBRARY.map((f) => ({ id: f.id, name: f.name }))
];

export function EditAgentModal({ agent, onClose }: EditAgentModalProps) {
  const updateAgent = useStore((s) => s.updateAgent);
  const [config, setConfig] = useState<HarnessConfig | null>(null);

  const [name, setName] = useState(agent.name);
  const [character, setCharacter] = useState<string>(agent.character);
  const [accent, setAccent] = useState<string>(agent.accent);
  const [provider, setProvider] = useState<AgentProvider>(
    inferAgentProvider(agent.command, agent.provider)
  );
  const [model, setModel] = useState<string | undefined>(agent.model);
  const [description, setDescription] = useState(agent.description);
  const [goal, setGoal] = useState(agent.goal ?? '');

  useEffect(() => {
    void window.cth.getConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  // Keep form in sync when the selected agent changes while the modal is open.
  useEffect(() => {
    setName(agent.name);
    setCharacter(agent.character);
    setAccent(agent.accent);
    setProvider(inferAgentProvider(agent.command, agent.provider));
    setModel(agent.model);
    setDescription(agent.description);
    setGoal(agent.goal ?? '');
  }, [agent.id]);

  const preset = providerPreset(provider);

  const save = () => {
    const trimmedName = name.trim() || agent.name;
    const trimmedDescription = description.trim() || 'a fresh harness';
    const trimmedGoal = goal.trim();
    const command = config
      ? buildSpawnCommand(config, model, provider)
      : agent.command;

    updateAgent(agent.id, {
      name: trimmedName,
      character,
      accent,
      provider,
      model,
      command,
      description: trimmedDescription,
      goal: trimmedGoal || undefined
    });
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(26, 19, 32, 0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 500
      }}
    >
      {/* Same box as Add Agent (940 / 95vw / 86vh). They are the two halves of
          one job — describe an agent — and a tall narrow dialog next to a wide
          one reads as two unrelated screens. */}
      <div onClick={(e) => e.stopPropagation()} style={{ width: 940, maxWidth: '95vw' }}>
        <PixelPanel variant="dialog" title="EDIT AGENT" style={{ padding: 16 }} noPadding>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 16,
            padding: 16, maxHeight: '86vh', overflowY: 'auto'
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
            <Section label="Identity" hint="name · character · color">
              <Row label="Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Stanley"
                  style={inputStyle}
                  autoFocus
                />
              </Row>

              <Row label="Character">
                <div style={{
                  display: 'flex', gap: 8, flexWrap: 'wrap',
                  maxHeight: 188, overflowY: 'auto', paddingRight: 4
                }}>
                  {/* The SAME thirty faces Add agent offers, plus Atlas — the two
                      panels used to draw from different libraries, so an agent
                      hired with one face could only be re-faced from the other.
                      Picking here changes the face and nothing else: the name
                      stays whatever you called it. */}
                  {FACES.map((c) => {
                    const active = character === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCharacter(c.id)}
                        style={{
                          padding: 4,
                          background: active ? `var(--cth-${accent}-light)` : 'var(--cth-cream-100)',
                          boxShadow: active
                            ? 'inset 0 0 0 1.5px var(--cth-ink-500)'
                            : 'inset 0 0 0 1px var(--cth-ink-100)',
                          cursor: 'pointer', border: 'none', width: 52,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2
                        }}
                      >
                        <div style={{
                          width: 40, height: 48,
                          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                          overflow: 'hidden'
                        }}>
                          <SpritePortrait character={c.id} scale={1.5} />
                        </div>
                        <span style={{
                          fontSize: 11, color: 'var(--cth-ink-700)',
                          maxWidth: 46, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>{c.name}</span>
                      </button>
                    );
                  })}
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
                        background: `var(--cth-${a})`,
                        // A halo in the swatch's OWN colour, not an ink ring:
                        // ink-900 flips to near-white in dark and vanished.
                        boxShadow: accent === a
                          ? `0 0 0 2px var(--cth-cream-50), 0 0 0 4px var(--cth-${a})`
                          : 'inset 0 0 0 1px var(--cth-ink-300)',
                        color: 'var(--cth-on-accent)',
                        fontSize: 14, lineHeight: 1,
                        cursor: 'pointer', border: 'none'
                      }}
                    >{accent === a ? '\u2713' : ''}</button>
                  ))}
                  <label
                    style={{
                      width: 30, height: 30, display: 'grid', placeItems: 'center',
                      cursor: 'pointer', position: 'relative',
                      background: accent.startsWith('#') ? accent : 'var(--cth-cream-200)',
                      boxShadow: accent.startsWith('#')
                        ? `0 0 0 2px var(--cth-cream-50), 0 0 0 4px ${accent}`
                        : 'inset 0 0 0 1px var(--cth-ink-300)',
                      color: accent.startsWith('#') ? 'var(--cth-on-accent)' : 'var(--cth-ink-700)',
                      fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 13
                    }}
                  >
                    {accent.startsWith('#') ? '\u2713' : '+'}
                    <input
                      type="color"
                      value={accent.startsWith('#') ? accent : '#F2685C'}
                      onChange={(e) => setAccent(e.target.value as AccentColorName)}
                      style={{
                        position: 'absolute', inset: 0, opacity: 0,
                        width: '100%', height: '100%', cursor: 'pointer', border: 'none', padding: 0
                      }}
                    />
                  </label>
                </div>
              </Row>
            </Section>

            <Section label="Engine" hint="provider · model · next restart">
              {/* One engine per workspace: the row states which, it does not
                  offer a choice. Re-pointing a single agent at a CLI this
                  workspace was never set up for is how you get an agent that
                  cannot start. Change it in Settings, once, and every agent
                  follows. */}
              <Row label="Provider">
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
                  padding: '12px 12px',
                  background: 'var(--cth-cream-100)',
                  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)'
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
                            padding: '10px 16px 5px',
                            background: active ? `var(--cth-${accent}-light)` : 'var(--cth-cream-100)',
                            boxShadow: active
                              ? 'inset 0 0 0 1.5px var(--cth-ink-500)'
                              : 'inset 0 0 0 1px var(--cth-ink-100)',
                            fontFamily: 'var(--cth-font-ui)', fontSize: 13,
                            color: 'var(--cth-ink-900)', cursor: 'pointer', border: 'none'
                          }}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </Row>
              )}

              <span style={{ fontSize: 13, color: 'var(--cth-ink-500)', lineHeight: '16px' }}>
                Engine changes are saved for the next restart. Use Command Center → Floor to restart a live session onto a new provider/model now.
              </span>
            </Section>

              </div>
              <div style={{ minWidth: 0 }}>
            <Section label="Briefing" hint="description · goal">
              <Row label="Description">
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="what is this agent for"
                  style={inputStyle}
                />
              </Row>

              <Row label="Goal (optional)">
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="long-running directive injected on every prompt"
                  rows={4}
                  style={{ ...inputStyle, fontFamily: 'var(--cth-font-ui)', resize: 'vertical', minHeight: 200 }}
                />
              </Row>
            </Section>
              </div>
            </div>

            {/* The footer is a floor, not another row: a rule above it and its
                own padding, so Save never floats against the last field. */}
            <div style={{
              display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end',
              marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--cth-ink-100)'
            }}>
              <span style={{ flex: 1, fontSize: 13, color: 'var(--cth-ink-500)' }}>
                Name, face and colour apply at once. Engine changes wait for the next restart.
              </span>
              <PixelButton variant="ghost" size="md" onClick={onClose}>cancel</PixelButton>
              <PixelButton variant="primary" size="md" onClick={save}>save changes</PixelButton>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 11px 12px',
  background: 'var(--cth-paper-100)',
  border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', borderRadius: 'var(--cth-radius-input)',
  fontFamily: 'var(--cth-font-ui)',
  fontSize: 14,
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
          fontFamily: 'var(--cth-font-ui)', fontWeight: 600,
          fontSize: 11, lineHeight: '12px',
          color: 'var(--cth-ink-900)',
        }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{hint}</span>
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
        fontSize: 11, lineHeight: '13px', letterSpacing: '.04em',
        color: 'var(--cth-ink-700)',
      }}>{label}</span>
      {children}
    </label>
  );
}
