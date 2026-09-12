import { PixelPanel } from '@/components/PixelPanel';
import { useTranslation } from 'react-i18next';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';

/**
 * Loader shown on the empty floor while the god agent is clocking in on
 * launch. Replaces the "add agent" prompt so a returning user doesn't see the
 * empty-floor call-to-action before god has booted.
 *
 * Rendered while `agentCount === 0` — before the store has god's live agent
 * object (and so before `agent.name` exists anywhere to read) — so this reads
 * the persisted name directly, the same way useHive.ts's spawn effect does,
 * rather than assuming the default.
 */
export function MichaelBooting() {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none'
    }}>
      <div style={{ pointerEvents: 'auto', width: 360 }}>
        <PixelPanel variant="dialog" title={t('michaelBooting.title')} noPadding>
          <div style={{
            padding: 20,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16
          }}>
            {/* Three dots in the brand, not four dark-red blocks with a hard
                shadow: this is the first thing a returning user sees. */}
            <div style={{ display: 'flex', gap: 7 }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--cth-lilac)',
                    animation: 'cth-boot-pulse 1.1s ease-in-out infinite',
                    animationDelay: `${i * 0.16}s`
                  }}
                />
              ))}
            </div>
            <p style={{
              margin: 0, fontSize: 13, lineHeight: '20px', textAlign: 'center',
              color: 'var(--cth-ink-600)'
            }}>
              {t('michaelBooting.line', { godName })}
            </p>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}
