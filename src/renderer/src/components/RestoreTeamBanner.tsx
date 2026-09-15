import { useStore, type Agent } from '@/store/store';
import { useRestoreTeam } from '@/hooks/useRestoreTeam';
import { PixelButton } from './PixelButton';
import { CloseIcon } from './TabIcons';
import type { HarnessConfig } from '@/store/config';
import { useTranslation } from 'react-i18next';

/**
 * Agents whose terminal did not survive, and the way back.
 *
 * When a PTY is gone — the app quit, the laptop slept, the renderer reloaded —
 * `reconcileWithLivePtys` moves those agents to `restorableAgents` rather than
 * deleting them, keeping the full spawn recipe. Something then has to offer them
 * back, and for a while nothing did: that UI lived in AgentStrip, which stopped
 * being rendered when the left panel was redesigned, and in FullscreenTerminal,
 * which is only mounted in focus mode. So outside focus mode an agent that died
 * simply vanished and never returned, while its recipe sat in localStorage.
 *
 * Mounted UNCONDITIONALLY from App and returning null when there is nothing to
 * restore, because the automatic restore lives in the hook: if the component
 * only rendered when it had something to show, the effect that does the
 * restoring would not be running when it was needed.
 */
export function RestoreTeamBanner({ config }: { config: HarnessConfig | null }) {
  const { t } = useTranslation();
  const { restoring, autoRestoring, restoreTeam } = useRestoreTeam(config);
  const restorableAgents = useStore((s) => s.restorableAgents);
  const busy = restoring || autoRestoring;

  if (!restorableAgents.length && !busy) return null;

  return (
    <div
      role="status"
      style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '8px 16px',
        background: 'var(--cth-lemon-light)',
        borderBottom: '1px solid var(--cth-ink-100)',
        fontFamily: 'var(--cth-font-ui)', fontSize: 13, lineHeight: '18px',
        color: 'var(--cth-ink-900)'
      }}
    >
      <span style={{ fontWeight: 600, flexShrink: 0 }}>
        {busy ? t('agentStrip.restoringTeam') : t('agentStrip.previousSession')}
      </span>

      {!busy && (
        <span className="cth-iconbar" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          {restorableAgents.map((a: Agent) => (
            <span
              key={a.id}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 2,
                padding: '0 2px 0 8px',
                background: 'var(--cth-cream-50)',
                boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
                borderRadius: 'var(--cth-radius-input)',
                fontSize: 12, lineHeight: '20px'
              }}
            >
              {a.name}
              <button
                onClick={() => useStore.getState().removeRestorableAgent(a.id)}
                data-label={t('agentStrip.dismissAria', { name: a.name })}
                aria-label={t('agentStrip.dismissAria', { name: a.name })}
                style={{
                  width: 18, height: 18, flexShrink: 0, padding: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  borderRadius: 'var(--cth-radius-btn)', color: 'var(--cth-ink-500)'
                }}
              >
                <CloseIcon size={11} />
              </button>
            </span>
          ))}
        </span>
      )}

      {!busy && (
        <span style={{ marginInlineStart: 'auto', flexShrink: 0 }}>
          <PixelButton size="sm" onClick={() => void restoreTeam()}>
            {t('agentStrip.restoreAll', { count: restorableAgents.length })}
          </PixelButton>
        </span>
      )}
    </div>
  );
}
