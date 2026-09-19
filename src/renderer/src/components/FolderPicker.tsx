import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
 * So this browses the SERVER's filesystem, over the same root-confined
 * `fs:listDir` the files tab uses, and answers with the exact shape the native
 * dialog does — `{ ok, path, paths }` — so no caller knows the difference.
 *
 * WHAT A NATIVE PICKER GIVES YOU FOR FREE, and this has to build: somewhere to
 * start (the places rail), a way back up that is not the breadcrumb, a filter
 * for a folder with two hundred children, and — when several may be picked —
 * selecting a row without also entering it. That last one is why a row is a
 * checkbox plus a separate "go in" control rather than one button doing both.
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

const parentOf = (dir: string): string => {
  const parts = dir.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `/${parts.join('/')}` : '/';
};

const baseName = (dir: string): string => dir.split('/').filter(Boolean).pop() ?? '/';

/** The path as a person would write it: `~` for home, which is both shorter and
 *  the form they typed it in everywhere else in the app. */
const short = (dir: string, home: string): string =>
  home && (dir === home || dir.startsWith(`${home}/`)) ? `~${dir.slice(home.length)}` : dir;

/** Mounted once, near the root. Draws nothing until something asks for a folder. */
export function FolderPickerHost() {
  const { t } = useTranslation();
  const [ask, setAsk] = useState<{ multi: boolean; resolve: (r: FolderChoice) => void } | undefined>();
  const [home, setHome] = useState('');
  // The projects this install already works on. They belong in the rail: the
  // folder you want is nearly always one of them or inside one — adding a
  // sub-repo of a project meant walking down from home every time.
  const [projects, setProjects] = useState<string[]>([]);
  const [dir, setDir] = useState('/');
  const [rows, setRows] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    opener = (multi: boolean) => new Promise<FolderChoice>((resolve) => {
      setPicked([]); setFilter(''); setError('');
      setAsk({ multi, resolve });
      // Start at home: what anyone is looking for is under it, and the server's
      // home is not something the page can work out for itself.
      void window.cth.homeDir().then((h) => { setHome(h || '/'); setDir(h || '/'); }).catch(() => setDir('/'));
      void window.cth.getConfig()
        .then((c) => setProjects((c?.registeredRepos ?? []).filter(Boolean)))
        .catch(() => { /* no config: the rail is just the standard places */ });
    });
    return () => { opener = null; };
  }, []);

  /** Subdirectories of `abs`. Root-confined at `/`: the confinement that matters
   *  here is the app's own reach, not a sandbox within it. */
  const load = useCallback(async (abs: string) => {
    setLoading(true); setError('');
    const res = await window.cth.listDir('/', abs).catch((e: unknown) => ({ ok: false as const, error: String(e) }));
    setLoading(false);
    if (!res.ok) { setRows([]); setError(res.error ?? 'could not read that folder'); return; }
    // Directories only, and not the dotted ones: this picks a place to work, and
    // every cache and config folder in front of that is noise.
    setRows(res.entries.filter((e) => e.isDir && !e.name.startsWith('.')).map((e) => e.name));
  }, []);

  useEffect(() => { if (ask) void load(dir); }, [ask, dir, load]);
  useEffect(() => { setFilter(''); listRef.current?.scrollTo({ top: 0 }); }, [dir]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? rows.filter((n) => n.toLowerCase().includes(q)) : rows;
  }, [rows, filter]);

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

  // Home, and the handful under it people actually keep code in. Anything
  // missing is simply not offered — the tree is still there to walk.
  const places: Array<{ label: string; path: string; group?: string }> = [
    ...(home ? [
      { label: t('folderPicker.home'), path: home },
      { label: 'Desktop', path: `${home}/Desktop` },
      { label: 'Documents', path: `${home}/Documents` },
      { label: 'Atlas', path: `${home}/Atlas` }
    ] : []),
    // Projects last and labelled, so the rail reads as "the usual places, then
    // the things you actually work on" rather than one undifferentiated list.
    ...projects.map((p, i) => ({
      label: p.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? p,
      path: p,
      group: i === 0 ? t('folderPicker.projects') : undefined
    }))
  ];

  return (
    <div
      onClick={() => close({ ok: false, error: 'cancelled' })}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(26, 19, 32, 0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 950, padding: 24
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close({ ok: false, error: 'cancelled' });
          // Alt-← is "back" everywhere else a folder is browsed.
          if (e.key === 'ArrowLeft' && e.altKey && dir !== '/') setDir(parentOf(dir));
        }}
        style={{ width: 660, maxWidth: '96vw' }}
      >
        <PixelPanel variant="dialog" title={t(ask.multi ? 'folderPicker.titleMulti' : 'folderPicker.title')} noPadding>
          <div style={{ display: 'flex', flexDirection: 'column' }}>

            {/* WHERE YOU ARE — up, then the path, each crumb a way back. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              borderBottom: '1px solid var(--cth-ink-300)'
            }}>
              <button
                onClick={() => setDir(parentOf(dir))}
                disabled={dir === '/'}
                title={t('folderPicker.up')}
                aria-label={t('folderPicker.up')}
                style={{ ...iconBtn, opacity: dir === '/' ? 0.35 : 1, cursor: dir === '/' ? 'default' : 'pointer' }}
              >
                <Icon name="arrow-up" />
              </button>
              <div style={{
                flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1,
                fontFamily: 'var(--cth-font-mono)', fontSize: 12
              }}>
                <button onClick={() => setDir('/')} style={crumb}>/</button>
                {segments.map((seg, i) => {
                  const last = i === segments.length - 1;
                  return (
                    <button
                      key={`${seg}-${i}`}
                      onClick={() => setDir(`/${segments.slice(0, i + 1).join('/')}`)}
                      style={{ ...crumb, color: last ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)', fontWeight: last ? 600 : 400 }}
                    >
                      {seg}{!last && <span style={{ color: 'var(--cth-ink-300)' }}>/</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', minHeight: 320 }}>

              {/* PLACES — somewhere to start, which is the one thing a bare tree
                  cannot give you. */}
              {places.length > 0 && (
                <div style={{
                  width: 150, flexShrink: 0, padding: 8, display: 'flex', flexDirection: 'column', gap: 1,
                  borderRight: '1px solid var(--cth-ink-300)', background: 'var(--cth-paper-100)'
                }}>
                  {places.map((p) => {
                    const on = dir === p.path;
                    return (
                      <div key={`w-${p.path}`}>
                      {p.group && (
                        <div style={{
                          margin: '10px 0 4px', padding: '0 8px',
                          fontFamily: 'var(--cth-font-ui)', fontSize: 10.5, fontWeight: 700,
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                          color: 'var(--cth-ink-400, var(--cth-ink-500))'
                        }}>{p.group}</div>
                      )}
                      <button
                        onClick={() => setDir(p.path)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
                          background: on ? 'var(--cth-sky-light)' : 'transparent',
                          border: 'none', borderRadius: 'var(--cth-radius-input)', cursor: 'pointer',
                          textAlign: 'left', fontFamily: 'var(--cth-font-ui)', fontSize: 13,
                          fontWeight: on ? 600 : 400, color: 'var(--cth-ink-900)'
                        }}
                      >
                        <Icon name="folder" />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                      </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                {/* FILTER — a home directory with sixty children is a scroll,
                    and the name is always known before the position is. */}
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--cth-ink-300)' }}>
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={t('folderPicker.filter')}
                    spellCheck={false}
                    style={{
                      width: '100%', font: 'inherit', fontSize: 13, padding: '6px 8px',
                      background: 'var(--cth-cream-50)', border: 'none',
                      boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                      borderRadius: 'var(--cth-radius-input)', color: 'var(--cth-ink-900)'
                    }}
                  />
                </div>

                <div ref={listRef} style={{ flex: 1, height: 272, overflowY: 'auto', padding: 4 }}>
                  {loading && <div style={empty}>{t('folderPicker.loading')}</div>}
                  {!loading && error && <div style={{ ...empty, color: 'var(--cth-coral)' }}>{error}</div>}
                  {!loading && !error && shown.length === 0 && (
                    <div style={empty}>{filter ? t('folderPicker.noMatch') : t('folderPicker.noFolders')}</div>
                  )}
                  {!loading && !error && shown.map((name) => {
                    const abs = join(name);
                    const on = picked.includes(abs);
                    return (
                      <div
                        key={name}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, paddingRight: 4,
                          background: on ? 'var(--cth-sky-light)' : 'transparent',
                          borderRadius: 'var(--cth-radius-input)'
                        }}
                      >
                        {/* Selecting and entering are different intentions, so
                            they are different targets. One button for both is
                            what makes a multi-select picker feel broken. */}
                        <button
                          onClick={() => (ask.multi ? toggle(abs) : setDir(abs))}
                          aria-pressed={ask.multi ? on : undefined}
                          style={{
                            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 9,
                            padding: '8px 8px', background: 'transparent', border: 'none',
                            cursor: 'pointer', textAlign: 'left',
                            fontFamily: 'var(--cth-font-mono)', fontSize: 13,
                            color: 'var(--cth-ink-900)', fontWeight: on ? 600 : 400
                          }}
                        >
                          {ask.multi && (
                            <span
                              aria-hidden
                              style={{
                                width: 15, height: 15, flexShrink: 0, display: 'grid', placeItems: 'center',
                                background: on ? 'var(--cth-sky)' : 'var(--cth-cream-50)',
                                boxShadow: `inset 0 0 0 1px ${on ? 'var(--cth-sky)' : 'var(--cth-ink-300)'}`,
                                borderRadius: 3, color: '#fff'
                              }}
                            >
                              {on && <Icon name="check" style={{ width: 11, height: 11 }} />}
                            </span>
                          )}
                          <Icon name="folder" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        </button>
                        <button
                          onClick={() => setDir(abs)}
                          title={t('folderPicker.open', { name })}
                          aria-label={t('folderPicker.open', { name })}
                          style={iconBtn}
                        >
                          <Icon name="arrow-right" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* WHAT PRESSING THE BUTTON WILL DO, in the words of the thing it
                will do it to. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderTop: '1px solid var(--cth-ink-300)'
            }}>
              {/* Say what the button will take, in the words of the thing it
                  will take: the names when several are ticked, otherwise the
                  path you are standing in. */}
              <span style={{
                flex: 1, minWidth: 0, fontSize: 12,
                fontFamily: picked.length > 0 || !ask.multi ? 'var(--cth-font-mono)' : undefined,
                color: 'var(--cth-ink-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {ask.multi && picked.length > 0 ? picked.map((p) => baseName(p)).join(', ') : short(dir, home)}
              </span>
              <PixelButton variant="ghost" size="sm" onClick={() => close({ ok: false, error: 'cancelled' })}>
                {t('folderPicker.cancel')}
              </PixelButton>
              <PixelButton variant="primary" size="sm" onClick={confirm}>
                {ask.multi
                  ? (picked.length > 0 ? t('folderPicker.addSelected', { count: picked.length }) : t('folderPicker.addThis'))
                  : t('folderPicker.use')}
              </PixelButton>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

const crumb: CSSProperties = {
  background: 'none', border: 'none', padding: '2px 1px', cursor: 'pointer', font: 'inherit'
};

const iconBtn: CSSProperties = {
  width: 26, height: 26, flexShrink: 0, display: 'grid', placeItems: 'center',
  background: 'transparent', border: 'none', borderRadius: 'var(--cth-radius-input)',
  cursor: 'pointer', color: 'var(--cth-ink-500)'
};

const empty: CSSProperties = { padding: 16, fontSize: 13, color: 'var(--cth-ink-500)' };
