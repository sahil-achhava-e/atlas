/**
 * Auto-update toast (v0.3.4) — the visual half of the background updater.
 *
 * Main's updater (src/main/updater.ts) downloads a new release in the
 * background and pushes ONE of two states over `update:status`:
 *   - 'downloaded'        → the update is staged; offer "restart to update".
 *   - 'available-manual'  → this install can't self-update (win-portable,
 *                           updater error); offer a link to the release page.
 *
 * Mirrors CompletionToast: self-contained + self-subscribing, mounted once in
 * App.tsx, renders nothing when idle. Installation is ALWAYS user-initiated —
 * "later" just hides the toast until the next app start (or the 6h re-check).
 *
 * ─── v0.4.4: "What's new" ───────────────────────────────────────────────────
 * Both states already carried `notes` (the GitHub release body) and the toast
 * dropped it on the floor, so the only notification this app ever raises said
 * nothing but a version number. It now renders a digest of that body —
 * summarizeReleaseNotes() in src/shared/releaseNotes.ts does the parsing, and
 * lives there rather than here so it can be unit-tested without a renderer.
 *
 * Three rules this block obeys:
 *   1. No notes, no block. A release body that is missing, empty, or pure
 *      structure yields an empty digest and the toast renders EXACTLY as it did
 *      before — no orphan heading, no shifted buttons. Most bodies are like
 *      that, so this is the common path, not the edge case.
 *   2. The notes are shown in full. They used to be clamped to a 96px scroller
 *      because this was a corner toast, which meant the first bullet was cut in
 *      half and the rest hidden behind a scrollbar nobody noticed. A dialog has
 *      the room, so the digest — already capped at ~280 chars — is simply shown.
 *
 * ─── A dialog, not a corner toast ───────────────────────────────────────────
 * An update is one of the two things this app asks for that cannot be answered
 * later by guessing (the other is a permission prompt): it restarts the app
 * under you. A 340px card in the corner, in the system font, with rounded
 * buttons, read as a browser notification — easy to ignore and not obviously
 * ours. It is centred now, over a dimmed floor, built from PixelPanel and
 * PixelButton so it is made of the same parts as every other dialog here.
 *
 * No new IPC and no new network call: "read more" reuses `updateOpenRelease`,
 * the same bridge the manual state's button has always used.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { PixelPanel } from '@/components/PixelPanel';
import { PixelButton } from '@/components/PixelButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useStore } from '@/store/store';
import { workingAgents, nameList, offerRestartInDialog } from '@/components/restartWarning';
import { summarizeReleaseNotes } from '@shared/releaseNotes';
import { extractDropHtml } from '@shared/releaseDrop';
import { ReleaseDrop } from '@/components/ReleaseDrop';
import type { UpdateStatus } from '@shared/updateState';

/** The toast is the LOUD half — it only interrupts for the two states a user has
 *  to act on. Everything else (checking, available, download progress, errors)
 *  lives quietly in the toolbar badge next to the logo. */
type ToastStatus = Extract<UpdateStatus, { state: 'downloaded' | 'available-manual' | 'just-updated' }>;

function toastable(s: UpdateStatus): ToastStatus | null {
  return s.state === 'downloaded' || s.state === 'available-manual' || s.state === 'just-updated' ? s : null;
}

const GITHUB_REPO_URL = 'https://github.com/sahilethara/atlas';
/** Only ever the `href` — the click is handled by `updateOpenRelease`, which
 *  resolves `undefined` to this same page in main. */
const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases/latest`;

export function UpdateToast() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ToastStatus | null>(null);
  const [busy, setBusy] = useState(false);
  /** The confirmation in front of the restart. Restarting kills every agent, so
   *  it is never one click away from a dialog the user did not open. */
  const [confirming, setConfirming] = useState(false);
  const agents = useStore((s) => s.agents);
  const working = workingAgents(agents);

  useEffect(() => window.cth.onUpdateStatus?.((next) => {
    const t = toastable(next);
    // A non-toastable state (a re-check, say) must not erase a toast the user
    // hasn't answered yet — only a new actionable state replaces it.
    if (t) setStatus(t);
  }), []);

  // Main may have emitted before this window existed (a downloaded update
  // from a previous session, or the dev-only MD_DROP_PREVIEW boot hook), and a
  // push nobody was listening to is gone. Pull the last status once on mount so
  // that state is not lost.
  useEffect(() => {
    let alive = true;
    void window.cth.updateCurrent?.().then((cur) => {
      const t = toastable(cur);
      if (alive && t) setStatus((prev) => prev ?? t);
    }).catch(() => { /* nothing to show */ });
    return () => { alive = false; };
  }, []);

  // Settings' hero card asks to re-open the release notes. This surface owns the
  // last status and the drop renderer, so it answers rather than duplicating
  // either. `updateCurrent()` is used instead of the remembered state because
  // "later" clears the local copy while main still holds it — dismissing a
  // release must not make it unreadable afterwards. With genuinely nothing to
  // show (a dev build, or an install already on the newest release) the honest
  // answer is the releases page, not an empty modal.
  useEffect(() => {
    const onShow = async () => {
      try {
        const cur = await window.cth.updateCurrent();
        const t = toastable(cur);
        if (t) { setStatus(t); return; }
      } catch { /* fall through to the page */ }
      void window.cth.updateOpenRelease();
    };
    window.addEventListener('cth:show-release-notes', onShow);
    return () => window.removeEventListener('cth:show-release-notes', onShow);
  }, []);

  const notes = useMemo(() => summarizeReleaseNotes(status?.notes), [status?.notes]);
  /** An authored <!-- drop --> block in the release body upgrades this whole
   *  moment from a corner toast to a centered release page. Absent (every
   *  release published so far), everything below behaves exactly as before —
   *  the digest path stays the default, not a fallback nobody exercises. */
  const dropHtml = useMemo(() => extractDropHtml(status?.notes), [status?.notes]);
  const version = status?.version ?? null;

  if (!status) return null;

  /** Close the notice FIRST, then ask main to quit and install. The quit path
   *  raises the kill-and-quit warning when agents are running, and leaving a
   *  "restarting…" notice on screen behind it just gives the user two things to
   *  read. (The warning outranking every modal is a separate fix — this one is
   *  about not asking two questions at once.) If main reports it could not quit,
   *  the notice comes back so the user can retry; a user CANCEL of the warning
   *  is not a failure, and the notice stays closed. */
  const restart = async () => {
    const prev = status;
    setBusy(true);
    setStatus(null);
    try {
      const res = await window.cth.updateRestartAndInstall();
      if (!res.ok) { setStatus(prev); setBusy(false); }
    } catch { setStatus(prev); setBusy(false); }
  };

  /** Same call the manual state's button makes: main resolves `undefined` to
   *  the releases page and refuses any URL outside this repo. */
  const openRelease = () => {
    void window.cth.updateOpenRelease(
      status.state === 'available-manual' ? (status.downloadUrl ?? status.url) : undefined
    );
  };
  /** True when the release carries an installer for THIS machine, so the button
   *  can promise a download rather than a page to go hunting on. */
  const hasDownload = status.state === 'available-manual' && !!status.downloadUrl;

  // An authored release: hand the whole moment to the centered drop instead of
  // the corner toast. Nothing is passed in but the content — the drop carries no
  // app buttons, and its own links go out through the OS browser.
  //
  // Restart-to-install is NOT lost with the button: autoInstallOnAppQuit is off,
  // so the update needs an explicit restart, and the title-bar UpdateBadge (and
  // Settings -> Updates) still offer it after this is dismissed.
  if (dropHtml && version) {
    return (
      <ReleaseDrop
        version={version}
        html={dropHtml}
        onDismiss={() => setStatus(null)}
      />
    );
  }
  // Freshly updated with nothing authored for this release: nothing to say.
  if (status.state === 'just-updated') return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={status.state === 'downloaded'
        ? `Update v${status.version} downloaded`
        : `Version ${status.version} is available`}
      onClick={(e) => { if (e.target === e.currentTarget) setStatus(null); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        display: 'grid', placeItems: 'center',
        // DESIGN.md §7.9: ink-900 at 60%, and NO blur. The floor stays legible
        // behind it, which is the point — this interrupts, it does not replace.
        background: 'color-mix(in srgb, var(--cth-ink-900) 60%, transparent)',
        padding: 24
      }}
    >
      <PixelPanel
        variant="dialog"
        style={{
          width: 'min(560px, 100%)',
          // Tall enough for a real set of notes; beyond that the dialog itself
          // scrolls, so nothing is ever cut off mid-bullet.
          maxHeight: 'min(72vh, 680px)',
          overflowY: 'auto',
          padding: 20,
          display: 'flex', flexDirection: 'column', gap: 12,
          fontFamily: 'var(--cth-font-ui)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="sparkle" />
          <span style={{ fontSize: 16, lineHeight: '22px', color: 'var(--cth-ink-900)', fontWeight: 700 }}>
            {status.state === 'downloaded'
              ? t('updateToast.downloadedTitle')
              : t('updateToast.availableTitle')}
          </span>
          {/* The version as a chip in the mono face: an identifier, not prose. */}
          <span style={{
            fontFamily: 'var(--cth-font-mono)', fontSize: 12, lineHeight: '16px',
            color: 'var(--cth-ink-700)',
            background: 'var(--cth-mint-light)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-200)',
            borderRadius: 'var(--cth-radius-input)',
            padding: '2px 7px'
          }}>v{status.version}</span>
        </div>
        <span style={{ fontSize: 13.5, lineHeight: '20px', color: 'var(--cth-ink-700)' }}>
          {status.state === 'downloaded'
            ? t('updateToast.restartWhenever')
            : t('updateToast.manualOnly')}
        </span>

        {notes.length > 0 && (
          // The notes are the reason this dialog exists, so they get a panel of
          // their own rather than sitting loose under the paragraph: a tinted
          // ground, a hairline ring, and a heading that reads as a label. The
          // markers are flex-shrink: 0 — without it a long line pushed the ▸ onto
          // its own row and every bullet looked like two.
          <div style={{
            background: 'var(--cth-cream-100)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
            borderRadius: 'var(--cth-radius-card)',
            padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 10
          }}>
            <div style={{
              fontFamily: 'var(--cth-font-ui)', fontWeight: 700, fontSize: 11, lineHeight: '12px',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--cth-ink-500)'
            }}>
              {t('updateToast.whatsNew')}
            </div>
            <ul style={{
              listStyle: 'none', margin: 0, padding: 0,
              display: 'flex', flexDirection: 'column', gap: 8
            }}>
              {notes.map((line, i) => (
                <li key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 9,
                  fontSize: 13.5, lineHeight: '20px', color: 'var(--cth-ink-900)'
                }}>
                  <span aria-hidden style={{
                    flexShrink: 0, marginTop: 6,
                    width: 6, height: 6,
                    background: 'var(--cth-mint)',
                    boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
                  }} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {status.state === 'downloaded' && !offerRestartInDialog(agents) && (
          <div style={{
            fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-700)',
            background: 'var(--cth-lemon-light)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
            borderRadius: 'var(--cth-radius-input)',
            padding: '8px 10px'
          }}>
            {t('updateToast.agentsWorking', { names: nameList(working, t('updateToast.and')) })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          {/* Read more was an underlined word in a paragraph and read as prose.
              It is a button now, on the far side of the footer from the actions
              that change something, because it only opens a page. */}
          <PixelButton variant="ghost" size="md" onClick={openRelease}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="web" />
              {t('updateToast.readMore')}
            </span>
          </PixelButton>
          <span style={{ flex: 1 }} />
          <PixelButton variant="secondary" size="md" onClick={() => setStatus(null)}>
            {t('updateToast.later')}
          </PixelButton>
          {status.state === 'downloaded' ? (
            offerRestartInDialog(agents) ? (
              <PixelButton variant="primary" size="md" onClick={() => setConfirming(true)} disabled={busy}>
                {busy ? t('updateToast.restarting') : t('updateToast.restartToUpdate')}
              </PixelButton>
            ) : null
          ) : (
            <PixelButton variant="primary" size="md" onClick={openRelease}>
              {hasDownload
                ? t('updateToast.downloadVersion', { version: status.version })
                : t('updateToast.openReleases')}
            </PixelButton>
          )}
        </div>
      </PixelPanel>

      {confirming && (
        <ConfirmDialog
          title={t('updateToast.confirmTitle')}
          body={working.length
            ? t('updateToast.confirmBodyWorking', { names: nameList(working, t('updateToast.and')) })
            : t('updateToast.confirmBodyIdle')}
          confirmLabel={t('updateToast.restartToUpdate')}
          destructive
          onCancel={() => setConfirming(false)}
          onConfirm={() => { setConfirming(false); void restart(); }}
        />
      )}
    </div>
  );
}
