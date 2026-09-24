import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { Icon } from './Icon';
import { PtyTerminalView } from './PtyTerminalView';

/**
 * Sign back in to Claude Code without leaving Atlas.
 *
 * When the CLI's credentials expire, an agent still SPAWNS — the binary is
 * there, the PTY opens, and then the TUI sits on "Not logged in · Please run
 * /login" and does nothing. Nothing in the app noticed, so the only way out was
 * a terminal outside it and a restart by hand (2026-09-23: fifteen agents stuck
 * behind a token that had expired the day before).
 *
 * Mirrors UpdateToast: self-subscribing, mounted once in App, renders null
 * while signed in. It is a dialog rather than a corner toast for the same
 * reason the update is — nothing else on screen can proceed until it is
 * answered, and a 340px card in the corner reads as ignorable.
 *
 * The sign-in runs in a REAL terminal inside the dialog rather than behind a
 * spinner: `claude auth login` opens a browser and waits, it can fail, and the
 * only honest way to show that is to show it. Main owns the script and the
 * respawn of whatever was blocked; this is the window onto it.
 */
export function AuthLoginDialog() {
  const { t } = useTranslation();
  const [loggedIn, setLoggedIn] = useState(true);   // assume fine until told otherwise
  const [ptyId, setPtyId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Pull once: this window may have mounted after main's last push, and the
    // poll is a minute wide.
    void window.cth.authCurrent?.()
      .then((s) => { if (alive) setLoggedIn(s.loggedIn); })
      .catch(() => { /* older main, or not ready — assume signed in */ });
    const off = window.cth.onAuthStatus?.((s) => {
      if (!alive) return;
      setLoggedIn(s.loggedIn);
      // Signed in again: the terminal has done its job and the agents behind
      // it are already being respawned by main.
      if (s.loggedIn) { setPtyId(null); setStarting(false); setError(null); }
    });
    return () => { alive = false; off?.(); };
  }, []);

  if (loggedIn) return null;

  const start = async (): Promise<void> => {
    setStarting(true);
    setError(null);
    try {
      const res = await window.cth.authLogin();
      if (res.ok && res.ptyId) setPtyId(res.ptyId);
      else setError(res.error ?? t('authLogin.failed'));
    } catch (e) {
      setError(String(e));
    }
    setStarting(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 460,
      background: 'color-mix(in srgb, var(--cth-ink-900) 52%, transparent)',
      backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
    }}>
      <div style={{ width: ptyId ? 860 : 520, maxWidth: '94vw', display: 'flex' }}>
        <PixelPanel variant="dialog" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', color: 'var(--cth-status-blocked)' }}>
              <Icon name="bell" />
            </span>
            <span style={{
              fontFamily: 'var(--cth-font-ui)', fontSize: 16, fontWeight: 600,
              color: 'var(--cth-ink-900)'
            }}>{t('authLogin.title')}</span>
          </div>

          <div style={{
            fontFamily: 'var(--cth-font-ui)', fontSize: 13.5, lineHeight: '20px',
            color: 'var(--cth-ink-700)'
          }}>{ptyId ? t('authLogin.running') : t('authLogin.body')}</div>

          {ptyId && (
            // The real flow, not a progress bar. It opens a browser and waits,
            // and when it fails it says why on this screen.
            <div style={{ height: 380, display: 'flex', minHeight: 0 }}>
              <PtyTerminalView ptyId={ptyId} label={t('authLogin.terminalLabel')} />
            </div>
          )}

          {error && (
            <div style={{
              padding: '9px 12px', borderRadius: 'var(--cth-radius-input)',
              background: 'var(--cth-coral-light)', color: 'var(--cth-coral-text)',
              fontFamily: 'var(--cth-font-ui)', fontSize: 13
            }}>{error}</div>
          )}

          {!ptyId && (
            <div style={{ display: 'flex', gap: 8 }}>
              <PixelButton onClick={() => void start()} disabled={starting}>
                {starting ? t('authLogin.starting') : t('authLogin.signIn')}
              </PixelButton>
            </div>
          )}
        </PixelPanel>
      </div>
    </div>
  );
}
