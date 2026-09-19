import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { Icon } from './Icon';
import type { HarnessConfig } from '@/store/config';
import { useNativeDialog } from '@/hooks/useNativeDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { suggestWorkspaceName, workspacePath, cleanWorkspaceName, WORKSPACE_ROOT } from '@shared/workspaceName';

export interface HivePickerProps {
  config: HarnessConfig;
  /** Open the CURRENT harness home in-place (no relaunch). */
  onOpenCurrent: () => void;
}

// Set right before a hive SWITCH so App skips this picker once after the relaunch
// changeHome triggers — otherwise the user would land back on the picker for the
// hive they just chose. App.tsx reads + clears it on mount.
const SKIP_KEY = 'cth.skipHivePickerOnce';

function folderName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

/** The two square buttons at the end of a recent row. Quiet until hovered —
 *  they sit next to the row you click to OPEN a workspace, and neither of them
 *  should read as the primary thing to do. */
const rowAction: CSSProperties = {
  width: 28, height: 28, flexShrink: 0,
  display: 'grid', placeItems: 'center',
  background: 'transparent', border: 'none', borderRadius: 'var(--cth-radius-input)',
  cursor: 'pointer', color: 'var(--cth-ink-500)'
};

/** Everything above the folder, for the muted second line. */
function parentPath(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/');
  return parts.slice(0, -1).join('/') || '/';
}

/**
 * HivePicker — the launch-time workspace selector. A "hive" is a harness home
 * folder: its own agents, memory, tasks, and history. On reopen the user can open
 * the hive they were in (fast, in-place), jump to a recent one, browse to an
 * existing folder, or start a new one. Switching to a DIFFERENT home goes through
 * changeHome('fresh'), which tears down services and relaunches against it — so
 * every switch is a clean process restart (cheap here, before any work is live).
 */
export function HivePicker({ config, onOpenCurrent }: HivePickerProps) {
  const current = config.harnessHome;
  const listed = (config.recentHives ?? []).filter((h) => h && h !== current);
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  // Rows the user has just removed or deleted. `config` is a snapshot handed
  // down by App, so it does not change under us when main rewrites recentHives.
  const [gone, setGone] = useState<string[]>([]);
  // The workspace awaiting confirmation, and whether confirming it also resets
  // the app (true for the OPEN workspace, which cannot be deleted under itself).
  const [confirming, setConfirming] = useState<{ path: string; reset: boolean } | undefined>();
  const recents = listed.filter((h) => !gone.includes(h));
  // The new-workspace NAME, or undefined when the form is closed. A name, not a
  // path: new workspaces are folders in one root, so the only decision left is
  // what to call this one. The root is shown beside the field, not hidden.
  const [newName, setNewName] = useState<string | undefined>();
  const newFolder = newName === undefined ? '' : cleanWorkspaceName(newName);

  /** Stop listing a workspace. The folder is untouched. */
  const forget = async (path: string) => {
    setError(undefined);
    setGone((g) => [...g, path]);
    const res = await window.cth.forgetWorkspace(path);
    if (!res.ok) { setGone((g) => g.filter((p) => p !== path)); setError(res.error); }
  };

  /** Delete a workspace's crew. The open one goes through resetAll instead,
   *  which tears its services down in order and relaunches into setup. */
  const destroy = async ({ path, reset }: { path: string; reset: boolean }) => {
    setConfirming(undefined);
    setError(undefined);
    if (reset) { await window.cth.resetAll(); return; } // never returns — the app relaunches
    setBusy(path);
    try {
      const res = await window.cth.deleteWorkspace(path);
      if (res.ok) setGone((g) => [...g, path]);
      else setError(res.error ?? t('hivePicker.deleteFailed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(undefined); }
  };

  // Open a hive. Same folder as the current one → just enter it (no relaunch).
  // A different folder → changeHome('fresh') re-points + relaunches the process.
  const openHive = async (path: string) => {
    if (!path) return;
    if (current && path === current) { onOpenCurrent(); return; }
    setError(undefined);
    setBusy(path);
    try {
      window.localStorage.setItem(SKIP_KEY, '1');
      const res = await window.cth.changeHome(path, 'fresh');
      // Success never returns (the process relaunches). A return means an error.
      if (!res.ok) {
        window.localStorage.removeItem(SKIP_KEY);
        setError(res.error ?? t('hivePicker.openFailed'));
        setBusy(undefined);
      }
    } catch (e) {
      window.localStorage.removeItem(SKIP_KEY);
      setError(e instanceof Error ? e.message : String(e));
      setBusy(undefined);
    }
  };

  const [browsing, browse] = useNativeDialog(async () => {
    setError(undefined);
    const res = await window.cth.chooseFolder();
    if (res.ok) void openHive(res.path);
    else if (res.error !== 'cancelled') setError(res.error);
  });

  return (
    <div className="cth-ground" style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
      padding: 32
    }}>
      <div style={{ width: 560, maxWidth: '94vw' }}>
        <PixelPanel variant="dialog" title={t('hivePicker.title')} noPadding>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--cth-ink-700)' }}>
              {t('hivePicker.blurb')}
            </p>

            {/* CURRENT — the last-used home, the one-click default. */}
            {current && (
              <div>
                <div style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, letterSpacing: 1, color: 'var(--cth-ink-500)', marginBottom: 6 }}>
                  {t('hivePicker.current')}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  background: 'var(--cth-sky-light)', boxShadow: 'inset 0 0 0 2px var(--cth-sky)'
                }}>
                  <span style={{
                    width: 32, height: 32, flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', borderRadius: 'var(--cth-radius-input)'
                  }}>
                    <Icon name="folder" />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 14, lineHeight: '19px',
                    }}>
                      {folderName(current)}
                    </div>
                    <div style={{
                      // ink-700, not ink-500: this card is the sky-tinted one, and
                      // the quieter step measured 4.13:1 on that tint in dark.
                      fontFamily: 'var(--cth-font-mono)', fontSize: 13, color: 'var(--cth-ink-700)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                      // NOT `direction: rtl`. That truncates a long path from the
                      // START, which is what you want, but it also REORDERS the
                      // string: "~/atlas-data" rendered as "atlas-data/~".
                    }}>{parentPath(current)}</div>
                  </div>
                  <PixelButton variant="primary" size="md" onClick={onOpenCurrent} disabled={!!busy}>
                    {t('hivePicker.open')}
                  </PixelButton>
                  {/* Beside Open, like every recent row's bin — the actions for a
                      workspace belong on its own card. This one cannot delete in
                      place (its router and terminals are live), so it runs the
                      app's reset; the dialog says so before anything happens. */}
                  <button
                    onClick={() => setConfirming({ path: current, reset: true })}
                    disabled={!!busy}
                    title={t('hivePicker.deleteOpen')}
                    aria-label={t('hivePicker.deleteOpen')}
                    style={{ ...rowAction, color: 'var(--cth-coral)' }}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            )}

            {/* RECENTS — other homes this install has opened before. */}
            {recents.length > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, letterSpacing: 1, color: 'var(--cth-ink-500)', marginBottom: 6 }}>
                  {t('hivePicker.recent')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                  {recents.map((h) => (
                    <div
                      key={h}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                        borderRadius: 'var(--cth-radius-input)', paddingRight: 8,
                        opacity: busy && busy !== h ? 0.5 : 1
                      }}
                    >
                      <button
                        onClick={() => openHive(h)}
                        disabled={!!busy}
                        style={{
                          flex: 1, minWidth: 0,
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px',
                          background: 'transparent', border: 'none',
                          cursor: busy ? 'default' : 'pointer', textAlign: 'left'
                        }}
                      >
                        <Icon name="folder" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--cth-ink-900)' }}>
                            {folderName(h)}
                          </div>
                          <div style={{
                            fontFamily: 'var(--cth-font-mono)', fontSize: 13, color: 'var(--cth-ink-500)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                          }}>{parentPath(h)}</div>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--cth-ink-500)', flexShrink: 0 }}>
                          {busy === h ? 'opening…' : 'switch →'}
                        </span>
                      </button>
                      {/* Two different actions, and the difference matters: one
                          stops listing a folder, the other erases the crew in it. */}
                      <button
                        onClick={() => void forget(h)}
                        disabled={!!busy}
                        title={t('hivePicker.remove')}
                        aria-label={`${t('hivePicker.remove')}: ${folderName(h)}`}
                        style={rowAction}
                      >
                        <Icon name="x" />
                      </button>
                      <button
                        onClick={() => setConfirming({ path: h, reset: false })}
                        disabled={!!busy}
                        title={t('hivePicker.delete')}
                        aria-label={`${t('hivePicker.delete')}: ${folderName(h)}`}
                        style={{ ...rowAction, color: 'var(--cth-coral)' }}
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div style={{
                padding: '10px 16px', background: 'var(--cth-coral-light)',
                boxShadow: 'inset 0 0 0 1px var(--cth-coral)', borderRadius: 'var(--cth-radius-input)', fontSize: 13, color: 'var(--cth-ink-900)'
              }}>{error}</div>
            )}

            {busy && (
              <div style={{ fontSize: 13, color: 'var(--cth-ink-500)' }}>
                Opening {folderName(busy)}. The app will reload.
              </div>
            )}

            {/* NEW — a path, typed. It used to open the same folder picker "Open
                another folder" does, which made two buttons that did one thing;
                it also made a new workspace impossible in the browser, where
                there is no native picker at all. `changeHome(…, 'fresh')`
                creates the folder if it is not there. */}
            {newName !== undefined && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8, padding: 12,
                background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                borderRadius: 'var(--cth-radius-input)'
              }}>
                <label style={{ fontFamily: 'var(--cth-font-ui)', fontWeight: 600, fontSize: 11, letterSpacing: 1, color: 'var(--cth-ink-500)' }}>
                  {t('hivePicker.newLabel')}
                </label>
                {/* The root is a label, not editable text: every new workspace
                    is a folder in it, and that is the thing being made simpler.
                    "Open another folder" is still there for anywhere else. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <span style={{
                    fontFamily: 'var(--cth-font-mono)', fontSize: 13, color: 'var(--cth-ink-500)',
                    padding: '8px 2px 8px 10px', background: 'var(--cth-cream-50)',
                    boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                    borderRadius: 'var(--cth-radius-input) 0 0 var(--cth-radius-input)',
                    whiteSpace: 'nowrap'
                  }}>{WORKSPACE_ROOT}/</span>
                  <input
                    value={newName}
                    autoFocus
                    spellCheck={false}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newFolder) void openHive(workspacePath(newName));
                      if (e.key === 'Escape') setNewName(undefined);
                    }}
                    style={{
                      flex: 1, minWidth: 0,
                      font: 'inherit', fontFamily: 'var(--cth-font-mono)', fontSize: 13,
                      padding: '8px 10px 8px 2px', background: 'var(--cth-cream-50)',
                      border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                      borderRadius: '0 var(--cth-radius-input) var(--cth-radius-input) 0',
                      color: 'var(--cth-ink-900)'
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('hivePicker.newHint')}</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <PixelButton variant="ghost" size="sm" onClick={() => setNewName(undefined)} disabled={!!busy}>
                    {t('hivePicker.cancel')}
                  </PixelButton>
                  <PixelButton
                    variant="primary"
                    size="sm"
                    onClick={() => void openHive(workspacePath(newName))}
                    disabled={!!busy || !newFolder}
                  >
                    {t('hivePicker.create')}
                  </PixelButton>
                </div>
              </div>
            )}

            {/* OPEN — browse to a folder that already exists. "fresh" mode
                re-points at it, reusing any hive data it already holds. */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <PixelButton variant="secondary" size="md" onClick={browse} disabled={!!busy || browsing}>
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <Icon name="folder" /> {t('hivePicker.openAnother')}
                </span>
              </PixelButton>
              <PixelButton
                variant="secondary"
                size="md"
                onClick={() => setNewName(suggestWorkspaceName([...(current ? [current] : []), ...recents]))}
                disabled={!!busy || browsing}
              >
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <Icon name="plus" /> {t('hivePicker.newWorkspace')}
                </span>
              </PixelButton>
            </div>
          </div>
        </PixelPanel>
      </div>

      {confirming && (
        <ConfirmDialog
          title={t(confirming.reset ? 'hivePicker.resetTitle' : 'hivePicker.deleteTitle')}
          body={t(confirming.reset ? 'hivePicker.resetBody' : 'hivePicker.deleteBody', { name: folderName(confirming.path) })}
          confirmLabel={t(confirming.reset ? 'hivePicker.resetConfirm' : 'hivePicker.deleteConfirm')}
          destructive
          onCancel={() => setConfirming(undefined)}
          onConfirm={() => void destroy(confirming)}
        />
      )}
    </div>
  );
}
