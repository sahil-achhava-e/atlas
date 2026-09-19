import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { Icon } from './Icon';

/**
 * A folder picker for browser mode.
 *
 * Every "pick a folder" button calls `chooseFolder`, which opens a native dialog
 * from the main process. A browser tab has no window to hang that off, and the
 * browser's own directory picker is no use either: it hands back a handle to a
 * folder on the VIEWER's machine and never an absolute path, while the agents
 * run on the machine serving the page.
 *
 * So the picker browses the SERVER's filesystem, over the same root-confined
 * `fs:listDir` the file tab uses. It answers with the exact shape the native
 * dialog does — `{ ok, path, paths }` — so no caller knows the difference, and
 * multi-select stays multi-select.
 *
 * The desktop app never installs this. It has a real dialog.
 */

export interface FolderChoice { ok: boolean; path?: string; paths?: string[]; error?: string }

/** The live picker, registered by the host below. Module scope because the
 *  caller is `window.cth.chooseFolder`, which is not inside React. */
let opener: ((multi: boolean) => Promise<FolderChoice>) | null = null;

export function installBrowserFolderPicker(): void {
  const cth = window.cth as unknown as { isServerMode?: boolean; chooseFolder?: unknown };
  if (!cth?.isServerMode) return;
  cth.chooseFolder = (opts?: { multi?: boolean }): Promise<FolderChoice> =>
    opener ? opener(!!opts?.multi) : Promise.resolve({ ok: false, error: 'cancelled' });
}

/** Mounted once, near the root. Draws nothing until something asks for a folder. */
export function FolderPickerHost() {
  const { t } = useTranslation();
  const [ask, setAsk] = useState<{ multi: boolean; resolve: (r: FolderChoice) => void } | undefined>();
  const [dir, setDir] = useState('/');
  const [rows, setRows] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    opener = (multi: boolean) => new Promise<FolderChoice>((resolve) => {
      setPicked([]);
      setError('');
      setAsk({ multi, resolve });
      // Start at home: the folders anyone is looking for are under it, and the
      // server's home is not something the page can work out for itself.
      void window.cth.homeDir().then((h) => setDir(h || '/')).catch(() => setDir('/'));
    });
    return () => { opener = null; };
  }, []);

  /** Subdirectories of `dir`. Root-confined at `/`, which is every path on this
   *  machine — the confinement that matters here is the app's own, not a sandbox. */
  const load = useCallback(async (abs: string) => {
    setLoading(true);
    setError('');
    const res = await window.cth.listDir('/', abs).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
    setLoading(false);
    if (!res.ok) { setRows([]); setError(res.error ?? 'could not read that folder'); return; }
    // Directories only, and not the dotted ones: this picks a place to work, and
    // a list of every cache and config folder is noise in front of that.
    setRows(res.entries.filter((e) => e.isDir && !e.name.startsWith('.')).map((e) => e.name));
  }, []);

  useEffect(() => { if (ask) void load(dir); }, [ask, dir, load]);

  if (!ask) return null;

  const close = (res: FolderChoice) => { ask.resolve(res); setAsk(undefined); };
  const join = (name: string) => (dir.endsWith('/') ? dir + name : `${dir}/${name}`);
  const segments = dir.split('/').filter(Boolean);
  const toggle = (abs: string) =>
    setPicked((p) => (p.includes(abs) ? p.filter((x) => x !== abs) : [...p, abs]));

  const confirm = () => {
    const paths = ask.multi && picked.length > 0 ? picked : [dir];
    close({ ok: true, path: paths[0], paths });
  };

  return (
    <div
      onClick={() => close({ ok: false, error: 'cancelled' })}
      onKeyDown={(e) => { if (e.key === 'Escape') close({ ok: false, error: 'cancelled' }); }}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(26, 19, 32, 0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 950
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: '94vw' }}>
        <PixelPanel variant="dialog" title={t(ask.multi ? 'folderPicker.titleMulti' : 'folderPicker.title')} noPadding>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Where you are. Each crumb is a button, which is also how you go up. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, fontFamily: 'var(--cth-font-mono)', fontSize: 12 }}>
              <button onClick={() => setDir('/')} style={crumb}>/</button>
              {segments.map((seg, i) => (
                <button key={`${seg}-${i}`} onClick={() => setDir(`/${segments.slice(0, i + 1).join('/')}`)} style={crumb}>
                  {seg}<span style={{ color: 'var(--cth-ink-300)' }}>/</span>
                </button>
              ))}
            </div>

            <div style={{
              height: 260, overflowY: 'auto',
              background: 'var(--cth-cream-50)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
              borderRadius: 'var(--cth-radius-input)'
            }}>
              {loading && <div style={empty}>{t('folderPicker.loading')}</div>}
              {!loading && error && <div style={{ ...empty, color: 'var(--cth-coral)' }}>{error}</div>}
              {!loading && !error && rows.length === 0 && <div style={empty}>{t('folderPicker.noFolders')}</div>}
              {!loading && !error && rows.map((name) => {
                const abs = join(name);
                const on = picked.includes(abs);
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px' }}>
                    {ask.multi && (
                      <input
                        type="checkbox"
                        checked={on}
                        aria-label={name}
                        onChange={() => toggle(abs)}
                        style={{ width: 14, height: 14, accentColor: 'var(--cth-sky)', cursor: 'pointer' }}
                      />
                    )}
                    <button
                      onClick={() => setDir(abs)}
                      style={{
                        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 4px', background: 'transparent', border: 'none',
                        cursor: 'pointer', textAlign: 'left',
                        fontFamily: 'var(--cth-font-mono)', fontSize: 13,
                        color: on ? 'var(--cth-ink-900)' : 'var(--cth-ink-700)', fontWeight: on ? 600 : 400
                      }}
                    >
                      <Icon name="folder" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--cth-ink-500)' }}>
                {ask.multi && picked.length > 0
                  ? t('folderPicker.selected', { count: picked.length })
                  : t('folderPicker.willUse', { name: segments[segments.length - 1] ?? '/' })}
              </span>
              <PixelButton variant="ghost" size="sm" onClick={() => close({ ok: false, error: 'cancelled' })}>
                {t('folderPicker.cancel')}
              </PixelButton>
              <PixelButton variant="primary" size="sm" onClick={confirm}>
                {ask.multi && picked.length > 0 ? t('folderPicker.addSelected', { count: picked.length }) : t('folderPicker.use')}
              </PixelButton>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

const crumb: React.CSSProperties = {
  background: 'none', border: 'none', padding: '2px 1px', cursor: 'pointer',
  font: 'inherit', color: 'var(--cth-ink-700)'
};

const empty: React.CSSProperties = {
  padding: 16, fontSize: 13, color: 'var(--cth-ink-500)'
};
